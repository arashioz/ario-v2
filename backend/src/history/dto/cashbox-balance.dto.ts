import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SetCashboxBalanceDto {
  @IsIn(['cash', 'pos', 'transfer'])
  method: 'cash' | 'pos' | 'transfer';

  @IsNumber({}, { message: 'مبلغ باید عدد باشد' })
  @Min(0, { message: 'موجودی نمی‌تواند منفی باشد' })
  balance: number;

  @IsOptional()
  @IsString()
  note?: string;
}
