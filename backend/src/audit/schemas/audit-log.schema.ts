import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

export const AUDIT_ACTIONS = [
  'create',
  'update',
  'delete',
  'action',
  'login',
  'login_failed',
  'logout',
  'password',
  'alert',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

@Schema({ _id: false })
export class AuditChange {
  @Prop({ required: true })
  path: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  from?: unknown;

  @Prop({ type: MongooseSchema.Types.Mixed })
  to?: unknown;
}
export const AuditChangeSchema = SchemaFactory.createForClass(AuditChange);

/** Append-only: there is intentionally no API to edit or delete audit entries. */
@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'auditlogs' })
export class AuditLog {
  @Prop({ type: String, enum: AUDIT_ACTIONS, required: true, index: true })
  action: AuditAction;

  /** e.g. invoice, product, customer … (see audit-routes.ts) */
  @Prop({ index: true, default: '' })
  entity: string;

  @Prop({ default: '' })
  entityLabel: string;

  @Prop({ index: true, default: '' })
  entityId: string;

  /** Human readable, e.g. «حذف فاکتور SAL-050712-0003». */
  @Prop({ default: '' })
  title: string;

  @Prop()
  amount?: number;

  @Prop({ default: true, index: true })
  success: boolean;

  @Prop({ default: '' })
  error: string;

  @Prop({ index: true, default: '' })
  userId: string;

  @Prop({ default: '' })
  username: string;

  @Prop({ default: '' })
  userFullName: string;

  @Prop({ default: '' })
  userRole: string;

  @Prop({ default: '' })
  method: string;

  @Prop({ default: '' })
  path: string;

  @Prop()
  statusCode?: number;

  @Prop({ default: '' })
  ip: string;

  @Prop({ default: '' })
  userAgent: string;

  @Prop()
  durationMs?: number;

  /** Snapshot before the change — for deletions this is the deleted record. */
  @Prop({ type: MongooseSchema.Types.Mixed })
  before?: unknown;

  @Prop({ type: MongooseSchema.Types.Mixed })
  after?: unknown;

  /** Request payload with secrets removed. */
  @Prop({ type: MongooseSchema.Types.Mixed })
  body?: unknown;

  @Prop({ type: [AuditChangeSchema], default: [] })
  changes: AuditChange[];

  createdAt?: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
