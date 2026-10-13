import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { WorkshopBatch, WorkshopBatchSchema } from './workshop.schema';
import { WorkshopService } from './workshop.service';
import { WorkshopController } from './workshop.controller';
import { Invoice, InvoiceSchema } from '../invoices/schemas/invoice.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: WorkshopBatch.name, schema: WorkshopBatchSchema },
    ]),
  ],
  providers: [WorkshopService],
  controllers: [WorkshopController],
})
export class WorkshopModule {}
