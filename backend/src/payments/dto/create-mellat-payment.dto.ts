import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** What the POS/invoice sheet may send when opening the bank page. */
export class CreateMellatPaymentDto {
  /** Toman. Omitted = the whole remaining debt of the invoice. */
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  /** Card-holder mobile; the bank uses it for its "saved cards" profile (document note). */
  @IsOptional()
  @IsString()
  @MaxLength(15)
  mobileNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class RefundMellatPaymentDto {
  @IsInt()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
