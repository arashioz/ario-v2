import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

const actorName = (req: any) => req.user?.fullName || req.user?.username || 'کاربر سیستم';

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  create(@Body() createInvoiceDto: CreateInvoiceDto, @Request() req: any) {
    return this.invoicesService.create(createInvoiceDto, actorName(req));
  }

  @Get('stats')
  getStats() {
    return this.invoicesService.getStats();
  }

  @Get('last-purchase-prices')
  lastPurchasePrices(@Query('productIds') productIds?: string) {
    const ids = (productIds || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    return this.invoicesService.lastShopPurchasePrices(ids);
  }

  @Post('rebuild-stock')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  rebuildStock() {
    return this.invoicesService.rebuildStock();
  }

  @Get()
  findAll(
    @Query('type') type?: string,
    @Query('saleType') saleType?: string,
    @Query('customerId') customerId?: string,
    @Query('search') search?: string,
    @Query('isPaid') isPaid?: string,
  ) {
    return this.invoicesService.findAll({ type, saleType, customerId, search, isPaid });
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.invoicesService.findById(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: CreateInvoiceDto, @Request() req: any) {
    return this.invoicesService.update(id, dto, actorName(req));
  }

  @Post(':id/due')
  setDue(@Param('id') id: string, @Body() body: { dueDays?: number }) {
    return this.invoicesService.setDueDays(id, body?.dueDays ?? 15);
  }

  /** POST instead of DELETE so the confirmation password travels in the body reliably. */
  @Post(':id/delete')
  remove(@Param('id') id: string, @Body() body: { password?: string }, @Request() req: any) {
    return this.invoicesService.remove(id, req.user || {}, body?.password);
  }

  @Post(':id/payments')
  addPayment(
    @Param('id') id: string,
    @Body() body: { amount: number; paymentMethod?: string; description?: string; date?: string; accountId?: string },
    @Request() req: any,
  ) {
    return this.invoicesService.addPayment(id, body, actorName(req));
  }
}
