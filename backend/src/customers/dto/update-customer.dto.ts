import { IsIn, IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { CUSTOMER_KINDS, type CustomerKind } from '../schemas/customer.schema';

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  phoneSecondary?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsIn(CUSTOMER_KINDS, { message: 'نوع مشتری نامعتبر است' })
  kind?: CustomerKind;

  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;
}
