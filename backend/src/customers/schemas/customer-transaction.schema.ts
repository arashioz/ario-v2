import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CustomerTransactionDocument = CustomerTransaction & Document;

export type TransactionType = 'debt' | 'payment' | 'adjustment';
export type PaymentMethod = 'cash' | 'pos' | 'transfer' | 'cheque';

@Schema({ timestamps: true })
export class CustomerTransaction {
  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true })
  customer: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['debt', 'payment', 'adjustment'],
    required: true,
  })
  type: TransactionType;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  balanceAfter: number;

  @Prop({
    type: String,
    enum: ['cash', 'pos', 'transfer', 'cheque'],
    default: 'cash',
  })
  paymentMethod?: PaymentMethod;

  @Prop({ trim: true, default: '' })
  description: string;

  @Prop({ trim: true })
  referenceNumber?: string;

  /** Card payments: shop bank account (settings.bankCards[].id) the money landed in. */
  @Prop({ trim: true, default: '' })
  accountId?: string;

  /** Set when the debt comes from, or the payment settles, a specific sale invoice. */
  @Prop({ type: Types.ObjectId, ref: 'Invoice', index: true })
  invoiceId?: Types.ObjectId;

  @Prop({ trim: true })
  invoiceNumber?: string;

  /** Payment only: how the amount was split across open invoices. */
  @Prop({
    type: [
      {
        _id: false,
        invoiceId: { type: Types.ObjectId, ref: 'Invoice' },
        invoiceNumber: String,
        amount: Number,
      },
    ],
    default: [],
  })
  allocations: { invoiceId: Types.ObjectId; invoiceNumber: string; amount: number }[];

  @Prop({ trim: true })
  recordedByName?: string;

  @Prop({ type: Date, default: Date.now })
  date: Date;
}

export const CustomerTransactionSchema =
  SchemaFactory.createForClass(CustomerTransaction);
CustomerTransactionSchema.index({ type: 1, date: -1 });
CustomerTransactionSchema.index({ 'allocations.invoiceId': 1 });
