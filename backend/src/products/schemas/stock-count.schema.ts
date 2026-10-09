import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type StockCountDocument = StockCount & Document;

@Schema({ _id: false })
export class StockCountLine {
  @Prop({ required: true })
  productId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  unit: string;

  @Prop({ required: true })
  systemQty: number;

  @Prop({ required: true })
  countedQty: number;

  @Prop({ required: true })
  delta: number;
}

export const StockCountLineSchema = SchemaFactory.createForClass(StockCountLine);

/** One finished physical count. Deltas are also stored on each product so a stock rebuild keeps them. */
@Schema({ timestamps: true, collection: 'stockcounts' })
export class StockCount {
  @Prop({ type: [StockCountLineSchema], default: [] })
  lines: StockCountLine[];

  @Prop({ default: 'مدیر سیستم' })
  createdByName: string;
}

export const StockCountSchema = SchemaFactory.createForClass(StockCount);
