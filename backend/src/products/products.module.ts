import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductsService } from './products.service';
import { ProductsController, PublicProductsController } from './products.controller';
import { Product, ProductSchema } from './schemas/product.schema';
import { StockCount, StockCountSchema } from './schemas/stock-count.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: StockCount.name, schema: StockCountSchema },
    ]),
  ],
  controllers: [ProductsController, PublicProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
