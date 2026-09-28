import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ShopNoteDocument = ShopNote & Document;

export const NOTE_COLORS = ['yellow', 'mint', 'pink', 'sky', 'lavender', 'peach'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

@Schema({ timestamps: true, collection: 'shopnotes' })
export class ShopNote {
  @Prop({ required: true, trim: true })
  text: string;

  @Prop({ default: false })
  done: boolean;

  @Prop({ default: 'yellow', enum: NOTE_COLORS })
  color: NoteColor;

  @Prop({ default: false })
  pinned: boolean;

  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({ trim: true })
  createdBy?: string;

  @Prop({ type: Date })
  doneAt?: Date;
}

export const ShopNoteSchema = SchemaFactory.createForClass(ShopNote);
