import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type HistoricalRebuildRunDocument = HistoricalRebuildRun & Document;

export interface SourceFingerprint {
  n: number;
  finalAmount: number;
  totalAmount: number;
  lineMoney: number;
  lineQty: number;
}

@Schema({ timestamps: true, collection: 'historical_rebuild_runs' })
export class HistoricalRebuildRun {
  @Prop({ required: true, unique: true, default: 'v1' })
  version: string;

  @Prop({ default: 'idle' })
  phase: string;

  @Prop({ default: false })
  busy: boolean;

  @Prop({ default: '' })
  cursor: string;

  @Prop({ default: 0 })
  purchases: number;

  @Prop({ default: 0 })
  salesTotal: number;

  @Prop({ default: 0 })
  salesSeen: number;

  @Prop({ default: 0 })
  profitsUpdated: number;

  @Prop({ default: 0 })
  profitsUnchanged: number;

  @Prop({ default: 0 })
  unresolved: number;

  @Prop({ default: 0 })
  periods: number;

  @Prop({ type: Date })
  from?: Date;

  @Prop({ type: Date })
  to?: Date;

  @Prop({ type: Object })
  source?: SourceFingerprint;

  @Prop({ default: false })
  pricesDone: boolean;

  @Prop({ default: false })
  profitsDone: boolean;

  @Prop({ default: false })
  performanceDone: boolean;

  @Prop({ default: '' })
  error: string;

  /** Which report modules were refreshed after the operator confirmed. */
  @Prop({ default: '' })
  reportNote: string;
}

export const HistoricalRebuildRunSchema = SchemaFactory.createForClass(HistoricalRebuildRun);
