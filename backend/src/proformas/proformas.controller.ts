import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards, Headers } from '@nestjs/common';
import { OrderRequestsService } from '../orders/order-requests.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateInvoiceDto } from '../invoices/dto/create-invoice.dto';
import { ProformaTermsDto, ShipProformaDto } from './dto/proforma.dto';
import { ProformasService } from './proformas.service';

const actorName = (req: any) => req.user?.fullName || req.user?.username || 'کاربر سیستم';

@Controller('proformas')
@UseGuards(JwtAuthGuard)
export class ProformasController {
  constructor(private readonly proformas: ProformasService, private readonly orders: OrderRequestsService) {}

  @Post()
  create(@Body() dto: CreateInvoiceDto, @Request() req: any, @Headers('idempotency-key') key?: string) {
    return this.orders.run(key, req.user.id, 'proforma', dto, () => this.proformas.create(dto, actorName(req)));
  }

  @Get()
  findAll(@Query('status') status?: string) {
    return this.proformas.findAll(status);
  }

  @Get('summary')
  summary() {
    return this.proformas.summary();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.proformas.findById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: ProformaTermsDto) {
    return this.proformas.update(id, dto);
  }

  @Post(':id/ship')
  ship(@Param('id') id: string, @Body() dto: ShipProformaDto, @Request() req: any) {
    return this.proformas.ship(id, dto, actorName(req));
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.proformas.cancel(id);
  }
}
