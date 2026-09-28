import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CashTransactionDocument = CashTransaction & Document;

@Schema({ timestamps: true })
export class CashTransaction {
  @Prop({ required: true, trim: true })
  type: string; // sale_card, sale_cash, expense, etc.

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, enum: ['in', 'out'], default: 'in' })
  direction: string;

  @Prop({ trim: true, default: '' })
  description: string;

  @Prop({ trim: true })
  referenceId?: string;

  @Prop({ trim: true })
  referenceModel?: string;

  @Prop({ type: Date, default: Date.now })
  date: Date;
}

export const CashTransactionSchema = SchemaFactory.createForClass(CashTransaction);
