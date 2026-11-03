import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WatchService } from './watch.service';

@UseGuards(JwtAuthGuard)
@Controller('watch')
export class WatchController {
  constructor(private readonly watch: WatchService) {}

  @Get('board')
  board() {
    return this.watch.board();
  }

  @Post('scan')
  scan() {
    return this.watch.scan();
  }

  @Get('customers/:id')
  resume(@Param('id') id: string, @Query('source') source?: string, @Query('invoiceId') invoiceId?: string) {
    return this.watch.resume(id, source, invoiceId);
  }

  @Get('customers/:id/suggest')
  suggest(@Param('id') id: string, @Query('source') source?: string, @Query('invoiceId') invoiceId?: string) {
    return this.watch.suggest(id, source, invoiceId);
  }

  @Post('customers/:id/proforma')
  toProforma(@Param('id') id: string, @Body() body: { source?: string; invoiceId?: string }, @Request() req: any) {
    const name = req.user?.fullName || req.user?.username || 'کاربر سیستم';
    return this.watch.toProforma(id, name, body || {});
  }
}
