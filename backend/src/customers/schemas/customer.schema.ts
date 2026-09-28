import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CustomerDocument = Customer & Document;

/** shop: a store that buys to resell (full profile); walkin: a walk-in buyer, name and phone only. */
export const CUSTOMER_KINDS = ['shop', 'walkin'] as const;
export type CustomerKind = (typeof CUSTOMER_KINDS)[number];

@Schema({ timestamps: true })
export class Customer {
  @Prop({ required: true, trim: true, index: true })
  name: string;

  @Prop({ required: false, trim: true, index: true, default: '' })
  phoneNumber?: string;

  @Prop({ trim: true })
  phoneSecondary?: string;

  @Prop({ trim: true })
  address?: string;

  @Prop({
    trim: true,
    enum: ['retail', 'supermarket', 'wholesale'],
    default: 'supermarket',
    index: true,
  })
  customerType: string; // نوع مشتری: تکی، سوپرمارکت، عمده

  @Prop({ type: String, enum: CUSTOMER_KINDS, default: 'shop', index: true })
  kind: CustomerKind;

  @Prop({ type: Number, required: false })
  latitude?: number; // عرض جغرافیایی روی نقشه

  @Prop({ type: Number, required: false })
  longitude?: number; // طول جغرافیایی روی نقشه

  @Prop({ trim: true })
  notes?: string;

  /**
   * balance:
   * > 0 : بدهکار به فروشگاه (Customer owes the shop)
   * = 0 : تسویه (Settled)
   * < 0 : بستانکار (Shop owes the customer / advance payment)
   */
  @Prop({ default: 0, index: true })
  balance: number;

  @Prop({ default: 0 })
  creditLimit: number;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ type: Date, default: Date.now })
  lastTransactionDate: Date;

  // CRM follow-up
  @Prop({ type: Date, index: true })
  nextFollowUpAt?: Date;

  @Prop({ type: Date })
  lastContactAt?: Date;

  @Prop({ trim: true })
  lastContactResult?: string;

  @Prop({ trim: true })
  lastContactNote?: string;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
