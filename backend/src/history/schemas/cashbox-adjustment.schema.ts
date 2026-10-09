import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CashboxAdjustmentDocument = CashboxAdjustment & Document;

/** A manual correction so a drawer shows the balance the shop actually has. */
@Schema({ timestamps: true, collection: 'cashboxadjustments' })
export class CashboxAdjustment {
  @Prop({ required: true, unique: true, enum: ['cash', 'pos', 'transfer'] })
  method: 'cash' | 'pos' | 'transfer';

  /** Added to the balance computed from invoices, payments and expenses. */
  @Prop({ required: true, default: 0 })
  amount: number;

  @Prop({ trim: true, default: '' })
  note: string;
}

export const CashboxAdjustmentSchema = SchemaFactory.createForClass(CashboxAdjustment);
