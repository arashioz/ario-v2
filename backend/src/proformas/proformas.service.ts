import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Proforma, ProformaDocument } from './schemas/proforma.schema';
import { ProformaTermsDto, ShipProformaDto } from './dto/proforma.dto';
import { CreateInvoiceDto } from '../invoices/dto/create-invoice.dto';
import { InvoicesService } from '../invoices/invoices.service';
import { SettingsService } from '../settings/settings.service';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';

const r1 = (n: number) => Math.round(n * 10) / 10;

@Injectable()
export class ProformasService {
  constructor(
    @InjectModel(Proforma.name) private model: Model<ProformaDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    private invoices: InvoicesService,
    private settings: SettingsService,
  ) {}

  private branchName(branches: string[] | undefined, raw?: string) {
    const list = (branches || []).map((b) => String(b || '').trim()).filter(Boolean);
    const name = String(raw || '').trim();
    if (!list.length) return '';
    if (!name) throw new BadRequestException('شعبه مشتری را انتخاب کنید');
    if (!list.includes(name)) throw new BadRequestException('این شعبه برای مشتری تعریف نشده');
    return name;
  }

  private async assertFactory() {
    const settings = await this.settings.get();
    if (!settings.factorySalesEnabled) throw new BadRequestException('فروش از کارخانه در تنظیمات خاموش است');
  }

  private async nextNumber(): Promise<string> {
    const d = new Date();
    const stamp = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const prefix = `PRE-${stamp}-`;
    let n = (await this.model.countDocuments({ number: { $regex: `^${prefix}` } })) + 1;
    while (await this.model.exists({ number: `${prefix}${String(n).padStart(4, '0')}` })) n++;
    return `${prefix}${String(n).padStart(4, '0')}`;
  }

  private finalOf(p: { totalAmount: number; discount?: number; shippingPayer?: string; shippingCost?: number }) {
    const shipping = p.shippingPayer === 'customer' ? p.shippingCost || 0 : 0;
    return Math.max(0, (p.totalAmount || 0) - (p.discount || 0)) + shipping;
  }

  private checkPayment(p: { paymentMethod: string; splitDetails?: any; finalAmount: number; customerId?: any }) {
    if (p.paymentMethod === 'split') {
      const s = p.splitDetails || {};
      const sum = (s.pos || 0) + (s.cash || 0) + (s.transfer || 0) + (s.cheque || 0) + (s.credit || 0);
      if (Math.round(sum) !== Math.round(p.finalAmount)) {
        throw new BadRequestException('جمع مبالغ ترکیبی با مبلغ نهایی برابر نیست');
      }
    }
  }

  async create(dto: CreateInvoiceDto, recordedByName: string): Promise<ProformaDocument> {
    if (!dto.items?.length) throw new BadRequestException('پیش‌فاکتور بدون کالا قابل ثبت نیست');
    const customer =
      dto.customerId && Types.ObjectId.isValid(dto.customerId) ? await this.customerModel.findById(dto.customerId).exec() : null;
    if (!customer) throw new BadRequestException('برای پیش‌فاکتور، مشتری را انتخاب کنید');

    let totalWeightKg = 0;
    const items: any[] = [];
    for (const item of dto.items) {
      const product = await this.productModel.findById(item.productId).exec();
      if (!product) throw new NotFoundException(`کالای «${item.productName}» یافت نشد.`);
      const weight = item.weightKg || (product.weightPerUnitKg ? item.quantity * product.weightPerUnitKg : 0);
      totalWeightKg += weight;
      items.push({ ...item, weightKg: r1(weight) });
    }

    const shippingPayer = dto.shippingPayer && dto.shippingCost ? dto.shippingPayer : 'none';
    const shippingCost = shippingPayer === 'none' ? 0 : Math.round(dto.shippingCost || 0);
    const doc = {
      saleType: dto.saleType || 'wholesale',
      customerId: customer._id,
      customerName: customer.name,
      customerPhone: customer.phoneNumber || '',
      branchName: this.branchName(customer.branches, dto.branchName),
      orderDate: dto.invoiceDate ? new Date(dto.invoiceDate) : new Date(),
      items,
      totalAmount: dto.totalAmount,
      discount: dto.discount || 0,
      totalWeightKg: r1(totalWeightKg),
      paymentMethod: dto.paymentMethod || 'credit',
      splitDetails: dto.splitDetails || {},
      depositAccounts: { pos: dto.depositAccounts?.pos || '', transfer: dto.depositAccounts?.transfer || '' },
      paidAmount: dto.paidAmount || 0,
      dueDays: Math.min(365, Math.max(0, Math.round(dto.dueDays ?? 15))),
      shippingPayer,
      shippingCost,
      notes: dto.notes || '',
      fulfillment: dto.fulfillment === 'factory' ? 'factory' : 'shop',
      finalAmount: 0,
    };
    if (doc.fulfillment === 'factory') await this.assertFactory();
    doc.finalAmount = this.finalOf(doc);
    this.checkPayment(doc);

    return this.model.create({ ...doc, number: await this.nextNumber(), createdByName: recordedByName || 'مدیر سیستم' });
  }

  findAll(status?: string) {
    const filter: any = {};
    if (status && status !== 'all') filter.status = status;
    return this.model.find(filter).sort({ status: 1, orderDate: -1, createdAt: -1 }).limit(300).exec();
  }

  async summary() {
    const pending = await this.model.find({ status: 'pending' }).select('finalAmount totalWeightKg').lean();
    return {
      pendingCount: pending.length,
      pendingAmount: pending.reduce((s, p) => s + (p.finalAmount || 0), 0),
      pendingKg: r1(pending.reduce((s, p) => s + (p.totalWeightKg || 0), 0)),
    };
  }

