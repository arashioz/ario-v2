import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PerformanceSnapshotDocument = PerformanceSnapshot & Document;

@Schema({ timestamps: true, collection: 'performance_snapshots' })
export class PerformanceSnapshot {
  /** day = YYYY-MM-DD Tehran. month = 1404-07. year = 1404. meta = state. */
  @Prop({ required: true, enum: ['day', 'month', 'year', 'meta'], index: true })
  grain: string;

  @Prop({ required: true, index: true })
  key: string;

  @Prop({ default: 0 }) purchaseAmount: number;
  @Prop({ default: 0 }) purchaseKg: number;
  @Prop({ default: 0 }) purchaseCount: number;
  @Prop({ default: 0 }) saleAmount: number;
  @Prop({ default: 0 }) saleKg: number;
  @Prop({ default: 0 }) saleCount: number;
  @Prop({ default: 0 }) profitAmount: number;
  @Prop({ default: 0 }) paidIn: number;
  @Prop({ default: 0 }) paidOut: number;
  @Prop({ default: 0 }) avgBuyPerKg: number;
  @Prop({ default: 0 }) avgSellPerKg: number;
  @Prop({ default: 0 }) saleGrowth: number;
  @Prop({ default: 0 }) purchaseGrowth: number;
  @Prop({ default: 0 }) profitGrowth: number;
  @Prop({ type: Date }) rebuiltAt?: Date;
  @Prop({ default: false }) auto?: boolean;
  @Prop({ trim: true, default: '' }) lastComputedDay?: string;
}

export const PerformanceSnapshotSchema = SchemaFactory.createForClass(PerformanceSnapshot);
PerformanceSnapshotSchema.index({ grain: 1, key: 1 }, { unique: true });
