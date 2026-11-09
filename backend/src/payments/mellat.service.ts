import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Beh-Pardakht Mellat — «دروازه پرداخت اینترنتی بانک ملت» (IPG).
 * Written from scratch against the vendor document «implementation-ipg-fa» (نگارش ۱.۲۹، تیر ۱۴۰۲)
 * and the live WSDL at https://bpm.shaparak.ir/pgwchannel/services/pgw?wsdl
 *
 * Contract (verified against the live WSDL, not from memory):
 *  - SOAP 1.1, document/literal-wrapped, `elementFormDefault="unqualified"` → only the wrapper
 *    element is namespace-qualified; the parameters stay bare.
 *  - wrapper namespace: http://interfaces.core.sw.bps.com/  ·  soapAction is empty.
 *  - every operation answers with ONE string named `return`.
 *  - bpPayRequest answers "ResCode, RefId" (e.g. "0, AF82041a2Bf6989c7fF9"); RefId is case sensitive.
 *  - verify / settle / inquiry / reversal answer "ResCode" only.
 */

export const MELLAT_NS = 'http://interfaces.core.sw.bps.com/';

/** Production addresses from the document (sections 2.2 and 2.3.1). */
const PRODUCTION_ENDPOINT = 'https://bpm.shaparak.ir/pgwchannel/services/pgw';
const PRODUCTION_PAY_PAGE = 'https://bpm.shaparak.ir/pgwchannel/startpay.mellat';

/** Table 11 of the document — every ResCode the gateway can answer. */
export const MELLAT_RESPONSE_LABELS: Record<string, string> = {
  '0': 'تراکنش با موفقیت انجام شد',
  '11': 'شماره کارت نامعتبر است',
  '12': 'موجودی کافی نیست',
  '13': 'رمز نادرست است',
  '14': 'تعداد دفعات وارد کردن رمز بیش از حد مجاز است',
  '15': 'کارت نامعتبر است',
  '16': 'دفعات برداشت وجه بیش از حد مجاز است',
  '17': 'کاربر از انجام تراکنش منصرف شده است',
  '18': 'تاریخ انقضای کارت گذشته است',
  '19': 'مبلغ برداشت وجه بیش از حد مجاز است',
  '21': 'پذیرنده نامعتبر است (سرویس برای این پایانه فعال نیست)',
  '23': 'خطای امنیتی رخ داده است',
  '24': 'اطلاعات کاربری پذیرنده نامعتبر است',
  '25': 'مبلغ نامعتبر است',
  '31': 'پاسخ نامعتبر است',
  '32': 'فرمت اطلاعات وارد شده صحیح نیست',
  '33': 'حساب نامعتبر است',
  '34': 'خطای سیستمی',
  '35': 'تاریخ نامعتبر است',
  '41': 'شماره درخواست تکراری است',
  '42': 'تراکنش Sale یافت نشد',
  '43': 'قبلاً درخواست Verify داده شده است (تراکنش را موفق بدانید)',
  '44': 'درخواست Verify یافت نشد',
  '45': 'تراکنش Settle شده است (تراکنش را موفق بدانید)',
  '46': 'تراکنش Settle نشده است',
  '47': 'تراکنش Settle یافت نشد',
  '48': 'تراکنش Reverse شده است (وجه به دارنده کارت برگشت داده شده است)',
  '51': 'تراکنش تکراری است',
  '54': 'تراکنش مرجع موجود نیست',
  '55': 'تراکنش نامعتبر است',
  '61': 'خطا در واریز',
  '62': 'مسیر بازگشت به سایت در دامنه ثبت‌شده برای پذیرنده قرار ندارد',
  '98': 'سقف استفاده از رمز ایستا به پایان رسیده است',
  '995': 'تعلق کارت بانکی به مشتری احراز نشد',
  '412': 'شناسه قبض نادرست است',
  '413': 'شناسه پرداخت نادرست است',
  '414': 'سازمان صادرکننده قبض نامعتبر است',
  '415': 'زمان جلسه کاری به پایان رسیده است',
  '416': 'خطا در ثبت اطلاعات',
  '417': 'شناسه پرداخت‌کننده نامعتبر است',
  '418': 'اشکال در تعریف اطلاعات مشتری',
  '419': 'تعداد دفعات ورود اطلاعات از حد مجاز گذشته است',
  '421': 'IP نامعتبر است (سرور پذیرنده به سامانه اعلام نشده است)',
};

export const mellatLabel = (resCode: string | number | undefined | null): string =>
  MELLAT_RESPONSE_LABELS[String(resCode ?? '').trim()] || `کد پاسخ ${resCode ?? '—'}`;

export interface MellatPayResult {
  resCode: string;
  /** Hash code that must be POSTed to the payment page. Case sensitive (document note). */
  refId: string;
  raw: string;
}

