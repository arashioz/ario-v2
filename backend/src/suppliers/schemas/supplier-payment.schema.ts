import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type SupplierPaymentDocument = SupplierPayment & Document;

export const SUPPLIER_PAYMENT_METHODS = ['card_to_card', 'card', 'transfer', 'cash', 'cheque', 'pos'] as const;

@Schema({ _id: false })
export class PaymentAllocation {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Invoice' })
  invoiceId: Types.ObjectId;

  @Prop()
  invoiceNumber: string;

  @Prop()
  amount: number;
}
const PaymentAllocationSchema = SchemaFactory.createForClass(PaymentAllocation);

/** A payment made to a supplier (mostly the parent company) against purchase invoices. */
@Schema({ timestamps: true, collection: 'supplierpayments' })
export class SupplierPayment {
  @Prop({ required: true, trim: true, index: true })
  supplier: string;

  @Prop({ required: true, min: 1 })
  amount: number;

  @Prop({ type: Date, required: true, index: true })
  date: Date;

  @Prop({ enum: SUPPLIER_PAYMENT_METHODS, default: 'card_to_card' })
  method: string;

  /** Whose account the money went to (e.g. "محسن بلالی"). */
  @Prop({ trim: true, default: '' })
  destination: string;

  /** Card number / IBAN of the destination, if known. */
  @Prop({ trim: true, default: '' })
  destinationAccount: string;

  @Prop({ trim: true, default: '' })
  notes: string;

  /** Supplier text as recorded in the old system. */
  @Prop({ trim: true, default: '' })
  rawSupplier: string;

  /** Stable key so an import can be run twice without a second payment. */
  @Prop({ trim: true, unique: true, sparse: true })
  externalRef?: string;

  @Prop({ index: true, sparse: true })
  legacyId?: string;

  /** Purchase invoices this payment settled, oldest first (recomputed on every change). */
  @Prop({ type: [PaymentAllocationSchema], default: [] })
  allocations: PaymentAllocation[];

  @Prop({ default: 'مدیر سیستم' })
  createdByName: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const SupplierPaymentSchema = SchemaFactory.createForClass(SupplierPayment);
SupplierPaymentSchema.index({ supplier: 1, date: 1 });
