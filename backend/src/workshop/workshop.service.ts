import {
  BadRequestException,
  ConflictException,
  Injectable,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import {
  WorkshopBatch,
  WorkshopBatchDocument,
  WorkshopLine,
} from './workshop.schema';
import { CreateWorkshopDto } from './workshop.dto';
import { Invoice, InvoiceDocument } from '../invoices/schemas/invoice.schema';
import { purchaseEntersShop } from '../suppliers/supplier-names';
import { SettingsService } from '../settings/settings.service';
import { automaticPrice } from '../products/automatic-pricing';

const kgPerUnit = (p: Product) =>
  p.weightPerUnitKg ||
  (p.hasDualUnit && p.secondaryUnit === 'کیلوگرم' ? p.unitRatio || 0 : 0) ||
  (p.unit === 'کیلوگرم' ? 1 : 0);

@Injectable()
export class WorkshopService implements OnModuleInit {
  private readonly activeRequests = new Set<string>();
  constructor(
    @InjectModel(Product.name) private products: Model<ProductDocument>,
    @InjectModel(WorkshopBatch.name)
    private batches: Model<WorkshopBatchDocument>,
    @InjectModel(Invoice.name) private invoices: Model<InvoiceDocument>,
    @Optional() private settings?: SettingsService,
  ) {}

  // The deployed MongoDB is standalone. Durable per-product markers let interrupted
  // batches be settled after a restart without requiring replica-set transactions.
  async onModuleInit() {
    await this.batches.init(); // unique requestId must exist before accepting requests
    for (const batch of await this.batches.find({ status: 'pending' }))
      await this.settle(batch);
  }

  list() {
    return this.batches
      .find({ status: 'completed' })
      .sort({ date: -1 })
      .limit(50)
      .lean();
  }

  private async clearMarkers(batch: WorkshopBatchDocument) {
    await this.products.updateMany(
      { workshopPending: String(batch._id) },
      { $pull: { workshopPending: String(batch._id) } },
    );
  }

  private async settle(batch: WorkshopBatchDocument) {
    const marker = String(batch._id);
    const outputApplied = await this.products.exists({
      _id: batch.output.productId,
      workshopPending: marker,
    });
    if (outputApplied) {
      await this.batches.updateOne(
        { _id: batch._id },
        { $set: { status: 'completed' } },
      );
      batch.status = 'completed';
    } else {
      // Only undo deductions that actually succeeded. The marker and increment are atomic.
      for (const line of batch.inputs) {
        await this.products.updateOne(
          { _id: line.productId, workshopPending: marker },
          {
            $inc: { stock: line.quantity, stockAdjust: line.quantity },
            $pull: { workshopPending: marker },
          },
        );
      }
      await this.batches.updateOne(
        { _id: batch._id },
        { $set: { status: 'cancelled' } },
      );
      batch.status = 'cancelled';
    }
    await this.clearMarkers(batch);
    return batch;
  }

  async create(dto: CreateWorkshopDto, actor: string) {
    if (this.activeRequests.has(dto.requestId))
      throw new ConflictException(
        'این تولید در حال ثبت است؛ کمی بعد دوباره بررسی کنید',
      );
    this.activeRequests.add(dto.requestId);
    try {
      return await this.execute(dto, actor);
    } finally {
      this.activeRequests.delete(dto.requestId);
    }
  }

  private async execute(dto: CreateWorkshopDto, actor: string) {
    const previous = await this.batches.findOne({ requestId: dto.requestId });
    // A failed response may leave a pending record even though this process is alive.
    // No writer for this request is active, so a retry can recover it immediately.
    if (previous?.status === 'pending') await this.settle(previous);
    if (previous?.status === 'completed') return previous;
    if (previous)
      throw new ConflictException(
        previous.status === 'pending'
          ? 'این تولید در حال ثبت است؛ کمی بعد دوباره بررسی کنید'
          : 'این ثبت انجام نشد؛ پس از بررسی موجودی، تولید جدیدی ثبت کنید',
      );
    const outputCategory = dto.outputCategory?.trim();
    if (!outputCategory)
      throw new BadRequestException('دسته‌بندی محصول تولیدی را انتخاب کنید');
    const ids = dto.inputs.map((line) => line.productId);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('هر ماده را فقط یک بار وارد کنید');
    if (ids.includes(dto.outputProductId))
      throw new BadRequestException(
        'محصول خروجی باید با مواد مصرفی متفاوت باشد',
      );
    const products = await this.products.find({
      _id: { $in: [...ids, dto.outputProductId] },
      isActive: true,
    });
    const byId = new Map(products.map((p) => [String(p._id), p]));
    if (byId.size !== ids.length + 1)
      throw new BadRequestException('یکی از کالاها یافت نشد یا غیرفعال است');
    const inputs: WorkshopLine[] = dto.inputs.map((line) => {
      const p = byId.get(line.productId)!;
      if (p.stock < line.quantity)
        throw new BadRequestException(`موجودی «${p.name}» کافی نیست`);
      return {
        ...line,
        productName: p.name,
        unit: p.unit,
        weightKg: kgPerUnit(p) * line.quantity,
        unitCost: p.buyPrice || 0,
      };
    });
    const materialCost = inputs.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
    const laborCost = Math.round(dto.laborCost + (materialCost + dto.packagingCost) * (dto.laborPercent || 0) / 100);
    const totalCost = materialCost + dto.packagingCost + laborCost;
    const out = byId.get(dto.outputProductId)!;
    const pricingSettings = out.autoPricing ? await this.settings?.get() : null;
    const sellPrice = out.autoPricing ? automaticPrice({ ...out.toObject(), category: outputCategory }, pricingSettings?.categoryBasePrices?.find((r) => r.category === outputCategory)) : dto.sellPrice;
    // Older products may have opening/manual stock that never had an invoice.
    // Preserve that baseline once, before adding workshop adjustments to their ledger.
    const legacy = products.filter((p) => p.openingStock === undefined);
    if (legacy.length) {
      const totals = new Map<string, number>();
      const invoices = await this.invoices
        .find({ 'items.productId': { $in: legacy.map((p) => String(p._id)) } })
        .select('type fulfillment customerName items')
        .lean();
      for (const inv of invoices) {
        const purchase = inv.type === 'purchase';
        if (purchase ? !purchaseEntersShop(inv) : inv.fulfillment === 'factory')
          continue;
        for (const item of inv.items) {
          if (purchase && item.received === false) continue;
          totals.set(
            item.productId,
            (totals.get(item.productId) || 0) +
              (purchase ? 1 : -1) * item.quantity,
          );
        }
      }
      for (const p of legacy) {
        const openingStock =
          p.stock - (p.stockAdjust || 0) - (totals.get(String(p._id)) || 0);
        const updated = await this.products.updateOne(
          { _id: p._id, openingStock: { $exists: false }, stock: p.stock },
          { $set: { openingStock } },
        );
        if (
          !updated.modifiedCount &&
          !(await this.products.exists({
            _id: p._id,
            openingStock: { $exists: true },
          }))
        ) {
          throw new BadRequestException(
            'موجودی کالا تغییر کرد؛ اطلاعات را تازه کنید و دوباره ثبت کنید',
          );
        }
      }
    }
    let batch: WorkshopBatchDocument;
    try {
      batch = await this.batches.create({
        requestId: dto.requestId,
        inputs,
        status: 'pending',
        output: {
          productId: String(out._id),
          productName: out.name,
          category: outputCategory,
          unit: out.unit,
          quantity: dto.outputQuantity,
          weightKg: kgPerUnit(out) * dto.outputQuantity,
          unitCost: totalCost / dto.outputQuantity,
        },
        packagingCost: dto.packagingCost,
        laborCost,
        laborFlatCost: dto.laborCost,
        laborPercent: dto.laborPercent || 0,
        totalCost,
        sellPrice,
        notes: dto.notes || '',
        createdByName: actor,
      });
    } catch (error) {
      if (error?.code === 11000)
        throw new ConflictException(
          'این درخواست قبلاً دریافت شده؛ دوباره بررسی کنید',
        );
      throw error;
    }
    const marker = String(batch._id);
    try {
      for (const line of inputs) {
        const result = await this.products.updateOne(
          {
            _id: line.productId,
            isActive: true,
            stock: { $gte: line.quantity },
            workshopPending: { $ne: marker },
          },
          {
            $inc: { stock: -line.quantity, stockAdjust: -line.quantity },
            $addToSet: { workshopPending: marker },
          },
        );
        if (result.modifiedCount !== 1)
          throw new BadRequestException(
            `موجودی «${line.productName}» تغییر کرده یا کافی نیست`,
          );
      }
      // Last stock write is the commit point. Its durable marker survives a lost response.
      const result = await this.products.updateOne(
        {
          _id: dto.outputProductId,
          isActive: true,
          workshopPending: { $ne: marker },
        },
        {
          $inc: { stock: dto.outputQuantity, stockAdjust: dto.outputQuantity },
          $set: {
            category: outputCategory,
            buyPrice: batch.output.unitCost,
            sellPrice,
            priceRetail: sellPrice,
            ...(out.autoPricing ? { priceSupermarket: sellPrice, priceWholesale: sellPrice } : {}),
            priceSetAt: new Date(),
          },
          $unset: { priceCostBasisPerKg: 1 },
          $addToSet: { workshopPending: marker },
          $push: {
            priceHistory: {
              $each: [
                {
                  oldPrice: out.sellPrice,
                  newPrice: sellPrice,
                  reason: 'تولید کارگاهی',
                  changedByName: actor,
                  date: new Date(),
                },
              ],
              $position: 0,
              $slice: 40,
            },
          },
        },
      );
      if (result.modifiedCount !== 1)
        throw new BadRequestException('محصول خروجی غیرفعال شده است');
    } catch (error) {
      const settled = await this.settle(batch);
      if (settled.status === 'completed') return settled;
      throw error;
    }
    return this.settle(batch);
  }
}
