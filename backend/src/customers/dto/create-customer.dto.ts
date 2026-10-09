import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CUSTOMER_KINDS, type CustomerKind } from '../schemas/customer.schema';

export class CreateCustomerDto {
  @IsString({ message: 'نام مشتری الزامی است' })
  @IsNotEmpty({ message: 'نام مشتری نمی‌تواند خالی باشد' })
  name: string;

  @IsOptional()
  @IsString({ message: 'شماره تماس باید رشته باشد' })
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  phoneSecondary?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  branches?: string[];

  @IsOptional()
  @IsString()
  customerType?: string;

  @IsOptional()
  @IsIn(CUSTOMER_KINDS, { message: 'نوع مشتری نامعتبر است' })
  kind?: CustomerKind;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber({}, { message: 'مانده اولیه باید عدد باشد' })
  initialDebt?: number;

  @IsOptional()
  @IsNumber({}, { message: 'سقف اعتبار باید عدد باشد' })
  @Min(0, { message: 'سقف اعتبار نمی‌تواند منفی باشد' })
  creditLimit?: number;
}
