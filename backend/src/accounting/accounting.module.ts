import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Invoice, InvoiceSchema } from '../invoices/schemas/invoice.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import {
  CustomerTransaction,
  CustomerTransactionSchema,
} from '../customers/schemas/customer-transaction.schema';
import { WatchDismissal, WatchDismissalSchema } from './schemas/watch-dismissal.schema';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { ProfitWatchService } from './profit-watch.service';
import { InvoicesModule } from '../invoices/invoices.module';
import { PricingModule } from '../pricing/pricing.module';
import { WorkshopBatch, WorkshopBatchSchema } from '../workshop/workshop.schema';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    InvoicesModule,
    PricingModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Product.name, schema: ProductSchema },
      { name: WorkshopBatch.name, schema: WorkshopBatchSchema },
      { name: CustomerTransaction.name, schema: CustomerTransactionSchema },
      { name: WatchDismissal.name, schema: WatchDismissalSchema },
    ]),
  ],
  controllers: [AccountingController],
  providers: [AccountingService, ProfitWatchService],
  exports: [AccountingService],
})
export class AccountingModule {}
