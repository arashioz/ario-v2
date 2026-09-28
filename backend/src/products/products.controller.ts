import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProductsService, type CatalogTier } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  UpdatePriceDto,
  UpdateStockDto,
  BulkPriceUpdateDto,
} from './dto/product-operations.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('stats')
  async getStats() {
    return this.productsService.getStats();
  }

  @Post()
  async create(@Body() createProductDto: CreateProductDto, @Request() req: any) {
    const recordedByName = req.user?.fullName || req.user?.username || 'کاربر سیستم';
    return this.productsService.create(createProductDto, recordedByName);
  }

  @Post('bulk-price')
  async bulkUpdatePrices(
    @Body() dto: BulkPriceUpdateDto,
    @Request() req: any,
  ) {
    const recordedByName = req.user?.fullName || req.user?.username || 'کاربر سیستم';
    return this.productsService.bulkUpdatePrices(dto, recordedByName);
  }

  @Get()
  async findAll(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('lowStockOnly') lowStockOnly?: string,
  ) {
    return this.productsService.findAll({
      search,
      category,
      lowStockOnly: lowStockOnly === 'true',
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Patch('categories/rename')
  async renameCategory(@Body() body: { from?: string; to?: string; level?: string; parent?: string }) {
    return this.productsService.renameGroup({
      level: body.level === 'subcategory' ? 'subcategory' : 'category',
      from: body.from || '',
      to: body.to || '',
      parent: body.parent,
    });
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.productsService.update(id, updateProductDto);
  }

  @Patch(':id/price')
  async updatePrice(
    @Param('id') id: string,
    @Body() updatePriceDto: UpdatePriceDto,
    @Request() req: any,
  ) {
    const recordedByName = req.user?.fullName || req.user?.username || 'کاربر سیستم';
    return this.productsService.updatePrice(id, updatePriceDto, recordedByName);
  }

  @Patch(':id/stock')
  async updateStock(
    @Param('id') id: string,
    @Body() updateStockDto: UpdateStockDto,
  ) {
    return this.productsService.updateStock(id, updateStockDto);
  }

  @Post(':id/image')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadImage(@Param('id') id: string, @UploadedFile() file: any) {
    return this.productsService.saveImage(id, file);
  }

  @Delete(':id/image')
  async removeImage(@Param('id') id: string) {
    return this.productsService.removeImage(id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}

/** No auth: the online catalog and product photos are meant to be shared with customers. */
@Controller('public')
export class PublicProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('catalog')
  catalog(@Query('tier') tier?: string) {
    const t: CatalogTier = tier === 'wholesale' || tier === 'supermarket' ? tier : 'retail';
    return this.productsService.catalog(t);
  }

  @Get('products/images/:file')
  image(@Param('file') file: string, @Res() res: any) {
    const path = this.productsService.imagePath(file);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(path);
  }
}
