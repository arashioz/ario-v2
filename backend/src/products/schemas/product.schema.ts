import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ProductDocument = Product & Document;

@Schema({ _id: false })
export class PriceHistoryItem {
  @Prop({ required: true })
  oldPrice: number;

  @Prop({ required: true })
  newPrice: number;

  @Prop({ default: 'تغییر قیمت پایه' })
  reason: string;

  @Prop({ default: 'کاربر سیستم' })
  changedByName: string;

  @Prop({ type: Date, default: Date.now })
  date: Date;
}

export const PriceHistoryItemSchema =
  SchemaFactory.createForClass(PriceHistoryItem);

@Schema({ timestamps: true })
export class Product {
  @Prop({ required: true, trim: true, index: true })
  name: string;

  @Prop({ trim: true, index: true })
  barcode?: string;

  @Prop({ trim: true, default: 'عمومی', index: true })
  category: string;

  @Prop({ trim: true, default: '', index: true })
  subcategory?: string;

  /** Default supplier company for purchases of this product. */
  @Prop({ trim: true, default: '' })
  supplierName?: string;

  @Prop({ trim: true, default: 'عدد' })
  unit: string;

  @Prop({ default: false, index: true })
  hasDualUnit: boolean;

  @Prop({ trim: true, default: 'کیلوگرم' })
  secondaryUnit?: string;

  @Prop({ default: 1 })
  unitRatio?: number; // e.g. 1 package = 3 kg

  @Prop({ default: 0 })
  weightPerUnitKg?: number; // Weight in kg for 1 primary unit

  @Prop({ required: true, default: 0 })
  buyPrice: number;

  @Prop({ required: true, default: 0, index: true })
  sellPrice: number; // قیمت پایه / پیش‌فرض

  @Prop({ default: 0 })
  priceRetail?: number; // قیمت مصرف‌کننده / تکی

  @Prop({ default: 0 })
  priceSupermarket?: number; // قیمت سوپرمارکت و فروشگاه

  @Prop({ default: 0 })
  priceWholesale?: number; // قیمت عمده و بنک‌داری

  /** Last time any sell price tier was set; price suggestions compare against the purchase cost at that moment. */
  @Prop()
  priceSetAt?: Date;

  /** Base cost per kg (incl. inflation buffer) a suggested price was built on; cleared when prices are set by hand. */
  @Prop()
  priceCostBasisPerKg?: number;

  @Prop({ required: true, default: 0, index: true })
  stock: number;

  @Prop({ default: 5 })
  minStockAlert: number;

  @Prop({ type: [PriceHistoryItemSchema], default: [] })
  priceHistory: PriceHistoryItem[];

  @Prop({ trim: true })
  description?: string;

  /** File name under uploads/products; served by the public images route. */
  @Prop({ trim: true, default: '' })
  image?: string;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const ProductSchema = SchemaFactory.createForClass(Product);
ProductSchema.index({ name: 'text', barcode: 'text', category: 'text' });
