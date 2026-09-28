import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ShareLinkDocument = ShareLink & Document;

export const SHARE_KINDS = ['supplier-payments'] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

/** A public, unguessable link to a live report (and its uploaded PDF). */
@Schema({ timestamps: true, collection: 'sharelinks' })
export class ShareLink {
  @Prop({ required: true, unique: true, index: true })
  token: string;

  @Prop({ type: String, enum: SHARE_KINDS, required: true })
  kind: ShareKind;

  @Prop({ type: Object, default: {} })
  params: Record<string, string>;

  @Prop({ trim: true, default: '' })
  title: string;

  @Prop({ trim: true, default: '' })
  pdfFile?: string;

  @Prop({ default: 'مدیر سیستم' })
  createdByName: string;

  createdAt?: Date;
}

export const ShareLinkSchema = SchemaFactory.createForClass(ShareLink);
