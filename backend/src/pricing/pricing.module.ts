import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Invoice, InvoiceSchema } from '../invoices/schemas/invoice.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { PricePeriod, PricePeriodSchema } from './schemas/price-period.schema';
import { PricePeriodService } from './price-period.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PricePeriod.name, schema: PricePeriodSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  providers: [PricePeriodService],
  exports: [PricePeriodService],
})
export class PricingModule {}
