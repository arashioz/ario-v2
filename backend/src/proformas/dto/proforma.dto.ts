import { IsArray, IsEnum, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { DepositAccountsDto, SplitDetailsDto } from '../../invoices/dto/create-invoice.dto';

/** Sell price (and factory cost) edited on a pending proforma line. */
export class ProformaItemPriceDto {
  @IsString()
  productId: string;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  factoryUnitCost?: number;
}

/** Delivery / payment details that can change until the order ships. */
export class ProformaTermsDto {
  @IsOptional()
  @IsEnum(['none', 'customer', 'me'])
  shippingPayer?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingCost?: number;

  @IsOptional()
  @IsEnum(['pos', 'cash', 'transfer', 'cheque', 'credit', 'split'])
  paymentMethod?: string;

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
  @Min(0)
  paidAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  branchName?: string;

  @IsOptional()
  @IsEnum(['shop', 'factory'])
  fulfillment?: 'shop' | 'factory';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProformaItemPriceDto)
  items?: ProformaItemPriceDto[];
}

export class ShipProformaDto extends ProformaTermsDto {
  /** Invoice date; defaults to the moment it ships. */
  @IsOptional()
  @IsString()
  date?: string;
}
