import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ _id: false })
export class WorkshopLine {
  @Prop({ required: true }) productId: string;
  @Prop({ required: true }) productName: string;
  @Prop({ required: true }) unit: string;
  @Prop({ required: true }) quantity: number;
  @Prop({ default: 0 }) weightKg: number;
  @Prop({ required: true }) unitCost: number;
  @Prop({ default: '' }) category?: string;
}
const WorkshopLineSchema = SchemaFactory.createForClass(WorkshopLine);

@Schema({ timestamps: true })
export class WorkshopBatch {
  @Prop({ required: true, unique: true }) requestId: string;
  @Prop({
    required: true,
    enum: ['pending', 'completed', 'cancelled'],
    default: 'pending',
    index: true,
  })
  status: string;
  @Prop({ type: [WorkshopLineSchema], required: true }) inputs: WorkshopLine[];
  @Prop({ type: WorkshopLineSchema, required: true }) output: WorkshopLine;
  @Prop({ required: true }) packagingCost: number;
  @Prop({ required: true }) laborCost: number;
  @Prop({ default: 0 }) laborPercent: number;
  @Prop({ default: 0 }) laborFlatCost: number;
  @Prop({ required: true }) totalCost: number;
  @Prop({ required: true }) sellPrice: number;
  @Prop({ default: '' }) notes: string;
  @Prop({ required: true }) createdByName: string;
  @Prop({ type: Date, default: Date.now }) date: Date;
}
export type WorkshopBatchDocument = WorkshopBatch & Document;
export const WorkshopBatchSchema = SchemaFactory.createForClass(WorkshopBatch);
