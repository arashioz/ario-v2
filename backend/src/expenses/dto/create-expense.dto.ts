import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ExpenseType } from '../schemas/expense.schema';

export class CreateExpenseDto {
  @IsEnum(['withdrawal', 'deposit', 'shipping', 'salary', 'utilities', 'rent', 'other'], {
    message: 'نوع هزینه نامعتبر است',
  })
  type: ExpenseType;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  categoryName?: string;

  @IsNotEmpty({ message: 'مبلغ الزامی است' })
  @IsNumber({}, { message: 'مبلغ باید عدد باشد' })
  @Min(1, { message: 'مبلغ باید بیشتر از صفر باشد' })
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  date?: string | Date;

  @IsOptional()
  isPersonalWithdrawal?: boolean;

  @IsOptional()
  @IsString()
  paymentMethod?: string;
}
