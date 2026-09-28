import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CompanyPaymentDocument = CompanyPayment & Document;

@Schema({ timestamps: true })
export class CompanyPayment {
  @Prop({ required: true, trim: true })
  supplier: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ default: 'card' })
  method: string;

  @Prop({ type: Date, default: Date.now })
  date: Date;

  @Prop({ trim: true, default: '' })
  notes?: string;

  @Prop({ default: 'مدیر سیستم' })
  createdBy: string;
}

export const CompanyPaymentSchema = SchemaFactory.createForClass(CompanyPayment);
