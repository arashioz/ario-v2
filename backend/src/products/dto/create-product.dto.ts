import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsString({ message: 'نام کالا باید رشته باشد' })
  @IsNotEmpty({ message: 'نام کالا الزامی است' })
  name: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  subcategory?: string;

  @IsOptional()
  @IsString()
  supplierName?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  hasDualUnit?: boolean;

  @IsOptional()
  @IsString()
  secondaryUnit?: string;

  @IsOptional()
  @IsNumber()
  unitRatio?: number;

  @IsOptional()
  @IsNumber()
  weightPerUnitKg?: number;

  @IsOptional()
  @IsNumber({}, { message: 'قیمت خرید باید عدد باشد' })
  @Min(0, { message: 'قیمت خرید نمی‌تواند منفی باشد' })
  buyPrice?: number;

  @IsNumber({}, { message: 'قیمت فروش (پایه) باید عدد باشد' })
  @Min(0, { message: 'قیمت فروش نمی‌تواند منفی باشد' })
  sellPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceRetail?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceSupermarket?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceWholesale?: number;

  @IsOptional()
  @IsNumber({}, { message: 'موجودی اولیه باید عدد باشد' })
  @Min(0, { message: 'موجودی نمی‌تواند منفی باشد' })
  stock?: number;

  @IsOptional()
  @IsNumber({}, { message: 'حداقل موجودی هشدار باید عدد باشد' })
  @Min(0)
  minStockAlert?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
