import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountingService, COST_BASES, SUGGEST_MODES } from './accounting.service';
import { ProfitWatchService } from './profit-watch.service';
import type { CostBasis, SuggestMode } from './accounting.service';

interface SuggestQuery {
  markup?: string;
  mode?: string;
  basis?: string;
  inflation?: string;
  holdDays?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('accounting')
export class AccountingController {
  constructor(
    private readonly accounting: AccountingService,
    private readonly watcher: ProfitWatchService,
  ) {}

  /** `today` and `monthFrom` come from the client so "this month" follows the Jalali calendar. */
  @Get('dashboard')
  dashboard(@Query('today') today: string, @Query('monthFrom') monthFrom: string) {
    return this.accounting.dashboard(today, monthFrom);
  }

  @Get('inventory')
  inventory(@Query('from') from?: string, @Query('to') to?: string) {
    return this.accounting.inventory({ from, to });
  }

  @Get('profit')
  profit(@Query('from') from?: string, @Query('to') to?: string, @Query('channel') channel?: string) {
    const lane = channel === 'shop' || channel === 'factory' ? channel : 'all';
    return this.accounting.profit({ from, to }, lane);
  }

  @Get('credit')
  credit(@Query('from') from?: string, @Query('to') to?: string) {
    return this.accounting.credit({ from, to });
  }

  @Get('invoice/:id')
  invoice(@Param('id') id: string) {
    return this.accounting.invoiceProfit(id);
  }

  @Get('inflation')
  inflation(@Query('from') from?: string, @Query('to') to?: string, @Query('general') general?: string) {
    return this.accounting.inflation({ from, to }, Number(general) || 0);
  }

  @Get('price-suggestions')
  priceSuggestions(@Query() q: SuggestQuery & { days?: string }) {
    return this.accounting.priceSuggestions({ ...suggestOpts(q), recentDays: Number(q.days) || undefined });
  }

  @Get('purchase-impact/:id')
  purchaseImpact(@Param('id') id: string, @Query() q: SuggestQuery) {
    return this.accounting.purchaseImpact(id, suggestOpts(q));
  }

  @Get('price-chart')
  priceChart() {
    return this.accounting.priceChart();
  }

  /** نگهبان سود: بررسی خودکار و قاعده‌محور همه فاکتورها (بدون مدل زبانی). */
  @Get('watch')
  watch(@Query('severity') severity?: string) {
    return this.watcher.report(severity);
  }

  @Post('watch/scan')
  @HttpCode(HttpStatus.OK)
  async rescan() {
    await this.watcher.scan(true);
    return this.watcher.report();
  }

  @Post('watch/dismiss')
  @HttpCode(HttpStatus.OK)
  dismiss(@Body() body: { id: string; note?: string }, @Request() req: any) {
    if (!body?.id) throw new BadRequestException('شناسه مورد لازم است');
    return this.watcher.dismiss(body.id, body.note || '', req.user?.fullName || req.user?.username || '');
  }

  @Post('watch/restore')
  @HttpCode(HttpStatus.OK)
  restore(@Body() body: { id: string }) {
    if (!body?.id) throw new BadRequestException('شناسه مورد لازم است');
    return this.watcher.restore(body.id);
  }
}

const optNum = (v?: string) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : undefined);

const suggestOpts = (q: SuggestQuery) => ({
  markup: optNum(q.markup),
  mode: SUGGEST_MODES.includes(q.mode as SuggestMode) ? (q.mode as SuggestMode) : undefined,
  basis: COST_BASES.includes(q.basis as CostBasis) ? (q.basis as CostBasis) : undefined,
  monthlyInflation: optNum(q.inflation),
  holdDays: optNum(q.holdDays),
});