export interface MellatCallResult {
  resCode: string;
  raw: string;
  ok: boolean;
}

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const decodeXml = (value: string): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&');

/** Pulls the single `return` part out of a document/literal SOAP reply, or raises the SOAP fault. */
const readReturn = (xml: string): string => {
  const match = /<(?:[\w.-]+:)?return\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?return>/i.exec(xml);
  if (match) return decodeXml(match[1].trim());
  const fault = /<(?:[\w.-]+:)?faultstring\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?faultstring>/i.exec(xml);
  if (fault) throw new Error(`خطای SOAP درگاه ملت: ${decodeXml(fault[1].trim())}`);
  throw new Error('پاسخ درگاه بانک ملت شامل return نیست');
};

@Injectable()
export class MellatService {
  private readonly logger = new Logger('Mellat');

  constructor(private readonly config: ConfigService) {}

  get terminalId(): string {
    return String(this.config.get('MELLAT_TERMINAL_ID') || '').trim();
  }

  get userName(): string {
    return String(this.config.get('MELLAT_USER_NAME') || '').trim();
  }

  private get userPassword(): string {
    return String(this.config.get('MELLAT_USER_PASSWORD') || '');
  }

  /** The gateway stays dark until an admin turns it on *and* fills the three credentials. */
  get enabled(): boolean {
    const flag = String(this.config.get('MELLAT_ENABLED') || '').toLowerCase();
    return flag === 'true' && Boolean(this.terminalId && this.userName && this.userPassword);
  }

  get status(): { enabled: boolean; configured: boolean; terminalId: string; payPageUrl: string } {
    return {
      enabled: this.enabled,
      configured: Boolean(this.terminalId && this.userName && this.userPassword),
      terminalId: this.terminalId,
      payPageUrl: this.payPageUrl,
    };
  }

  private get endpoint(): string {
    return String(this.config.get('MELLAT_ENDPOINT') || PRODUCTION_ENDPOINT);
  }

  /** Page the customer's browser is POSTed to (the bank matches the Referer with the registered domain). */
  get payPageUrl(): string {
    return String(this.config.get('MELLAT_PAY_PAGE_URL') || PRODUCTION_PAY_PAGE);
  }

  private get timeoutMs(): number {
    return Number(this.config.get('MELLAT_TIMEOUT_MS') || 20000);
  }

  /** The shop books toman; a Mellat terminal is normally cleared in rials. Override with MELLAT_CURRENCY=toman. */
  toGatewayAmount(toman: number): number {
    const amount = Math.max(0, Math.round(Number(toman) || 0));
    const currency = String(this.config.get('MELLAT_CURRENCY') || 'rials').toLowerCase();
    return currency === 'toman' ? amount : amount * 10;
  }

  fromGatewayAmount(amount: number): number {
    const currency = String(this.config.get('MELLAT_CURRENCY') || 'rials').toLowerCase();
    return currency === 'toman'
      ? Math.round(Number(amount) || 0)
      : Math.round((Number(amount) || 0) / 10);
  }

  /** YYYYMMDD / HHMMSS in the shop's own timezone, matching the document's examples. */
  private stamp(date: Date = new Date()): { localDate: string; localTime: string } {
    const timeZone = String(this.config.get('TZ') || 'Asia/Tehran');
    let parts: Intl.DateTimeFormatPart[];
    try {
      parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(date);
    } catch {
      parts = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(date);
    }
    const pick = (type: string) => parts.find((p) => p.type === type)?.value || '00';
    return {
      localDate: `${pick('year')}${pick('month')}${pick('day')}`,
      localTime: `${pick('hour')}${pick('minute')}${pick('second')}`.slice(0, 6),
    };
  }

