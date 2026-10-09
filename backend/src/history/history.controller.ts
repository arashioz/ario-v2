import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { HistoryService } from './history.service';
import { CashbookService } from './cashbook.service';
import { SetCashboxBalanceDto } from './dto/cashbox-balance.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

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

  @Put('cashbox/balance')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  setCashboxBalance(@Body() dto: SetCashboxBalanceDto) {
    return this.cashbook.setBalance(dto.method, dto.balance, dto.note);
  }

  @Delete('cashbox/balance/:method')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  clearCashboxBalance(@Param('method') method: string) {
    if (method !== 'cash' && method !== 'pos' && method !== 'transfer') {
      throw new BadRequestException('روش صندوق نامعتبر است');
    }
    return this.cashbook.clearBalance(method);
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
