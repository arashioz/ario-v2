import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import {
  DepositAccounts,
  DepositAccountsSchema,
  InvoiceItem,
  InvoiceItemSchema,
  SplitPaymentDetails,
  SplitPaymentDetailsSchema,
} from '../../invoices/schemas/invoice.schema';

export type ProformaDocument = Proforma & Document;

/**
 * پیش‌فاکتور: a supermarket/wholesale order waiting for delivery.
 * It touches neither stock nor customer balances until it is shipped and becomes an invoice.
 */
@Schema({ timestamps: true })
export class Proforma {
  @Prop({ required: true, unique: true, index: true })
  number: string;

  @Prop({ type: String, enum: ['pending', 'shipped', 'cancelled'], default: 'pending', index: true })
  status: string;

  @Prop({ type: String, enum: ['retail', 'supermarket', 'wholesale'], default: 'wholesale' })
  saleType: string;

  /** shop: leaves Ario stock when shipped. factory: parent-company shipment, stock stays. */
  @Prop({ type: String, enum: ['shop', 'factory'], default: 'shop' })
  fulfillment: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer', index: true })
  customerId?: MongooseSchema.Types.ObjectId;

  @Prop({ required: true, trim: true })
  customerName: string;

  @Prop({ trim: true, default: '' })
  customerPhone?: string;

  @Prop({ trim: true, default: '' })
  branchName?: string;

  @Prop({ type: Date, default: Date.now })
  orderDate: Date;

  @Prop({ type: [InvoiceItemSchema], default: [] })
  items: InvoiceItem[];

  @Prop({ default: 0 })
  totalAmount: number;

  @Prop({ default: 0 })
  discount: number;

  @Prop({ default: 0 })
  finalAmount: number;

  @Prop({ default: 0 })
  totalWeightKg: number;

  @Prop({ type: String, enum: ['pos', 'cash', 'transfer', 'cheque', 'credit', 'split'], default: 'credit' })
  paymentMethod: string;

  @Prop({ type: SplitPaymentDetailsSchema, default: () => ({}) })
  splitDetails?: SplitPaymentDetails;

  @Prop({ type: DepositAccountsSchema, default: () => ({}) })
  depositAccounts?: DepositAccounts;

  @Prop({ default: 0 })
  paidAmount: number;

  /** Days after the invoice date until a credit balance is due. */
  @Prop({ default: 15 })
  dueDays: number;

  @Prop({ type: String, enum: ['none', 'customer', 'me'], default: 'none' })
  shippingPayer: string;

  @Prop({ default: 0 })
  shippingCost: number;

  @Prop({ trim: true, default: '' })
  notes?: string;

  @Prop({ trim: true })
  invoiceId?: string;

  @Prop({ trim: true })
  invoiceNumber?: string;

  @Prop({ type: Date })
  shippedAt?: Date;

  @Prop({ type: Date })
  cancelledAt?: Date;

  @Prop({ default: 'مدیر سیستم' })
  createdByName: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ProformaSchema = SchemaFactory.createForClass(Proforma);
ProformaSchema.index({ status: 1, orderDate: -1 });
