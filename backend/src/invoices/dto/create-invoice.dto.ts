import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class InvoiceItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsNotEmpty()
  productName: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsString()
  @IsNotEmpty()
  unit: string;

  @IsOptional()
  @IsNumber()
  secondaryQuantity?: number;

  @IsOptional()
  @IsString()
  secondaryUnit?: string;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsNumber()
  @Min(0)
  totalPrice: number;

  @IsOptional()
  @IsNumber()
  weightKg?: number;

  /** Purchase line: false means the goods are not in the shop yet. */
  @IsOptional()
  @IsBoolean()
  received?: boolean;

  /** Parent-company price per unit. Only used when the sale ships from the factory. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  factoryUnitCost?: number;
}

export class SplitDetailsDto {
  @IsOptional()
  @IsNumber()
  pos?: number = 0;

  @IsOptional()
  @IsNumber()
  cash?: number = 0;

  @IsOptional()
  @IsNumber()
  transfer?: number = 0;

  @IsOptional()
  @IsNumber()
  cheque?: number = 0;

  @IsOptional()
  @IsNumber()
  credit?: number = 0;
}

export class DepositAccountsDto {
  @IsOptional()
  @IsString()
  pos?: string;

  @IsOptional()
  @IsString()
  transfer?: string;
}

export class CreateInvoiceDto {
  @IsOptional()
  @IsEnum(['sale', 'purchase'])
  type?: string = 'sale';

  @IsOptional()
  @IsEnum(['retail', 'supermarket', 'wholesale'])
  saleType?: string = 'retail';

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsString()
  @IsNotEmpty({ message: 'نام طرف حساب الزامی است' })
  customerName: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  invoiceDate?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];

  @IsNumber()
  @Min(0)
  totalAmount: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number = 0;

  @IsNumber()
  @Min(0)
  finalAmount: number;

  @IsOptional()
  @IsNumber()
  totalWeightKg?: number = 0;

  @IsEnum(['pos', 'cash', 'transfer', 'cheque', 'credit', 'split'])
  paymentMethod: string = 'pos'; // پیش‌فرض کارتخوان

  @IsOptional()
  @ValidateNested()
  @Type(() => SplitDetailsDto)
  splitDetails?: SplitDetailsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DepositAccountsDto)
  depositAccounts?: DepositAccountsDto;

  @IsOptional()
  @IsNumber()
  paidAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(['none', 'customer', 'me'])
  shippingPayer?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingCost?: number;

  /** Days until the credit portion is due. Used when the invoice leaves a balance. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  dueDays?: number;

  /** Where the goods ship from. factory does not reduce shop stock. */
  @IsOptional()
  @IsEnum(['shop', 'factory'])
  fulfillment?: string;
}
