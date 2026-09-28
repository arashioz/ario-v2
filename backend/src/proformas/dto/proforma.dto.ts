import { IsEnum, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { DepositAccountsDto, SplitDetailsDto } from '../../invoices/dto/create-invoice.dto';

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
}

export class ShipProformaDto extends ProformaTermsDto {
  /** Invoice date; defaults to the moment it ships. */
  @IsOptional()
  @IsString()
  date?: string;
}
