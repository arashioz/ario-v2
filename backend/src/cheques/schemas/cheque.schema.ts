import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type ChequeDocument = Cheque & Document;

@Schema({ timestamps: true })
export class Cheque {
  @Prop({
    required: true,
    enum: ['received', 'paid'],
    default: 'received',
    index: true,
  })
  type: string; // دریافتی از مشتری (received) یا پرداختی به تامین‌کننده (paid)

  @Prop({ required: true, trim: true, index: true })
  chequeNumber: string; // شماره سریال چک

  @Prop({ required: false, trim: true, index: true, default: '' })
  sayadNumber: string; // شناسه صیادی ۱۶ رقمی

  @Prop({ required: true, trim: true, default: 'ملی' })
  bankName: string; // نام بانک (ملی، ملت، صادرات، تجارت، ...)

  @Prop({ trim: true, default: '' })
  branchName?: string; // شعبه

  @Prop({ required: true, default: 0 })
  amount: number; // مبلغ چک به تومان

  @Prop({ type: Date, default: Date.now })
  issueDate: Date; // تاریخ صدور

  @Prop({ type: Date, required: true, index: true })
  dueDate: Date; // تاریخ سررسید چک

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer', required: false, index: true })
  customerId?: MongooseSchema.Types.ObjectId;

  @Prop({ required: true, trim: true })
  partyName: string; // طرف حساب: نام مشتری یا تامین‌کننده

  @Prop({ trim: true, default: '' })
  partyPhone?: string;

  @Prop({ trim: true, default: '' })
  drawerName?: string; // صادرکننده / صاحب حساب

  @Prop({
    required: true,
    enum: ['pending', 'passed', 'bounced', 'endorsed'],
    default: 'pending',
    index: true,
  })
  status: string; // در جریان (pending)، پاس شده (passed)، برگشتی (bounced)، خرج شده (endorsed)

  @Prop({ type: Date, required: false })
  statusDate?: Date;

  @Prop({ trim: true, default: '' })
  statusNotes?: string;

  @Prop({ trim: true, default: '' })
  invoiceNumber?: string; // شماره فاکتور مرتبط

  @Prop({ trim: true, default: '' })
  notes?: string;

  @Prop({ default: 'مدیر سیستم' })
  recordedByName: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ChequeSchema = SchemaFactory.createForClass(Cheque);
ChequeSchema.index({ type: 1, status: 1, dueDate: 1 });
ChequeSchema.index({ chequeNumber: 'text', sayadNumber: 'text', partyName: 'text' });
