import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { Invoice, InvoiceSchema } from '../invoices/schemas/invoice.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { ProformasModule } from '../proformas/proformas.module';
import { WatchController } from './watch.controller';
import { WatchService } from './watch.service';

@Module({
  imports: [
    ProformasModule,
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [WatchController],
  providers: [WatchService],
  exports: [WatchService],
})
export class WatchModule {}
