import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Invoice, InvoiceDocument } from '../invoices/schemas/invoice.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { purchaseEntersShop } from '../suppliers/supplier-names';
import { PricePeriod, PricePeriodDocument } from './schemas/price-period.schema';

const tehranDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayKey = (d: Date | string) => tehranDay.format(new Date(d));

export interface PeriodRow {
  productId: string;
  productName: string;
  unitPrice: number;
  pricePerKg: number;
  from: Date;
  to?: Date;
  invoiceId: string;
  invoiceNumber: string;
}

/** Buy price that was in force on a Tehran calendar day. */
export function priceOn(periods: PeriodRow[], productId: string, date: Date | string): number {
  const day = dayKey(date);
  let price = 0;
  for (const p of periods) {
    if (p.productId !== productId) continue;
    if (dayKey(p.from) > day) continue;
    if (p.to && dayKey(p.to) <= day) continue;
    price = p.unitPrice;
  }
  return price;
}

@Injectable()
export class PricePeriodService {
  constructor(
    @InjectModel(PricePeriod.name) private periodModel: Model<PricePeriodDocument>,
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
  ) {}

  /**
   * Rewrite the price-span documents from shop purchases.
   * A new document starts only when the unit price actually changes.
   */
  async rebuild(): Promise<PeriodRow[]> {
    const [invoices, products] = await Promise.all([
      this.invoiceModel
        .find({ type: 'purchase' })
        .select('invoiceNumber invoiceDate customerName fulfillment items')
        .sort({ invoiceDate: 1, createdAt: 1 })
        .lean(),
      this.productModel.find().select('name weightPerUnitKg unit').lean(),
    ]);
    const weight = new Map(products.map((p) => [String(p._id), p.weightPerUnitKg || (p.unit === 'کیلوگرم' ? 1 : 0)]));
    const names = new Map(products.map((p) => [String(p._id), p.name]));

    const lines: { productId: string; productName: string; unitPrice: number; date: Date; invoiceId: string; invoiceNumber: string }[] = [];
    for (const inv of invoices) {
      if (!purchaseEntersShop({ type: inv.type, fulfillment: inv.fulfillment, customerName: inv.customerName })) continue;
      for (const it of inv.items || []) {
        const unitPrice = Math.round(Number(it.unitPrice) || 0);
        if (unitPrice <= 0 || it.received === false || !it.productId) continue;
        lines.push({
          productId: String(it.productId),
          productName: it.productName || names.get(String(it.productId)) || '',
          unitPrice,
          date: inv.invoiceDate,
          invoiceId: String(inv._id),
          invoiceNumber: inv.invoiceNumber,
        });
      }
    }
    lines.sort((a, b) => +new Date(a.date) - +new Date(b.date) || a.invoiceNumber.localeCompare(b.invoiceNumber));

    const open = new Map<string, PeriodRow>();
    const closed: PeriodRow[] = [];
    for (const line of lines) {
      const w = weight.get(line.productId) || 0;
      const current = open.get(line.productId);
      if (!current) {
        open.set(line.productId, this.row(line, w));
        continue;
      }
      if (current.unitPrice === line.unitPrice) continue;
      if (dayKey(current.from) === dayKey(line.date)) {
        current.unitPrice = line.unitPrice;
        current.pricePerKg = w > 0 ? Math.round(line.unitPrice / w) : 0;
        current.invoiceId = line.invoiceId;
        current.invoiceNumber = line.invoiceNumber;
        current.productName = line.productName;
        continue;
      }
      current.to = line.date;
      closed.push(current);
      open.set(line.productId, this.row(line, w));
    }
    const periods = [...closed, ...open.values()];
    await this.periodModel.deleteMany({});
    if (periods.length) await this.periodModel.insertMany(periods);
    return periods.sort((a, b) => +new Date(a.from) - +new Date(b.from));
  }

  async list(): Promise<PeriodRow[]> {
    const rows = await this.periodModel.find().sort({ from: 1 }).lean();
    if (!rows.length) return this.rebuild();
    return rows.map((r) => ({
      productId: r.productId,
      productName: r.productName,
      unitPrice: r.unitPrice,
      pricePerKg: r.pricePerKg || 0,
      from: r.from,
      to: r.to,
      invoiceId: r.invoiceId,
      invoiceNumber: r.invoiceNumber,
    }));
  }

  private row(
    line: { productId: string; productName: string; unitPrice: number; date: Date; invoiceId: string; invoiceNumber: string },
    weightPerUnit: number,
  ): PeriodRow {
    return {
      productId: line.productId,
      productName: line.productName,
      unitPrice: line.unitPrice,
      pricePerKg: weightPerUnit > 0 ? Math.round(line.unitPrice / weightPerUnit) : 0,
      from: line.date,
      invoiceId: line.invoiceId,
      invoiceNumber: line.invoiceNumber,
    };
  }
}
