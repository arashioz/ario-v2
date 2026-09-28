import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateChequeDto {
  @IsEnum(['received', 'paid'], { message: 'نوع چک باید دریافتی یا پرداختی باشد' })
  type: string;

  @IsString({ message: 'شماره سریال چک الزامی است' })
  @IsNotEmpty({ message: 'شماره سریال چک نمی‌تواند خالی باشد' })
  chequeNumber: string;

  @IsOptional()
  @IsString()
  sayadNumber?: string;

  @IsString({ message: 'نام بانک الزامی است' })
  @IsNotEmpty({ message: 'نام بانک نمی‌تواند خالی باشد' })
  bankName: string;

  @IsOptional()
  @IsString()
  branchName?: string;

  @IsNumber({}, { message: 'مبلغ چک باید عددی باشد' })
  @Min(1000, { message: 'مبلغ چک باید حداقل ۱۰۰۰ تومان باشد' })
  amount: number;

  @IsOptional()
  @IsString()
  issueDate?: string;

  @IsString({ message: 'تاریخ سررسید الزامی است' })
  @IsNotEmpty({ message: 'تاریخ سررسید چک نمی‌تواند خالی باشد' })
  dueDate: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsString({ message: 'نام طرف حساب الزامی است' })
  @IsNotEmpty({ message: 'نام طرف حساب نمی‌تواند خالی باشد' })
  partyName: string;

  @IsOptional()
  @IsString()
  partyPhone?: string;

  @IsOptional()
  @IsString()
  drawerName?: string;

  @IsOptional()
  @IsEnum(['pending', 'passed', 'bounced', 'endorsed'])
  status?: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateChequeStatusDto {
  @IsEnum(['pending', 'passed', 'bounced', 'endorsed'], {
    message: 'وضعیت نامعتبر است (در جریان، پاس شده، برگشتی، خرج شده)',
  })
  status: string;

  @IsOptional()
  @IsString()
  statusDate?: string;

  @IsOptional()
  @IsString()
  statusNotes?: string;
}
