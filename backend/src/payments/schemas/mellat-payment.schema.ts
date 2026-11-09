import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type MellatPaymentDocument = MellatPayment & Document;

/** What the bank has confirmed so far. Mirrors the document's three-step sale flow. */
export type MellatPaymentStatus =
  | 'initiated' // bpPayRequest answered with a RefId, customer not back yet
  | 'failed' // callback said no, or the payment never completed
  | 'verified' // bpVerifyRequest ok, still to be settled
  | 'settled' // bpSettleRequest ok — the money is on its way to the merchant account
  | 'reversed' // bpReversalRequest ok — the customer got the money back
  | 'refunded'; // bpRefundRequest ok after settlement

@Schema({ timestamps: true, collection: 'mellat_payments' })
export class MellatPayment {
  /** Our own number for the bank: bpPayRequest needs it unique per request (document, table 1). */
  @Prop({ required: true, index: true, unique: true })
  orderId: number;

  /** SaleOrderId echoed back by the gateway in the callback; RefId is the bank's own hash. */
  @Prop({ type: String, index: true, default: '' })
  refId: string;

  @Prop({ type: String, index: true, default: '' })
  saleReferenceId: string;

  @Prop({ required: true, index: true })
  invoiceId: string;

  @Prop({ trim: true, default: '' })
  invoiceNumber: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer', required: false, index: true })
  customerId?: MongooseSchema.Types.ObjectId;

  @Prop({ trim: true, default: '' })
  customerName: string;

  /** Shop money unit — everything in this app is toman. */
  @Prop({ required: true, default: 0 })
  amountToman: number;

  /** What was actually sent to the terminal (rials unless MELLAT_CURRENCY=toman). */
  @Prop({ required: true, default: 0 })
  gatewayAmount: number;

  @Prop({ trim: true, default: '' })
  terminalId: string;

  @Prop({ trim: true, default: '' })
  callBackUrl: string;

  @Prop({ trim: true, default: '' })
  mobileNo: string;

  @Prop({
    required: true,
    enum: ['initiated', 'failed', 'verified', 'settled', 'reversed', 'refunded'],
    default: 'initiated',
    index: true,
  })
  status: MellatPaymentStatus;

  /** Last ResCode from the bank plus its Persian label, straight from table 11. */
  @Prop({ default: '' })
  resCode: string;

  @Prop({ default: '' })
  resLabel: string;

  /** First 6 / last 4 digits of the customer's card, as the gateway returns them. */
  @Prop({ default: '' })
  cardHolderPan: string;

  /** Raw callback body, kept for disputes with the bank. */
  @Prop({ type: Object, default: () => ({}) })
  callback: Record<string, any>;

  @Prop({ type: Date, default: null })
  callbackAt: Date | null;

  @Prop({ type: Date, default: null })
  verifiedAt: Date | null;

  @Prop({ type: Date, default: null })
  settledAt: Date | null;

  @Prop({ type: Date, default: null })
  reversedAt: Date | null;

  /** Set once the settled sale has been written into the customer ledger / cashbox. */
  @Prop({ type: Date, default: null })
  bookedAt: Date | null;

  /** Deposit account (settings.bankCards id) the sale was booked to. */
  @Prop({ default: '' })
  accountId: string;

  @Prop({ default: '' })
  recordedBy: string;

  @Prop({ default: '' })
  description: string;

  /** Refund requests keep their own unique orderId (document, table 6 note). */
  @Prop({ type: [Object], default: [] })
  refunds: { orderId: number; amountToman: number; gatewayAmount: number; resCode: string; at: Date }[];

  /** Filled by Mongoose (`timestamps: true`); declared here so callers can read it. */
  createdAt?: Date;
  updatedAt?: Date;
}

export const MellatPaymentSchema = SchemaFactory.createForClass(MellatPayment);

/** Simple atomic counter so every bpPayRequest gets its own never-reused orderId. */
export type MellatCounterDocument = MellatCounter & Document;

@Schema({ collection: 'mellat_counters' })
export class MellatCounter {
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ default: 0 })
  seq: number;
}

export const MellatCounterSchema = SchemaFactory.createForClass(MellatCounter);
