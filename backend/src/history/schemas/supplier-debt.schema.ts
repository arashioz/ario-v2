import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SupplierDebtDocument = SupplierDebt & Document;

@Schema({ timestamps: true })
export class SupplierDebt {
  @Prop({ required: true, trim: true })
  supplier: string;

  @Prop({ trim: true })
  purchaseInvoiceId?: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ default: 0 })
  paidAmount: number;

  @Prop({ type: Date, default: Date.now })
  date: Date;

  @Prop({ trim: true, default: '' })
  notes?: string;

  @Prop({ default: false })
  isSettled: boolean;
}

export const SupplierDebtSchema = SchemaFactory.createForClass(SupplierDebt);
