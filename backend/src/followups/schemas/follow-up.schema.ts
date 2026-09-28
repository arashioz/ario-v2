import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type FollowUpDocument = FollowUp & Document;

export const FOLLOW_UP_RESULTS = [
  'answered', // صحبت شد
  'promised', // قول پرداخت / خرید داد
  'no_answer', // جواب نداد
  'busy', // مشغول / بعداً تماس
  'ordered', // سفارش داد
  'wrong_number', // شماره اشتباه
] as const;
export type FollowUpResult = (typeof FOLLOW_UP_RESULTS)[number];

@Schema({ timestamps: true })
export class FollowUp {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer', required: true, index: true })
  customer: MongooseSchema.Types.ObjectId;

  @Prop({ required: true, enum: FOLLOW_UP_RESULTS })
  result: FollowUpResult;

  /** Why this customer was on the follow-up list when called (debt / inactive / scheduled / manual). */
  @Prop({ trim: true })
  reason?: string;

  @Prop({ trim: true })
  note?: string;

  @Prop({ default: 0 })
  promisedAmount: number;

  @Prop({ type: Date })
  nextFollowUpAt?: Date;

  @Prop({ trim: true })
  createdByName?: string;
}

export const FollowUpSchema = SchemaFactory.createForClass(FollowUp);
FollowUpSchema.index({ createdAt: -1 });
