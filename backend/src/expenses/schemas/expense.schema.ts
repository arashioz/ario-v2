import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ExpenseDocument = Expense & Document;

export type ExpenseType =
  | 'withdrawal' // برداشت شخصی مدیر
  | 'deposit'    // واریز مدیر یا درآمد دیگر؛ از بدهی برداشت کم می‌شود
  | 'shipping'   // ارسال بار و کرایه
  | 'salary'     // حقوق و دستمزد پرسنل
  | 'utilities'  // قبوض و انرژی و نرم‌افزار
  | 'rent'       // اجاره محل
  | 'other';     // سایر هزینه‌های فروشگاه

@Schema({ timestamps: true })
export class Expense {
  @Prop({
    type: String,
    enum: ['withdrawal', 'deposit', 'shipping', 'salary', 'utilities', 'rent', 'other'],
    default: 'other',
    required: true,
    index: true,
  })
  type: ExpenseType;

  @Prop({ type: String, required: false })
  categoryId?: string;

  /** Invoice whose delivery (sale) or freight/unloading (purchase) this expense paid for. */
  @Prop({ type: String, required: false, index: true })
  invoiceId?: string;

  /** Purchase freight: already inside the goods' landed cost (COGS), so the P&L must not count it again. */
  @Prop({ type: Boolean, default: false })
  capitalized?: boolean;

  @Prop({ type: String, required: true, default: 'سایر هزینه‌ها' })
  categoryName: string;

  @Prop({ required: true, default: 0 })
  amount: number;

  @Prop({ trim: true, default: '' })
  description: string;

  @Prop({ type: Date, default: Date.now, index: true })
  date: Date;

  @Prop({ type: Boolean, default: false, index: true })
  isPersonalWithdrawal: boolean; // آیا برداشت شخصی مدیر است یا هزینه مغازه

  @Prop({
    type: String,
    enum: ['cash', 'card', 'transfer'],
    default: 'card',
  })
  paymentMethod: string;

  @Prop({ trim: true, default: 'مدیر فروشگاه' })
  recordedByName: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ExpenseSchema = SchemaFactory.createForClass(Expense);
ExpenseSchema.index({ date: -1, createdAt: -1 });
ExpenseSchema.index({ isPersonalWithdrawal: 1 });
