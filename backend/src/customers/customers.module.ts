import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { Customer, CustomerSchema } from './schemas/customer.schema';
import {
  CustomerTransaction,
  CustomerTransactionSchema,
} from './schemas/customer-transaction.schema';
import { Invoice, InvoiceSchema } from '../invoices/schemas/invoice.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: CustomerTransaction.name, schema: CustomerTransactionSchema },
      { name: Invoice.name, schema: InvoiceSchema },
    ]),
  ],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
