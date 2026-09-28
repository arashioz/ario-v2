import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SupplierBankAccountDto {
  @IsOptional() @IsString() holder?: string;
  @IsOptional() @IsString() bank?: string;
  @IsOptional() @IsString() cardNumber?: string;
  @IsOptional() @IsString() iban?: string;
  @IsOptional() @IsString() accountNumber?: string;
}

export class UpdateSupplierCompanyDto {
  @IsOptional() @IsString() @IsNotEmpty({ message: 'نام شرکت الزامی است' }) name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierBankAccountDto)
  accounts?: SupplierBankAccountDto[];
}

export class ReassignProductsDto {
  @IsArray()
  @IsString({ each: true })
  productIds: string[];

  @IsString()
  @IsNotEmpty({ message: 'نام شرکت مقصد الزامی است' })
  to: string;

  @IsOptional()
  @IsString()
  from?: string;
}

export class CreateSupplierCompanyDto {
  @IsString() @IsNotEmpty({ message: 'نام شرکت الزامی است' }) name: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierBankAccountDto)
  accounts?: SupplierBankAccountDto[];
}
