import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { SUPPLIER_PAYMENT_METHODS } from '../schemas/supplier-payment.schema';

export class CreateSupplierPaymentDto {
  @IsOptional()
  @IsString()
  supplier?: string;

  @IsNumber({}, { message: 'مبلغ باید عدد باشد' })
  @Min(1, { message: 'مبلغ نامعتبر است' })
  amount: number;

  @IsDateString({}, { message: 'تاریخ نامعتبر است' })
  @IsNotEmpty()
  date: string;

  @IsOptional()
  @IsIn(SUPPLIER_PAYMENT_METHODS as unknown as string[])
  method?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsString()
  destinationAccount?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateSupplierPaymentDto {
  @IsOptional()
  @IsString()
  supplier?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  amount?: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsIn(SUPPLIER_PAYMENT_METHODS as unknown as string[])
  method?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsString()
  destinationAccount?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
