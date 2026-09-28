import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { HistoryService } from './history.service';
import { CashbookService } from './cashbook.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('history')
@UseGuards(JwtAuthGuard)
export class HistoryController {
  constructor(
    private readonly historyService: HistoryService,
    private readonly cashbook: CashbookService,
  ) {}

  @Get('cashbook')
  getCashbook(@Query('from') from?: string, @Query('to') to?: string) {
    return this.cashbook.cashbook({ from, to });
  }

  @Get('legacy-ledger')
  getLegacyLedger(@Query('type') type?: string, @Query('limit') limit?: string) {
    return this.cashbook.legacyLedger({ type, limit: limit ? parseInt(limit, 10) : undefined });
  }

  @Get('company-payments')
  getCompanyPayments() {
    return this.historyService.getCompanyPayments();
  }

  @Post('company-payments')
  addCompanyPayment(@Body() dto: any) {
    return this.historyService.addCompanyPayment(dto);
  }

  @Get('supplier-debts')
  getSupplierDebts() {
    return this.historyService.getSupplierDebts();
  }

  @Get('cash-transactions')
  getCashTransactions(@Query('limit') limit?: string) {
    return this.historyService.getCashTransactions(limit ? parseInt(limit, 10) : 100);
  }
}
