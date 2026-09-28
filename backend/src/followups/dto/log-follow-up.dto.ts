import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { FOLLOW_UP_RESULTS } from '../schemas/follow-up.schema';
import type { FollowUpResult } from '../schemas/follow-up.schema';

export class LogFollowUpDto {
  @IsEnum(FOLLOW_UP_RESULTS, { message: 'نتیجه تماس نامعتبر است' })
  result: FollowUpResult;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  promisedAmount?: number;

  /** ISO date; omitted = automatic based on result. Empty string = no further follow-up. */
  @IsOptional()
  @IsString()
  nextFollowUpAt?: string;
}
