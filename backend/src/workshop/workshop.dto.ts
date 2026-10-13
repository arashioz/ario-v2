import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class WorkshopInputDto {
  @IsMongoId() productId: string;
  @IsNumber({ maxDecimalPlaces: 6 }) @Min(0.000001) @Max(1e9) quantity: number;
}
export class CreateWorkshopDto {
  @IsUUID() requestId: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => WorkshopInputDto)
  inputs: WorkshopInputDto[];
  @IsMongoId() outputProductId: string;
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(1e9)
  outputQuantity: number;
  @IsNumber() @Min(0) @Max(1e15) packagingCost: number;
  @IsNumber() @Min(0) @Max(1e15) laborCost: number;
  @IsNumber() @Min(0) @Max(1e15) sellPrice: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
