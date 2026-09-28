import { IsOptional, IsString, IsNumber, Min } from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

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
  @IsNumber()
  @Min(0)
  buyPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sellPrice?: number;

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
  @IsNumber()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStockAlert?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
