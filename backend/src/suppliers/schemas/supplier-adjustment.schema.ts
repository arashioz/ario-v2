import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SupplierAdjustmentDocument = SupplierAdjustment & Document;

/** opening = مانده اول دوره. reconcile = اصلاح مانده بدون دست زدن به فاکتور یا واریز. */
export const ADJUSTMENT_KINDS = ['opening', 'reconcile'] as const;

/**
 * A signed memo on a supplier account.
 * Positive amount increases what we owe. Negative amount decreases it.
 * It never deletes or rewrites a purchase or a payment.
 */
@Schema({ timestamps: true, collection: 'supplieradjustments' })
export class SupplierAdjustment {
  @Prop({ required: true, trim: true, index: true })
  supplier: string;

  @Prop({ type: Date, required: true, index: true })
  date: Date;

  /** Signed toman. Positive = بدهکارتر می‌شویم. Negative = بستانکار می‌شویم. */
  @Prop({ required: true })
  amount: number;

  @Prop({ enum: ADJUSTMENT_KINDS, default: 'reconcile' })
  kind: string;

  /** Stable key for imports. Empty for memos typed in the app. */
  @Prop({ trim: true, unique: true, sparse: true })
  externalRef?: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ trim: true, default: '' })
  notes: string;

  @Prop({ trim: true, default: '' })
  relatedInvoiceNumber: string;

  @Prop({ default: 'مدیر سیستم' })
  createdByName: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const SupplierAdjustmentSchema = SchemaFactory.createForClass(SupplierAdjustment);
SupplierAdjustmentSchema.index({ supplier: 1, date: 1 });
