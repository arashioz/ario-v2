import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Invoice, InvoiceSchema } from '../invoices/schemas/invoice.schema';
import { SupplierPayment, SupplierPaymentSchema } from './schemas/supplier-payment.schema';
import { SupplierAdjustment, SupplierAdjustmentSchema } from './schemas/supplier-adjustment.schema';
import { SuppliersService } from './suppliers.service';
import { SuppliersController } from './suppliers.controller';
import { SupplierCompany, SupplierCompanySchema } from './schemas/supplier-company.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SupplierPayment.name, schema: SupplierPaymentSchema },
      { name: SupplierAdjustment.name, schema: SupplierAdjustmentSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: SupplierCompany.name, schema: SupplierCompanySchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [SuppliersService],
})
export class SuppliersModule {}
