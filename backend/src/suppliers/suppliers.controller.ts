import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierPaymentDto, UpdateSupplierPaymentDto } from './dto/supplier-payment.dto';
import { CreateSupplierAdjustmentDto, UpdateSupplierAdjustmentDto } from './dto/supplier-adjustment.dto';
import { CreateSupplierCompanyDto, ReassignProductsDto, UpdateSupplierCompanyDto } from './dto/supplier-company.dto';

@UseGuards(JwtAuthGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  list() {
    return this.suppliers.suppliers();
  }

  /** Defaults to the parent company. */
  @Get('account')
  account(@Query('name') name?: string) {
    return this.suppliers.account(name);
  }

  /** دفتر معین: مانده تا قبل از بازه، گردش بدهکار و بستانکار، و خرید هر کالا در همان بازه. */
  @Get('statement')
  statement(@Query('name') name?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.suppliers.statement(name, from, to);
  }

  @Get('profile')
  profile(@Query('name') name?: string): Promise<Record<string, any>> {
    return this.suppliers.profile(name);
  }

  /** خروجی اکسل صورت‌حساب و مغایرت‌گیری برای شرکت مادر و سایر شرکت‌ها */
  @Get('export')
  async exportReconciliation(@Query('name') name: string | undefined, @Res({ passthrough: true }) res: Response) {
    const { csv, filename } = await this.suppliers.exportReconciliationCsv(name);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });
    return csv;
  }

  /** Move products (and their purchase invoices) from one company to another. */
  @Post('products/reassign')
  reassignProducts(@Body() dto: ReassignProductsDto) {
    return this.suppliers.reassignProducts(dto.from, dto.productIds || [], dto.to);
  }

  @Post('companies')
  createCompany(@Body() dto: CreateSupplierCompanyDto) {
    return this.suppliers.createCompany(dto);
  }

  @Patch('companies/:id')
  updateCompany(@Param('id') id: string, @Body() dto: UpdateSupplierCompanyDto) {
    return this.suppliers.updateCompany(id, dto);
  }

  @Delete('companies/:id')
  removeCompany(@Param('id') id: string) {
    return this.suppliers.removeCompany(id);
  }

  @Post('payments')
  createPayment(@Body() dto: CreateSupplierPaymentDto, @Request() req: any) {
    return this.suppliers.createPayment(dto, req.user?.fullName || req.user?.username || 'کاربر سیستم');
  }

  @Patch('payments/:id')
  updatePayment(@Param('id') id: string, @Body() dto: UpdateSupplierPaymentDto) {
    return this.suppliers.updatePayment(id, dto);
  }

  @Delete('payments/:id')
  removePayment(@Param('id') id: string) {
    return this.suppliers.removePayment(id);
  }

  /** Signed memo. Does not delete or rewrite purchases and payments. */
  @Post('adjustments')
  createAdjustment(@Body() dto: CreateSupplierAdjustmentDto, @Request() req: any) {
    return this.suppliers.createAdjustment(dto, req.user?.fullName || req.user?.username || 'کاربر سیستم');
  }

  @Patch('adjustments/:id')
  updateAdjustment(@Param('id') id: string, @Body() dto: UpdateSupplierAdjustmentDto) {
    return this.suppliers.updateAdjustment(id, dto);
  }

  @Delete('adjustments/:id')
  removeAdjustment(@Param('id') id: string) {
    return this.suppliers.removeAdjustment(id);
  }
}
