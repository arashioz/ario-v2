import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ExpenseCategoryDocument = ExpenseCategory & Document;

@Schema({ timestamps: true })
export class ExpenseCategory {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({
    type: String,
    enum: ['withdrawal', 'shipping', 'salary', 'utilities', 'rent', 'other'],
    default: 'other',
  })
  type: string;

  @Prop({ default: 'tag' })
  icon: string;

  @Prop({ default: true })
  isBuiltin: boolean;

  @Prop({ default: true })
  active: boolean;

  @Prop({ default: 0 })
  sortOrder: number;
}

export const ExpenseCategorySchema = SchemaFactory.createForClass(ExpenseCategory);
