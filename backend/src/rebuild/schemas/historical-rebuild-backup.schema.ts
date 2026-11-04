import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type HistoricalRebuildBackupDocument = HistoricalRebuildBackup & Document;

/** Copy of derived data taken before the first rewrite, so rollback can put it back. */
@Schema({ timestamps: true, collection: 'historical_rebuild_backups', strict: false })
export class HistoricalRebuildBackup {
  @Prop({ required: true })
  kind: string;

  @Prop({ required: true, default: 'v1' })
  runId: string;

  @Prop({ default: '' })
  invoiceId: string;

  @Prop({ default: 0 })
  costAmount: number;

  @Prop({ default: 0 })
  profitAmount: number;

  @Prop({ type: [{ unitCost: Number, profit: Number }], default: [] })
  lines: { unitCost: number; profit: number }[];

  @Prop({ type: Object })
  payload?: Record<string, unknown>;
}

export const HistoricalRebuildBackupSchema = SchemaFactory.createForClass(HistoricalRebuildBackup);
HistoricalRebuildBackupSchema.index({ runId: 1, kind: 1, invoiceId: 1 });
