import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type WatchDismissalDocument = WatchDismissal & Document;

/** A profit-watch finding the owner has reviewed and accepted as correct. */
@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'profitwatchdismissals' })
export class WatchDismissal {
  @Prop({ required: true, unique: true })
  findingId: string;

  @Prop({ default: '' })
  note: string;

  @Prop({ default: '' })
  byName: string;

  createdAt?: Date;
}

export const WatchDismissalSchema = SchemaFactory.createForClass(WatchDismissal);
