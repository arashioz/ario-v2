import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

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
  @IsIn(['percentage', 'fixed', 'profit', 'base', 'round'])
  type: 'percentage' | 'fixed' | 'profit' | 'base' | 'round';

  @IsNumber()
  value: number; // مثلا 10 یا 5000 (یا منفی برای تخفیف)

  @IsOptional()
  @IsString()
  reason?: string;

  /** Return the old and new prices without saving. */
  @IsOptional()
  @IsBoolean()
  preview?: boolean;

  /** Round each new price to this many tomans. 1 keeps the exact toman. */
  @IsOptional()
  @IsIn([1, 10, 100, 1000, 10000])
  roundTo?: number;
}

export class StockCountLineDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @Min(0)
  countedQty: number;
}

export class ApplyStockCountDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockCountLineDto)
  lines: StockCountLineDto[];
}
