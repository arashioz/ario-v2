import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type InvoiceDocument = Invoice & Document;

@Schema({ _id: false })
export class InvoiceItem {
  @Prop({ required: true })
  productId: string;

  @Prop({ required: true, trim: true })
  productName: string;

  @Prop({ required: true, default: 1 })
  quantity: number; // Primary unit quantity (e.g. 167 بسته)

  @Prop({ required: true, default: 'عدد' })
  unit: string;

  @Prop({ default: 0 })
  secondaryQuantity?: number; // Secondary unit quantity (e.g. 500 کیلوگرم)

  @Prop({ default: '' })
  secondaryUnit?: string;

  @Prop({ required: true, default: 0 })
  unitPrice: number;

  @Prop({ required: true, default: 0 })
  totalPrice: number;

  @Prop({ default: 0 })
  weightKg: number; // Line item weight in kg
}

export const InvoiceItemSchema = SchemaFactory.createForClass(InvoiceItem);

@Schema({ _id: false })
export class SplitPaymentDetails {
  @Prop({ default: 0 })
  pos: number; // کارتخوان

  @Prop({ default: 0 })
  cash: number; // نقدی

  @Prop({ default: 0 })
  transfer: number; // کارت‌به‌کارت / حواله

  @Prop({ default: 0 })
  cheque: number; // چک صیادی

  @Prop({ default: 0 })
  credit: number; // نسیه / دفتری
}

export const SplitPaymentDetailsSchema = SchemaFactory.createForClass(SplitPaymentDetails);

/** Shop bank account (settings.bankCards[].id) each card payment was deposited to. */
@Schema({ _id: false })
export class DepositAccounts {
  @Prop({ trim: true, default: '' })
  pos: string;

  @Prop({ trim: true, default: '' })
  transfer: string;
}

export const DepositAccountsSchema = SchemaFactory.createForClass(DepositAccounts);

@Schema({ timestamps: true })
export class Invoice {
  @Prop({ required: true, unique: true, index: true })
  invoiceNumber: string;

  @Prop({ required: true, enum: ['sale', 'purchase'], default: 'sale', index: true })
  type: string;

  @Prop({
    required: true,
    enum: ['retail', 'supermarket', 'wholesale'],
    default: 'retail',
    index: true,
  })
  saleType: string; // تکی، سوپرمارکت، عمده بنکداری

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer', required: false, index: true })
  customerId?: MongooseSchema.Types.ObjectId;

  @Prop({ required: true, trim: true, default: 'مشتری حضوری' })
  customerName: string;

  @Prop({ trim: true, default: '' })
  customerPhone?: string;

  @Prop({ type: Date, default: Date.now })
  invoiceDate: Date; // تاریخ فاکتور قابل انتخاب و ویرایش با تقویم

  @Prop({ type: [InvoiceItemSchema], required: true, default: [] })
  items: InvoiceItem[];

  @Prop({ required: true, default: 0 })
  totalAmount: number; // جمع اقلام قبل تخفیف

  @Prop({ default: 0 })
  discount: number; // تخفیف

  @Prop({ required: true, default: 0 })
  finalAmount: number; // مبلغ نهایی قابل پرداخت

  @Prop({ default: 0 })
  totalWeightKg: number; // مجموع تناژ و کیلوگرم فاکتور

  @Prop({
    required: true,
    enum: ['pos', 'cash', 'transfer', 'cheque', 'credit', 'split'],
    default: 'pos',
  })
  paymentMethod: string; // پیش‌فرض: کارتخوان (pos)

  @Prop({ type: SplitPaymentDetailsSchema, default: () => ({}) })
  splitDetails?: SplitPaymentDetails;

  @Prop({ type: DepositAccountsSchema, default: () => ({}) })
  depositAccounts?: DepositAccounts;

  @Prop({ default: true })
  isPaid: boolean;

  @Prop({ default: 0 })
  paidAmount: number;

  @Prop({ default: 0 })
  remainingDebt: number;

  /** Portion of finalAmount put on the customer's account (نسیه) when the invoice was issued. */
  @Prop({ default: 0 })
  creditAmount: number;

  /**
   * Earlier credit on the customer's account (بستانکاری) applied to this invoice.
   * It reduces remainingDebt without counting as new money received.
   */
  @Prop({ default: 0 })
  creditApplied: number;

  /** Payment deadline for the credit portion. Defaults to 15 days after the invoice date. */
  @Prop({ type: Date })
  dueDate?: Date;

  @Prop({ default: 15 })
  dueDays: number;

  /** shop: deduct shop stock. factory: goods leave the factory, shop stock is untouched. */
  @Prop({ type: String, enum: ['shop', 'factory'], default: 'shop' })
  fulfillment: string;

  /** Payments on migrated walk-in credit invoices that have no customer ledger. */
  @Prop({
    type: [{ _id: false, date: Date, amount: Number, method: String, accountId: String }],
    default: [],
  })
  legacyPayments: { date: Date; amount: number; method?: string; accountId?: string }[];

  /** Who pays for delivery: 'customer' adds shippingCost to finalAmount, 'me' books it as a shipping expense. */
  @Prop({ type: String, enum: ['none', 'customer', 'me'], default: 'none' })
  shippingPayer: string;

  @Prop({ default: 0 })
  shippingCost: number;

  @Prop({ trim: true })
  shippingExpenseId?: string;

  /** Pre-invoice this invoice was finalized from (set when "ارسال شد" is pressed). */
  @Prop({ trim: true, default: '' })
  proformaNumber?: string;

  @Prop({ type: Date })
  shippedAt?: Date;

  @Prop({ default: 0 })
  customerPrevBalance: number;

  @Prop({ default: 0 })
  customerNewBalance: number;

  @Prop({ trim: true, default: '' })
  notes?: string;

  @Prop({ default: 'مدیر سیستم' })
  createdByName: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);
InvoiceSchema.index({ invoiceNumber: 'text', customerName: 'text' });
InvoiceSchema.index({ invoiceDate: -1, createdAt: -1 });
