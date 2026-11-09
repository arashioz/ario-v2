import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InvoicesService } from '../invoices/invoices.service';
import { MellatService, mellatLabel } from './mellat.service';
import {
  MellatCounter,
  MellatCounterDocument,
  MellatPayment,
  MellatPaymentDocument,
} from './schemas/mellat-payment.schema';
import type { CreateMellatPaymentDto } from './dto/create-mellat-payment.dto';

/** The fields the gateway POSTs back to callBackUrl (document, table 10). */
export interface MellatCallbackBody {
  RefId?: string;
  ResCode?: string;
  SaleOrderId?: string | number;
  SaleReferenceId?: string | number;
  CardHolderPan?: string;
  FinalAmount?: string | number;
  [key: string]: any;
}

export interface MellatLaunch {
  paymentId: string;
  orderId: number;
  refId: string;
  amountToman: number;
  payPageUrl: string;
  mobileNo: string;
  merchantName: string;
}

/**
 * Drives the Mellat IPG sale flow and writes the result into the shop's books:
 *
 *   bpPayRequest → the customer pays on the bank page → callback (POST)
 *     → bpVerifyRequest → bpSettleRequest → invoices.addPayment (customer ledger + cashbox)
 *
 * Every step is idempotent: a repeated callback can never pay the same invoice twice.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');

  constructor(
    @InjectModel(MellatPayment.name) private readonly payments: Model<MellatPaymentDocument>,
    @InjectModel(MellatCounter.name) private readonly counters: Model<MellatCounterDocument>,
    private readonly mellat: MellatService,
    private readonly invoices: InvoicesService,
    private readonly config: ConfigService,
  ) {}

  private gatewayEnabled(): void {
    if (!this.mellat.enabled) {
      throw new ServiceUnavailableException(
        'درگاه اینترنتی بانک ملت فعال نیست. در .env مقادیر MELLAT_ENABLED=true و سه کلید پایانه را ستانید.',
      );
    }
  }

  /** Bank rule: the number handed to bpPayRequest must be unique for every single request. */
  private async nextOrderId(): Promise<number> {
    const doc = await this.counters
      .findOneAndUpdate({ key: 'order' }, { $inc: { seq: 1 } }, { new: true, upsert: true })
      .lean();
    return Number(doc?.seq) || 1;
  }

  private origin(req?: any): string {
    const configured = String(this.config.get('PUBLIC_APP_URL') || '').trim().replace(/\/+$/, '');
    if (configured) return configured;
    if (!req) return 'http://localhost:3000';
    const proto = String(req.headers?.['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
    const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || 'localhost:3000');
    return `${proto}://${host}`;
  }

  /**
   * Must live under the domain registered with Beh-Pardakht (document: otherwise code 62), so it is
   * derived from the incoming request unless MELLAT_CALLBACK_URL / PUBLIC_APP_URL is set.
   */
  private callbackUrl(req?: any): string {
    const explicit = String(this.config.get('MELLAT_CALLBACK_URL') || '').trim();
    if (explicit) return explicit;
    return `${this.origin(req)}/api/payments/mellat/callback`;
  }

  get capabilities(): {
    enabled: boolean;
    configured: boolean;
    terminalId: string;
    payPageUrl: string;
    currency: string;
  } {
    return {
      ...this.mellat.status,
      currency: String(this.config.get('MELLAT_CURRENCY') || 'rials'),
    };
  }

  /** Where the customer's browser lands after the bank has POSTed us the result. */
  returnUrl(req: any, result: { ok: boolean; orderId?: number; message?: string }): string {
    const base = String(this.config.get('MELLAT_RETURN_URL') || '').trim().replace(/\/+$/, '');
    const url = new URL(base || `${this.origin(req)}/tabs/invoices`);
    if (result.orderId) url.searchParams.set('mellatOrder', String(result.orderId));
    url.searchParams.set('mellat', result.ok ? 'ok' : 'fail');
    if (result.message) url.searchParams.set('mellatMsg', result.message);
    return url.toString();
  }

  /** Step 1: ask the bank for a RefId and hand the browser the fields it must POST. */
  async createForInvoice(
    invoiceId: string,
    dto: CreateMellatPaymentDto,
    actor: { name?: string; username?: string },
    req?: any,
  ): Promise<MellatLaunch> {
    this.gatewayEnabled();

    const invoice: any = await this.invoices.findById(invoiceId);
    if (invoice.type !== 'sale') {
      throw new BadRequestException('پرداخت اینترنتی فقط روی فاکتور فروش ممکن است');
    }
    const outstanding = Number(invoice.remainingDebt) || 0;
    const amountToman = Math.round(Number(dto.amount) || outstanding);
    if (amountToman <= 0) throw new BadRequestException('مبلغ نامعتبر است');
    if (amountToman > outstanding) {
      throw new BadRequestException(`مبلغ از مانده فاکتور (${outstanding}) بیشتر است`);
    }

    const orderId = await this.nextOrderId();
    const callBackUrl = this.callbackUrl(req);
    const digits = String(dto.mobileNo || invoice.customerPhone || '').replace(/\D/g, '');
    const mobileNo = digits ? `98${digits.replace(/^0+/, '')}`.slice(0, 13) : '';
    const description = String(
      dto.description || `پرداخت اینترنتی فاکتور ${invoice.invoiceNumber}`,
    ).slice(0, 500);

    const record = await this.payments.create({
      orderId,
      invoiceId: String(invoice._id),
      invoiceNumber: invoice.invoiceNumber || '',
      customerId: invoice.customerId || undefined,
      customerName: invoice.customerName || '',
      amountToman,
      gatewayAmount: this.mellat.toGatewayAmount(amountToman),
      terminalId: this.mellat.terminalId,
      callBackUrl,
      mobileNo,
      status: 'initiated',
      accountId: String(this.config.get('MELLAT_ACCOUNT_ID') || ''),
      recordedBy: actor?.name || actor?.username || 'درگاه بانک ملت',
      description,
    });

    try {
      const answer = await this.mellat.payRequest({
        orderId,
        amount: record.gatewayAmount,
        callBackUrl,
        mobileNo,
        additionalData: `${description} — ${record.amountToman} تومان`,
        cartItem: `فاکتور ${record.invoiceNumber}`,
      });

      if (answer.resCode !== '0' || !answer.refId) {
        record.status = 'failed';
        record.resCode = answer.resCode;
        record.resLabel = mellatLabel(answer.resCode);
        await record.save();
        throw new BadGatewayException(`درگاه ملت درخواست پرداخت را نپذیرفت: ${record.resLabel}`);
      }

      record.refId = answer.refId;
      record.resCode = answer.resCode;
      record.resLabel = mellatLabel('0');
      await record.save();

      return {
        paymentId: String(record._id),
        orderId,
        refId: record.refId,
        amountToman: record.amountToman,
        payPageUrl: this.mellat.payPageUrl,
        mobileNo: record.mobileNo,
        merchantName: String(this.config.get('MELLAT_MERCHANT_NAME') || 'فروشگاه آریو'),
      };
    } catch (err: any) {
      if (record.status === 'initiated') {
        record.status = 'failed';
        record.resLabel = err?.message || 'خطای نامشخص درگاه';
        await record.save().catch(() => undefined);
      }
      throw err;
    }
  }

  private async load(id: string): Promise<MellatPaymentDocument> {
    const record = await this.payments
      .findOne({ $or: [{ _id: id }, { orderId: Number(id) || -1 }, { refId: id }] })
      .exec();
    if (!record) throw new NotFoundException('تراکنش درگاه یافت نشد');
    return record;
  }

  private async fail(record: MellatPaymentDocument, resCode: string, label?: string): Promise<void> {
    record.status = 'failed';
    record.resCode = resCode;
    record.resLabel = label || mellatLabel(resCode);
    await record.save();
  }

  /** Steps 2 + 3 plus the shop's own bookkeeping. */
  private async confirm(record: MellatPaymentDocument, saleReferenceId: number): Promise<void> {
    const verified = await this.mellat.verify(record.orderId, record.orderId, saleReferenceId);
    record.resCode = verified.resCode;
    record.resLabel = mellatLabel(verified.resCode);
    record.saleReferenceId = String(saleReferenceId);

    if (!verified.ok) {
      record.status = 'failed';
      await record.save();
      if (verified.resCode !== '48') {
        // The bank may have taken money for a sale we are not going to honour → send it back.
        await this.mellat
          .reverse(record.orderId, record.orderId, saleReferenceId)
          .then(async (r) => {
            if (!r.ok) return;
            record.status = 'reversed';
            record.reversedAt = new Date();
            record.resLabel = `${record.resLabel} — وجه به مشتری برگشت داده شد`;
            await record.save();
          })
          .catch((err) => this.logger.error(`Mellat reversal failed for ${record.orderId}: ${err?.message}`));
      }
      throw new BadGatewayException(`تأیید تراکنش درگاه انجام نشد: ${record.resLabel}`);
    }

    record.status = 'verified';
    record.verifiedAt = new Date();
    await record.save();

    const settled = await this.mellat.settle(record.orderId, record.orderId, saleReferenceId);
    if (!settled.ok && settled.resCode !== '45') {
      record.resCode = settled.resCode;
      record.resLabel = `واریز انجام نشد: ${mellatLabel(settled.resCode)}`;
      await record.save();
      throw new BadGatewayException(record.resLabel);
    }

    record.status = 'settled';
    record.settledAt = new Date();
    record.resCode = settled.resCode;
    record.resLabel = mellatLabel(settled.resCode);
    await record.save();

    await this.book(record);
  }

  /** Writes the payment on the invoice (customer ledger / cashbox) — only once per transaction. */
  private async book(record: MellatPaymentDocument): Promise<void> {
    if (record.bookedAt) return;
    try {
      await this.invoices.addPayment(
        record.invoiceId,
        {
          amount: record.amountToman,
          paymentMethod: 'transfer',
          accountId: record.accountId || undefined,
          description: `پرداخت اینترنتی درگاه بانک ملت — ${record.refId} (کد پیگیری ${record.saleReferenceId})`,
          date: new Date().toISOString(),
        },
        record.recordedBy || 'درگاه بانک ملت',
      );
      record.bookedAt = new Date();
      await record.save();
    } catch (err: any) {
      // The bank has the money; tell a human instead of quietly losing the trail.
      this.logger.error(`Mellat ${record.orderId} settled but booking failed: ${err?.message || err}`);
      record.resLabel = `${record.resLabel} — ⚠ ثبت دستی در حساب مشتری لازم است`;
      await record.save();
    }
  }

  /**
   * Where the gateway POSTs the customer back (document table 10 + its security note): RefId and
   * SaleOrderId must be the exact pair we asked for, or the answer is dropped without verify.
   */
  async handleCallback(body: MellatCallbackBody): Promise<{ ok: boolean; message: string; orderId?: number }> {
    const refId = String(body.RefId || '').trim();
    const saleOrderId = Number(body.SaleOrderId || 0);
    const resCode = String(body.ResCode ?? '').trim();

    if (!refId && !saleOrderId) return { ok: false, message: 'بدون شناسه تراکنش' };

    const record = await this.payments.findOne(refId ? { refId } : { orderId: saleOrderId }).exec();
    if (!record) {
      this.logger.warn(`Mellat callback for unknown RefId=${refId} SaleOrderId=${saleOrderId}`);
      return { ok: false, message: 'تراکنش یافت نشد' };
    }

    record.callback = { ...body };
    record.callbackAt = new Date();
    record.cardHolderPan = String(body.CardHolderPan || '');
    record.resCode = resCode;
    record.resLabel = mellatLabel(resCode);

    if (record.refId !== refId || record.orderId !== saleOrderId) {
      await this.fail(record, resCode, 'اطلاعات بازگشتی با درخواست اصلی هم‌خوان نیست');
      return { ok: false, message: 'عدم تطابق RefId و شماره درخواست', orderId: record.orderId };
    }

    if (record.status === 'settled' || record.bookedAt) {
      await record.save();
      return { ok: true, message: 'این تراکنش پیش‌تر تسویه شده است', orderId: record.orderId };
    }

    const saleReferenceId = Number(body.SaleReferenceId || record.saleReferenceId || 0);
    if (resCode !== '0') {
      await record.save();
      // A non-zero answer still needs the verify round trip: it can come back as "verified"/"settled".
      return this.settleOutcome(record, saleReferenceId, mellatLabel(resCode));
    }
    if (!saleReferenceId) {
      await this.fail(record, resCode, 'کد مرجع تراکنش خرید ارسال نشده است');
      return { ok: false, message: record.resLabel, orderId: record.orderId };
    }
    return this.settleOutcome(record, saleReferenceId);
  }

  private async settleOutcome(
    record: MellatPaymentDocument,
    saleReferenceId: number,
    fallback?: string,
  ): Promise<{ ok: boolean; message: string; orderId?: number }> {
    if (!saleReferenceId) {
      await this.fail(record, record.resCode, 'کد مرجع تراکنش خرید ارسال نشده است');
      return { ok: false, message: record.resLabel, orderId: record.orderId };
    }
    try {
      await this.confirm(record, saleReferenceId);
      return { ok: true, message: 'پرداخت تأیید و به حساب فروشگاه واریز شد', orderId: record.orderId };
    } catch (err: any) {
      await record.save().catch(() => undefined);
      return {
        ok: false,
        message: err?.message || fallback || record.resLabel,
        orderId: record.orderId,
      };
    }
  }

  /** Recent gateway transactions, newest first. */
  async list(params: { invoiceId?: string; status?: string; limit?: number } = {}) {
    const filter: Record<string, any> = {};
    if (params.invoiceId) filter.invoiceId = params.invoiceId;
    if (params.status) filter.status = params.status;
    return this.payments
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(params.limit) || 50, 200))
      .lean();
  }

  async get(id: string) {
    const record = await this.load(id);
    return record.toJSON();
  }

  /**
   * bpInquiryRequest — the document's rescue when the verify answer never reached us.
   * Also closes the loop on a customer who opened the bank page and never came back.
   */
  async refresh(id: string) {
    const record = await this.load(id);
    if (record.status !== 'initiated' && record.status !== 'verified') return record.toJSON();

    if (!record.saleReferenceId) {
      // 20 minutes without a callback means the bank already auto-reversed it (document note).
      const startedAt = record.createdAt ? new Date(record.createdAt).getTime() : Date.now();
      if (Date.now() - startedAt > 20 * 60 * 1000) {
        await this.fail(record, '', 'مشتری پرداخت را انجام نداد (مهلت ۲۰ دقیقه‌ای درگاه تمام شد)');
      }
      return record.toJSON();
    }

    const answer = await this.mellat.inquiry(
      record.orderId,
      record.orderId,
      Number(record.saleReferenceId),
    );
    record.resCode = answer.resCode;
    record.resLabel = `استعلام: ${mellatLabel(answer.resCode)}`;
    await record.save();
    if (answer.ok) await this.confirm(record, Number(record.saleReferenceId));
    return record.toJSON();
  }

  /** Manual reversal while the sale is still unbooked. */
  async reverse(id: string) {
    const record = await this.load(id);
    if (record.bookedAt) throw new BadRequestException('این تراکنش ثبت شده است؛ از استرداد وجه استفاده کنید');
    const answer = await this.mellat.reverse(record.orderId, record.orderId, Number(record.saleReferenceId || 0));
    record.status = answer.ok ? 'reversed' : 'failed';
    record.reversedAt = answer.ok ? new Date() : null;
    record.resCode = answer.resCode;
    record.resLabel = mellatLabel(answer.resCode);
    await record.save();
    return record.toJSON();
  }

  /** bpRefundRequest — only after settlement. Every call needs its own fresh orderId. */
  async refund(id: string, amountToman: number, note = '') {
    const record = await this.load(id);
    if (record.status !== 'settled') {
      throw new BadRequestException('استرداد فقط برای تراکنش واریزشده ممکن است');
    }
    const amount = Math.round(Number(amountToman) || 0);
    const alreadyRefunded = (record.refunds || []).reduce((sum, r) => sum + (r.amountToman || 0), 0);
    if (amount <= 0) throw new BadRequestException('مبلغ نامعتبر است');
    if (alreadyRefunded + amount > record.amountToman) {
      throw new BadRequestException('مجموع استرداد از مبلغ تراکنش بیشتر می‌شود');
    }

    const refundOrderId = await this.nextOrderId();
    const answer = await this.mellat.refund({
      orderId: refundOrderId,
      saleOrderId: record.orderId,
      saleReferenceId: Number(record.saleReferenceId || 0),
      refundAmount: this.mellat.toGatewayAmount(amount),
    });

    if (answer.ok) {
      record.refunds = [
        ...(record.refunds || []),
        {
          orderId: refundOrderId,
          amountToman: amount,
          gatewayAmount: this.mellat.toGatewayAmount(amount),
          resCode: answer.resCode,
          at: new Date(),
        },
      ];
      record.markModified('refunds');
      if (alreadyRefunded + amount >= record.amountToman) record.status = 'refunded';
      record.resLabel = `استرداد ${amount.toLocaleString('fa-IR')} تومان${note ? ` — ${note}` : ''}`;
    } else {
      record.resCode = answer.resCode;
      record.resLabel = `استرداد انجام نشد: ${mellatLabel(answer.resCode)}`;
    }
    await record.save();
    return { ok: answer.ok, resCode: answer.resCode, message: record.resLabel, payment: record.toJSON() };
  }
}




