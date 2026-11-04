import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Headers,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { OrderRequestsService } from '../orders/order-requests.service';
import { Type } from 'class-transformer';
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

class SetInvoiceDateDto {
  @IsDateString({}, { message: 'تاریخ نامعتبر است' })
  @IsNotEmpty()
  invoiceDate: string;
}

class SetInvoiceDatesDto {
  @IsOptional()
  @IsDateString({}, { message: 'تاریخ پیش‌فاکتور نامعتبر است' })
  proformaDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'تاریخ ارسال نامعتبر است' })
  shippedAt?: string;

  @IsOptional()
  @IsDateString({}, { message: 'تاریخ پرداخت نامعتبر است' })
  paidAt?: string;

  @IsOptional()
  @IsDateString({}, { message: 'تاریخ ثبت نامعتبر است' })
  registeredAt?: string;
}

class SetDueDaysDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  dueDays: number;
}

const actorName = (req: any) => req.user?.fullName || req.user?.username || 'کاربر سیستم';

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService, private readonly orders: OrderRequestsService) {}

  @Post()
  create(@Body() createInvoiceDto: CreateInvoiceDto, @Request() req: any, @Headers('idempotency-key') key?: string) {
    return this.orders.run(key, req.user.id, 'invoice', createInvoiceDto, () => this.invoicesService.create(createInvoiceDto, actorName(req)));
  }

  @Get('stats')
  getStats() {
    return this.invoicesService.getStats();
  }

  @Get('factory-prices')
  factoryPrices(@Query('productIds') ids?: string) {
    return this.invoicesService.factoryPrices(ids?.split(',').map((id) => id.trim()).filter(Boolean));
  }

  @Get('price-board')
  priceBoard(@Query('company') company?: string) {
    return this.invoicesService.priceBoard(company);
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
    @Query('fulfillment') fulfillment?: string,
  ) {
    return this.invoicesService.findAll({ type, saleType, customerId, search, isPaid, fulfillment });
  }

  @Get(':id/relations')
  relations(@Param('id') id: string) {
    return this.invoicesService.relations(id);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.invoicesService.findById(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: CreateInvoiceDto,
    @Request() req: any,
    @Headers('x-confirm-password') confirmPassword?: string,
  ) {
    let password = typeof (dto as any)?.password === 'string' ? (dto as any).password : '';
    if (!password && confirmPassword) {
      try {
        password = decodeURIComponent(confirmPassword);
      } catch {
        password = confirmPassword;
      }
    }
    return this.invoicesService.update(id, dto, actorName(req), req.user || {}, password);
  }

  /** Order day, ship day, and payment day. The order day is what period lists use. */
  @Patch(':id/dates')
  setDates(@Param('id') id: string, @Body() body: SetInvoiceDatesDto) {
    return this.invoicesService.setDates(id, body);
  }

  /** Date only. Stock, prices, and lines stay as they are. */
  @Patch(':id/date')
  setDate(@Param('id') id: string, @Body() body: SetInvoiceDateDto) {
    return this.invoicesService.setInvoiceDate(id, body.invoiceDate);
  }

  @Post(':id/due')
  setDue(@Param('id') id: string, @Body() body: SetDueDaysDto) {
    return this.invoicesService.setDueDays(id, body.dueDays);
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