  private buildEnvelope(operation: string, params: Record<string, string | number>): string {
    const body = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `<${key}>${escapeXml(String(value))}</${key}>`)
      .join('');
    return (
      '<?xml version="1.0" encoding="UTF-8"?>' +
      `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="${MELLAT_NS}">` +
      `<soap:Body><tns:${operation}>${body}</tns:${operation}></soap:Body>` +
      '</soap:Envelope>'
    );
  }

  /** One SOAP call → the `return` string the gateway answers with. */
  async call(operation: string, params: Record<string, string | number>): Promise<string> {
    if (!this.terminalId || !this.userName || !this.userPassword) {
      throw new ServiceUnavailableException(
        'درگاه بانک ملت پیکربندی نشده است؛ MELLAT_TERMINAL_ID و MELLAT_USER_NAME و MELLAT_USER_PASSWORD را در .env بگذارید.',
      );
    }

    const envelope = this.buildEnvelope(operation, {
      terminalId: this.terminalId,
      userName: this.userName,
      userPassword: this.userPassword,
      ...params,
    });

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          // The WSDL declares an empty SOAPAction; some stacks reject a missing one.
          SOAPAction: '""',
          Accept: 'text/xml, multipart/related',
        },
        body: envelope,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err: any) {
      this.logger.error(`Mellat ${operation} network error: ${err?.message || err}`);
      throw new ServiceUnavailableException('ارتباط با درگاه بانک ملت برقرار نشد. کمی بعد دوباره امتحان کنید.');
    }

    const xml = await response.text();
    if (!response.ok) {
      this.logger.error(`Mellat ${operation} HTTP ${response.status}: ${xml.slice(0, 400)}`);
      throw new ServiceUnavailableException(`پاسخ نامعتبر از درگاه بانک ملت (HTTP ${response.status})`);
    }

    try {
      return readReturn(xml);
    } catch (err: any) {
      this.logger.error(`Mellat ${operation} bad payload: ${err?.message || err} · ${xml.slice(0, 400)}`);
      throw new ServiceUnavailableException('پاسخ درگاه بانک ملت قابل خواندن نیست.');
    }
  }

  /**
   * Step 1 — «درخواست پرداخت» (bpPayRequest). Answers "ResCode, RefId".
   * Parameter order follows the WSDL sequence: terminalId, userName, userPassword, orderId,
   * amount, localDate, localTime, additionalData, callBackUrl, payerId, mobileNo, encPan,
   * panHiddenMode, cartItem, enc.
   */
  async payRequest(input: {
    orderId: number;
    amount: number;
    callBackUrl: string;
    additionalData?: string;
    mobileNo?: string;
    cartItem?: string;
    payerId?: string;
  }): Promise<MellatPayResult> {
    const { localDate, localTime } = this.stamp();
    const raw = await this.call('bpPayRequest', {
      orderId: input.orderId,
      amount: input.amount,
      localDate,
      localTime,
      additionalData: input.additionalData || '',
      callBackUrl: input.callBackUrl,
      // The document: in the test environment this must be 0.
      payerId: input.payerId || '0',
      mobileNo: input.mobileNo || '',
      cartItem: input.cartItem || '',
    });

    const [resCode = '', ...rest] = raw.split(',');
    return { resCode: resCode.trim(), refId: rest.join(',').trim(), raw };
  }

  /** Steps 2..5 answer with a bare ResCode. */
  private async codeCall(
    operation: 'bpVerifyRequest' | 'bpSettleRequest' | 'bpInquiryRequest' | 'bpReversalRequest',
    orderId: number,
    saleOrderId: number,
    saleReferenceId: number,
  ): Promise<MellatCallResult> {
    const raw = await this.call(operation, { orderId, saleOrderId, saleReferenceId });
    const resCode = raw.split(',')[0].trim();
    // 43 = already verified, 45 = already settled: both mean "count this sale as done".
    return { resCode, raw, ok: resCode === '0' || resCode === '43' || resCode === '45' };
  }

  /** Step 2 — «تأیید تراکنش خرید». Has to reach the bank within 20 minutes or the gateway auto-reverses. */
  verify(orderId: number, saleOrderId: number, saleReferenceId: number) {
    return this.codeCall('bpVerifyRequest', orderId, saleOrderId, saleReferenceId);
  }

  /** Step 3 — «واریز وجه». Without it the money is never cleared to the merchant account. */
  settle(orderId: number, saleOrderId: number, saleReferenceId: number) {
    return this.codeCall('bpSettleRequest', orderId, saleOrderId, saleReferenceId);
  }

  /** Safety net when the verify answer never arrived. */
  inquiry(orderId: number, saleOrderId: number, saleReferenceId: number) {
    return this.codeCall('bpInquiryRequest', orderId, saleOrderId, saleReferenceId);
  }

  /** Money taken from the customer that must not be kept. Allowed up to 3 hours after verify. */
  reverse(orderId: number, saleOrderId: number, saleReferenceId: number) {
    return this.codeCall('bpReversalRequest', orderId, saleOrderId, saleReferenceId);
  }

  /** «استرداد وجه» of a settled sale — partly or fully, repeatable while the sum stays below the sale. */
  async refund(input: {
    orderId: number;
    saleOrderId: number;
    saleReferenceId: number;
    refundAmount: number;
  }): Promise<MellatCallResult> {
    const raw = await this.call('bpRefundRequest', {
      orderId: input.orderId,
      saleOrderId: input.saleOrderId,
      saleReferenceId: input.saleReferenceId,
      refundAmount: input.refundAmount,
    });
    const resCode = raw.split(',')[0].trim();
    return { resCode, raw, ok: resCode === '0' };
  }
}



