import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  PaymentMethod,
  TransactionType,
} from '../schemas/customer-transaction.schema';

export class RecordTransactionDto {
  @IsIn(['payment', 'debt', 'adjustment'], {
    message: 'نوع تراکنش باید payment (دریافت وجه) یا debt (بدهی جدید) یا adjustment باشد',
  })
  @IsNotEmpty({ message: 'نوع تراکنش الزامی است' })
  type: TransactionType;

  @IsNumber({}, { message: 'مبلغ باید عدد باشد' })
  @Min(1, { message: 'مبلغ تراکنش باید حداقل ۱ تومان باشد' })
  amount: number;

  @IsOptional()
  @IsIn(['cash', 'pos', 'transfer', 'cheque'], {
    message: 'روش پرداخت نامعتبر است',
  })
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  /** Payment only: settle this specific invoice instead of spreading over the oldest open ones. */
  @IsOptional()
  @IsString()
  invoiceId?: string;

  @IsOptional()
  @IsString()
  date?: string;

  /** Card payments: shop bank account (settings.bankCards[].id) the money landed in. */
  @IsOptional()
  @IsString()
  accountId?: string;
}