  async findById(id: string): Promise<ProformaDocument> {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('شناسه پیش‌فاکتور نامعتبر است');
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException('پیش‌فاکتور یافت نشد');
    return doc;
  }

  private async pending(id: string) {
    const doc = await this.findById(id);
    if (doc.status !== 'pending') {
      throw new BadRequestException(doc.status === 'shipped' ? 'این پیش‌فاکتور قبلا ارسال و نهایی شده است' : 'این پیش‌فاکتور لغو شده است');
    }
    return doc;
  }

  private applyTerms(doc: ProformaDocument, t: ProformaTermsDto) {
    if (t.shippingPayer !== undefined) doc.shippingPayer = t.shippingPayer;
    if (t.shippingCost !== undefined) doc.shippingCost = Math.round(t.shippingCost);
    if (doc.shippingPayer === 'none' || !doc.shippingCost) {
      doc.shippingPayer = 'none';
      doc.shippingCost = 0;
    }
    if (t.paymentMethod !== undefined) doc.paymentMethod = t.paymentMethod;
    if (t.splitDetails !== undefined) doc.splitDetails = t.splitDetails as any;
    if (t.depositAccounts !== undefined) {
      doc.depositAccounts = { pos: t.depositAccounts.pos || '', transfer: t.depositAccounts.transfer || '' };
    }
    if (t.paidAmount !== undefined) doc.paidAmount = t.paidAmount;
    if (t.dueDays !== undefined) doc.dueDays = Math.min(365, Math.max(0, Math.round(t.dueDays)));
    if (t.discount !== undefined) doc.discount = t.discount;
    if (t.notes !== undefined) doc.notes = t.notes;
    if (t.branchName !== undefined) doc.branchName = t.branchName.trim();
    if (t.fulfillment === 'shop' || t.fulfillment === 'factory') doc.fulfillment = t.fulfillment;
    if (t.items?.length) {
      for (const row of t.items) {
        const item = doc.items.find((i) => i.productId === row.productId);
        if (!item) continue;
        item.unitPrice = Math.round(row.unitPrice);
        item.totalPrice = Math.round(item.quantity * item.unitPrice);
        if (row.factoryUnitCost != null) item.factoryUnitCost = Math.round(row.factoryUnitCost);
      }
      doc.totalAmount = doc.items.reduce((s, i) => s + (i.totalPrice || 0), 0);
      doc.markModified('items');
    }
    doc.finalAmount = this.finalOf(doc);
    this.checkPayment(doc);
  }

  private async applyBranch(doc: ProformaDocument) {
    if (!doc.customerId) return;
    const customer = await this.customerModel.findById(doc.customerId).select('branches').lean();
    doc.branchName = this.branchName(customer?.branches, doc.branchName);
  }

  async update(id: string, terms: ProformaTermsDto) {
    const doc = await this.pending(id);
    if (terms.fulfillment === 'factory' && doc.fulfillment !== 'factory') await this.assertFactory();
    this.applyTerms(doc, terms);
    await this.applyBranch(doc);
    return doc.save();
  }

  /** "ارسال شد": turn the order into a real invoice (stock out, customer debt, shipping expense). */
  async ship(id: string, body: ShipProformaDto, recordedByName: string) {
    const doc = await this.pending(id);
    if (body.fulfillment === 'factory' || (body.fulfillment === undefined && doc.fulfillment === 'factory')) await this.assertFactory();
    this.applyTerms(doc, body);
    await this.applyBranch(doc);
    const shippedAt = new Date();

    const dto: CreateInvoiceDto = {
      type: 'sale',
      saleType: doc.saleType,
      customerId: doc.customerId ? String(doc.customerId) : undefined,
      customerName: doc.customerName,
      customerPhone: doc.customerPhone,
      branchName: doc.branchName || '',
      invoiceDate: body.date || shippedAt.toISOString(),
      items: doc.items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        unit: i.unit,
        secondaryQuantity: i.secondaryQuantity,
        secondaryUnit: i.secondaryUnit,
        unitPrice: i.unitPrice,
        totalPrice: i.totalPrice,
        weightKg: i.weightKg,
        ...(doc.fulfillment === 'factory' ? { factoryUnitCost: Math.round(i.factoryUnitCost || 0) } : {}),
      })),
      fulfillment: doc.fulfillment === 'factory' ? 'factory' : 'shop',
      totalAmount: doc.totalAmount,
      discount: doc.discount,
      finalAmount: doc.finalAmount,
      totalWeightKg: doc.totalWeightKg,
      paymentMethod: doc.paymentMethod,
      splitDetails: doc.paymentMethod === 'split' ? (doc.splitDetails as any) : undefined,
      depositAccounts: { pos: doc.depositAccounts?.pos || '', transfer: doc.depositAccounts?.transfer || '' },
      paidAmount:
        doc.paymentMethod === 'credit'
          ? doc.paidAmount || 0
          : doc.paymentMethod === 'split'
            ? doc.finalAmount - ((doc.splitDetails as any)?.credit || 0)
            : doc.finalAmount,
      notes: [doc.notes, `پیش‌فاکتور ${doc.number}`].filter(Boolean).join(' — '),
      shippingPayer: doc.shippingPayer,
      shippingCost: doc.shippingCost,
      dueDays: doc.dueDays,
    };

    const invoice = await this.invoices.create(dto, recordedByName, { proformaNumber: doc.number, shippedAt });
    doc.status = 'shipped';
    doc.shippedAt = shippedAt;
    doc.invoiceId = String(invoice._id);
    doc.invoiceNumber = invoice.invoiceNumber;
    await doc.save();
    return { proforma: doc, invoice };
  }

  async cancel(id: string) {
    const doc = await this.pending(id);
    doc.status = 'cancelled';
    doc.cancelledAt = new Date();
    return doc.save();
  }
}
