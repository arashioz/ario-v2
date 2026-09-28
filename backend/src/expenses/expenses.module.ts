import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Expense, ExpenseSchema } from './schemas/expense.schema';
import { ExpenseCategory, ExpenseCategorySchema } from './schemas/expense-category.schema';
import { Invoice, InvoiceSchema } from '../invoices/schemas/invoice.schema';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [
    AccountingModule,
    MongooseModule.forFeature([
      { name: Expense.name, schema: ExpenseSchema },
      { name: ExpenseCategory.name, schema: ExpenseCategorySchema },
      { name: Invoice.name, schema: InvoiceSchema },
    ]),
  ],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
