import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SupplierCompanyDocument = SupplierCompany & Document;

/** A bank account of the company that payments can be sent to. */
@Schema({ _id: false })
export class SupplierBankAccount {
  @Prop({ trim: true, default: '' })
  holder: string;

  @Prop({ trim: true, default: '' })
  bank: string;

  @Prop({ trim: true, default: '' })
  cardNumber: string;

  @Prop({ trim: true, default: '' })
  iban: string;

  @Prop({ trim: true, default: '' })
  accountNumber: string;
}

@Schema({ timestamps: true, collection: 'suppliercompanies' })
export class SupplierCompany {
  @Prop({ required: true, unique: true, trim: true })
  name: string;

  @Prop({ trim: true, default: '' })
  phone: string;

  @Prop({ trim: true, default: '' })
  contactName: string;

  @Prop({ trim: true, default: '' })
  address: string;

  @Prop({ trim: true, default: '' })
  notes: string;

  @Prop({ type: [SchemaFactory.createForClass(SupplierBankAccount)], default: [] })
  accounts: SupplierBankAccount[];

  @Prop({ default: true })
  isActive: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const SupplierCompanySchema = SchemaFactory.createForClass(SupplierCompany);
