import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdatePriceDto {
  @IsNumber({}, { message: 'قیمت فروش جدید باید عدد باشد' })
  @Min(0, { message: 'قیمت فروش نمی‌تواند منفی باشد' })
  @IsNotEmpty({ message: 'قیمت فروش جدید الزامی است' })
  newSellPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  newBuyPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceSupermarket?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceWholesale?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costBasisPerKg?: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateStockDto {
  @IsNumber({}, { message: 'تعداد تغییر موجودی باید عدد باشد' })
  @IsNotEmpty({ message: 'مقدار تغییر موجودی الزامی است' })
  quantityChange: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class BulkPriceUpdateDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsString()
  @IsNotEmpty()
  type: 'percentage' | 'fixed'; // percentage (مثلا ۱۰٪ افزایش) یا fixed (مثلا ۵۰۰۰ تومان افزایش)

  @IsNumber()
  value: number; // مثلا 10 یا 5000 (یا منفی برای تخفیف)

  @IsOptional()
  @IsString()
  reason?: string;
}
