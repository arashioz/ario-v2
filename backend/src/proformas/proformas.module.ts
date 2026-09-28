import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Proforma, ProformaSchema } from './schemas/proforma.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { InvoicesModule } from '../invoices/invoices.module';
import { ProformasService } from './proformas.service';
import { ProformasController } from './proformas.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Proforma.name, schema: ProformaSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Customer.name, schema: CustomerSchema },
    ]),
    InvoicesModule,
  ],
  controllers: [ProformasController],
  providers: [ProformasService],
})
export class ProformasModule {}
