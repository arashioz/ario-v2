import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash } from 'crypto';

// Durable receipts guard an entire order, including invoices split by supplier.
// Never replay an uncertain partial write: keep it visible for reconciliation.
@Injectable()
export class OrderRequestsService {
  private active = new Map<string, Promise<any>>();
  constructor(@InjectModel('OrderRequest') private model: Model<any>) {}

  async run(key: string | undefined, userId: string, kind: string, payload: unknown, execute: () => Promise<any>) {
    if (!key) return execute();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))
      throw new BadRequestException('شناسه سفارش نامعتبر است');
    const scoped = `${userId}:${kind}:${key}`;
    const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    await this.model.init();
    let record: any;
    try { record = await this.model.create({ key: scoped, fingerprint }); }
    catch (error) {
      if (error?.code !== 11000) throw error;
      record = await this.model.findOne({ key: scoped });
      if (record.fingerprint !== fingerprint)
        throw new ConflictException({ code: 'ORDER_CHANGED', message: 'محتوای سفارش با درخواست قبلی یکسان نیست؛ سفارش قبلی در صف حفظ شد.' });
      if (record.status === 'completed') return record.result;
      if (this.active.has(scoped)) return this.active.get(scoped);
      if (record.status === 'processing' && Date.now() - new Date(record.updatedAt).getTime() < 60000)
        throw new ConflictException({ code: 'ORDER_PENDING', message: 'سفارش در حال ثبت است؛ وضعیت آن خودکار دوباره بررسی می‌شود.' });
      throw new ConflictException({ code: 'ORDER_REVIEW_REQUIRED', message: record.error || 'وضعیت ثبت این سفارش نیاز به بررسی دارد؛ برای جلوگیری از فاکتور تکراری، دوباره ثبت نشد.' });
    }
    const job = (async () => {
      try {
        const result = JSON.parse(JSON.stringify(await execute()));
        await this.model.updateOne({ _id: record._id }, { $set: { status: 'completed', result } });
        return result;
      } catch (error) {
        await this.model.updateOne({ _id: record._id }, { $set: {
          status: 'review', error: error?.message || 'ثبت کامل نشد؛ سفارش را بررسی کنید.',
        } }).catch(() => undefined);
        throw error;
      } finally { this.active.delete(scoped); }
    })();
    this.active.set(scoped, job);
    return job;
  }
}
