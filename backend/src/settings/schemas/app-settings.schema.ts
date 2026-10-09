import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AppSettingsDocument = AppSettings & Document;

export const SALES_LAYOUTS = ['cards', 'compact', 'table'] as const;
export type SalesLayout = (typeof SALES_LAYOUTS)[number];

@Schema({ _id: false })
export class SalesView {
  @Prop({ type: String, enum: SALES_LAYOUTS, default: 'cards' })
  layout: SalesLayout;

  @Prop({ default: true })
  groupByDay: boolean;

  @Prop({ default: true })
  showWeight: boolean;

  @Prop({ default: true })
  showPayment: boolean;

  @Prop({ default: false })
  showItems: boolean;

  @Prop({ default: true })
  showSaleType: boolean;
}

export const POS_LAYOUTS = ['grid', 'tiles', 'list'] as const;
export const POS_SIZES = ['sm', 'md'] as const;

/** How products are laid out on the sales (POS) screen. */
@Schema({ _id: false })
export class PosView {
  @Prop({ type: String, enum: POS_LAYOUTS, default: 'grid' })
  layout: (typeof POS_LAYOUTS)[number];

  @Prop({ type: String, enum: POS_SIZES, default: 'sm' })
  size: (typeof POS_SIZES)[number];

  @Prop({ default: true })
  showImages: boolean;

  @Prop({ default: true })
  showPerKg: boolean;

  @Prop({ default: true })
  showStock: boolean;
}

export const POS_SECTIONS = ['tiers', 'cart', 'search', 'categories', 'products'] as const;
export type PosSectionId = (typeof POS_SECTIONS)[number];

@Schema({ _id: false })
export class PosSection {
  @Prop({ type: String, enum: POS_SECTIONS, required: true })
  id: PosSectionId;

  @Prop({ default: true })
  visible: boolean;
}

/** Message bodies with {placeholders}; a line whose placeholder is empty is dropped when rendered. */
@Schema({ _id: false })
export class SmsTemplates {
  @Prop({ default: '' })
  invoice: string;

  @Prop({ default: '' })
  proforma: string;

  @Prop({ default: '' })
  debt: string;
}

/** A shop bank account money can be deposited to. `id` is what payments reference. */
@Schema({ _id: false })
export class BankCard {
  @Prop({ trim: true, default: '' })
  id: string;

  @Prop({ trim: true, default: '' })
  label: string;

  @Prop({ trim: true, default: '' })
  bankName: string;

  @Prop({ trim: true, default: '' })
  accountNumber: string;

  @Prop({ trim: true, default: '' })
  cardNumber: string;

  @Prop({ trim: true, default: '' })
  iban: string;

  @Prop({ trim: true, default: '' })
  accountHolder: string;

  @Prop({ default: false })
  isDefault: boolean;
}

/** Automatic daily database dump written on the server (see BackupModule). */
@Schema({ _id: false })
export class BackupSettings {
  @Prop({ default: true })
  enabled: boolean;

  /** Local hour (0-23) from which the day's backup is taken. */
  @Prop({ default: 2, min: 0, max: 23 })
  hour: number;

  @Prop({ default: 14, min: 1, max: 365 })
  keepDays: number;
}

/** Single document holding shop-wide preferences. */
@Schema({ timestamps: true, collection: 'appsettings' })
export class AppSettings {
  @Prop({ trim: true, default: 'فروشگاه آریو' })
  shopName: string;

  @Prop({ trim: true, default: '' })
  shopPhone: string;

  @Prop({ trim: true, default: '' })
  shopAddress: string;

  @Prop({ trim: true, default: '' })
  invoiceFooter: string;

  /** Cart weight from which the POS switches to supermarket prices. */
  @Prop({ default: 200 })
  supermarketMinKg: number;

  /** Cart weight from which the POS switches to wholesale prices. */
  @Prop({ default: 1500 })
  wholesaleMinKg: number;

  @Prop({ default: true })
  autoSaleType: boolean;

  /** Supermarket/wholesale orders start as a pre-invoice until shipped. */
  @Prop({ default: true })
  proformaForBulk: boolean;

  /**
   * Sales shipped straight from the parent company.
   * They do not touch Ario stock; a hidden factory cost is kept for profit.
   */
  @Prop({ default: false })
  factorySalesEnabled: boolean;

  @Prop({ type: SchemaFactory.createForClass(SalesView), default: () => ({}) })
  salesView: SalesView;

  @Prop({ type: SchemaFactory.createForClass(PosView), default: () => ({}) })
  posView: PosView;

  /** Order of category headings on the sales screen. Names not listed sort after these. */
  @Prop({ type: [String], default: [] })
  categoryOrder: string[];

  /** Order of subcategories per category on the sales screen. */
  @Prop({ type: Object, default: () => ({}) })
  subcategoryOrder: Record<string, string[]>;

  /** Order of product IDs on the sales screen. */
  @Prop({ type: [String], default: [] })
  productOrder: string[];

  /** Order and visibility of the blocks on the sales screen. */
  @Prop({ type: [SchemaFactory.createForClass(PosSection)], default: [] })
  posSections: PosSection[];

  @Prop({ type: [SchemaFactory.createForClass(BankCard)], default: [] })
  bankCards: BankCard[];

  @Prop({ type: SchemaFactory.createForClass(SmsTemplates), default: () => ({}) })
  smsTemplates: SmsTemplates;

  @Prop({ type: SchemaFactory.createForClass(BackupSettings), default: () => ({}) })
  backup: BackupSettings;

  /** Balances the old Ario app reported at export time (read-only reference). */
  @Prop({ type: Object, default: null })
  legacy?: { cashBalance?: number; cardBalance?: number; openingDate?: string; exportedAt?: string } | null;
}

export const AppSettingsSchema = SchemaFactory.createForClass(AppSettings);
