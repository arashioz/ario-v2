import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { ADJUSTMENT_KINDS } from '../schemas/supplier-adjustment.schema';

export class CreateSupplierAdjustmentDto {
  @IsOptional()
  @IsString()
  supplier?: string;

  @IsDateString({}, { message: 'تاریخ نامعتبر است' })
  @IsNotEmpty()
  date: string;

  /** Signed toman. Must not be zero. */
  @IsNumber({}, { message: 'مبلغ باید عدد باشد' })
  @Min(-1e15)
  @Max(1e15)
  amount: number;

  @IsOptional()
  @IsIn(ADJUSTMENT_KINDS as unknown as string[])
  kind?: string;

  @IsOptional()
  @IsString()
  externalRef?: string;

  @IsString()
  @IsNotEmpty({ message: 'عنوان تعدیل الزامی است' })
  title: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  relatedInvoiceNumber?: string;
}

export class UpdateSupplierAdjustmentDto {
  @IsOptional()
  @IsString()
  supplier?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsNumber()
  @Min(-1e15)
  @Max(1e15)
  amount?: number;

  @IsOptional()
  @IsIn(ADJUSTMENT_KINDS as unknown as string[])
  kind?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  relatedInvoiceNumber?: string;
}
