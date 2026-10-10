import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PricePeriodDocument = PricePeriod & Document;

/** One buy-price span for a product. The next change closes it. */
@Schema({ timestamps: true, collection: 'priceperiods' })
export class PricePeriod {
  @Prop({ required: true, index: true })
  productId: string;

  @Prop({ trim: true, default: '' })
  productName: string;

  /** Buy price per stock unit during this span. */
  @Prop({ required: true })
  unitPrice: number;

  @Prop({ default: 0 })
  pricePerKg: number;

  /** First day this price applies, Tehran noon. */
  @Prop({ type: Date, required: true })
  from: Date;

  /** First day it no longer applies. Empty while this is the current price. */
  @Prop({ type: Date })
  to?: Date;

  @Prop({ trim: true, default: '' })
  invoiceId: string;

  @Prop({ trim: true, default: '' })
  invoiceNumber: string;
}

export const PricePeriodSchema = SchemaFactory.createForClass(PricePeriod);
PricePeriodSchema.index({ productId: 1, from: 1 });
