import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierPaymentDto, UpdateSupplierPaymentDto } from './dto/supplier-payment.dto';
import { CreateSupplierCompanyDto, UpdateSupplierCompanyDto } from './dto/supplier-company.dto';

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
}
