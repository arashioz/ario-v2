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

  /** Purchase lines only. Missing means the goods were received (older invoices). */
  @Prop({ default: true })
  received?: boolean;

  /**
   * What the parent company charged per primary unit on a direct factory sale.
   * Kept off the customer invoice; profit uses it instead of Ario stock.
   */
  @Prop({ default: 0 })
  factoryUnitCost?: number;
  @Prop({ default: false }) factoryCostConfirmed?: boolean;

  /** Landed buy price of one unit at the moment this sale was saved. */
  @Prop({ default: 0 })
  unitCost?: number;

  /** This line's profit after the invoice discount, stored with the sale. */
  @Prop({ default: 0 })
  profit?: number;
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
    enum: ['retail', 'supermarket', 'wholesale', 'distributor'],
    default: 'retail',
    index: true,
  })
  saleType: string; // تکی، سوپرمارکت، عمده بنکداری

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer', required: false, index: true })
  customerId?: MongooseSchema.Types.ObjectId;

  @Prop({ required: true, trim: true, default: 'مشتری حضوری' })
  customerName: string;

  /** On a factory purchase: the customer the goods were sold to. The company stays in customerName for the supplier ledger. */
  @Prop({ trim: true, default: '' })
  endCustomerName?: string;

  /** Company whose goods are on this invoice. Mixed carts are split so each company gets its own invoice. */
  @Prop({ trim: true, default: '' })
  supplierCompany?: string;

  /**
   * When one order had several companies, every resulting invoice keeps the full cart
   * so the original lines can still be read.
   */
  @Prop({ type: MongooseSchema.Types.Mixed })
  orderBundle?: {
    id: string;
    invoices: {
      invoiceId: string;
      invoiceNumber: string;
      supplierCompany: string;
      finalAmount: number;
      items: { productName: string; category: string; quantity: number; unit: string; totalPrice: number }[];
    }[];
  };

  @Prop({ trim: true, default: '' })
  customerPhone?: string;

  /** Which of the customer's branches this shipment is for. Empty when the customer has no branches. */
  @Prop({ trim: true, default: '' })
  branchName?: string;

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

  /** Cost of the goods on a sale, saved with the invoice. Purchases leave this at 0. */
  @Prop({ default: 0 })
  costAmount?: number;

  /** Sale profit (money received for the goods, minus cost). Saved with the invoice from here on. */
  @Prop({ default: 0 })
  profitAmount?: number;

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
   * Kept at 0. Account credit from other invoices must not reduce this invoice.
   */
  @Prop({ default: 0 })
  creditApplied: number;

  /**
   * Money paid on this invoice beyond its own credit (بستانکاری همین فاکتور).
   * It stays on this invoice and is not spread onto the customer's other invoices.
   */
  @Prop({ default: 0 })
  creditSurplus: number;

  /** Payment deadline for the credit portion. Defaults to 15 days after the invoice date. */
  @Prop({ type: Date })
  dueDate?: Date;

  @Prop({ default: 15 })
  dueDays: number;

  /** shop: in the shop books. factory: direct from the factory. ledger: another company's account only. */
  @Prop({ type: String, enum: ['shop', 'factory', 'ledger'], default: 'shop' })
  fulfillment: string;

  /** Purchase invoice booked to the parent company for a direct factory sale. */
  @Prop({ trim: true, default: '' })
  factoryPurchaseId?: string;

  @Prop({ trim: true, default: '' })
  factoryPurchaseNumber?: string;

  /** Set on that purchase; points back at the customer sale. */
  @Prop({ trim: true, default: '' })
  factorySaleId?: string;

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

  /** Day the order was taken. Period lists follow this, not the day the truck left. */
  @Prop({ type: Date })
  proformaDate?: Date;

  @Prop({ type: Date })
  shippedAt?: Date;

  /** Day the money was received. Independent of the order date and the ship date. */
  @Prop({ type: Date })
  paidAt?: Date;

  /** When the document was written. Independent of the proforma day and the ship day. */
  @Prop({ type: Date })
  registeredAt?: Date;

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
/** The invoices list is ordered by registration time, never by the (backdatable) invoice date. */
InvoiceSchema.index({ registeredAt: -1, createdAt: -1 });
