import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CompanyPayment, CompanyPaymentSchema } from './schemas/company-payment.schema';
import { SupplierDebt, SupplierDebtSchema } from './schemas/supplier-debt.schema';
import { CashTransaction, CashTransactionSchema } from './schemas/cash-transaction.schema';
import { CashboxAdjustment, CashboxAdjustmentSchema } from './schemas/cashbox-adjustment.schema';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';
import { CashbookService } from './cashbook.service';
import { Invoice, InvoiceSchema } from '../invoices/schemas/invoice.schema';
import { CustomerTransaction, CustomerTransactionSchema } from '../customers/schemas/customer-transaction.schema';
import { Expense, ExpenseSchema } from '../expenses/schemas/expense.schema';
import { SupplierPayment, SupplierPaymentSchema } from '../suppliers/schemas/supplier-payment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CompanyPayment.name, schema: CompanyPaymentSchema },
      { name: SupplierDebt.name, schema: SupplierDebtSchema },
      { name: CashTransaction.name, schema: CashTransactionSchema },
      { name: CashboxAdjustment.name, schema: CashboxAdjustmentSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: CustomerTransaction.name, schema: CustomerTransactionSchema },
      { name: Expense.name, schema: ExpenseSchema },
      { name: SupplierPayment.name, schema: SupplierPaymentSchema },
    ]),
  ],
  controllers: [HistoryController],
  providers: [HistoryService, CashbookService],
  exports: [HistoryService],
})
export class HistoryModule {}
