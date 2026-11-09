import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreateMellatPaymentDto, RefundMellatPaymentDto } from './dto/create-mellat-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/** Shop-side API for the Mellat IPG. The bank never touches these routes. */
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Lets the UI hide the gateway entirely until an admin has configured a terminal. */
  @Get('mellat/capabilities')
  capabilities() {
    return this.payments.capabilities;
  }

  @Get('mellat')
  list(@Query('invoiceId') invoiceId?: string, @Query('status') status?: string) {
    return this.payments.list({ invoiceId, status });
  }

  /** Step 1 — bpPayRequest. Returns the RefId the browser must POST to the bank page. */
  @Post('mellat/invoice/:invoiceId')
  create(
    @Param('invoiceId') invoiceId: string,
    @Body() dto: CreateMellatPaymentDto,
    @Request() req: any,
  ) {
    const actor = { name: req.user?.name, username: req.user?.username };
    return this.payments.createForInvoice(invoiceId, dto, actor, req);
  }

  @Get('mellat/:id')
  get(@Param('id') id: string) {
    return this.payments.get(id);
  }

  /** bpInquiryRequest — reconciles a payment whose callback never arrived. */
  @Post('mellat/:id/refresh')
  refresh(@Param('id') id: string) {
    return this.payments.refresh(id);
  }

  /** bpReversalRequest — before the sale is booked. */
  @Post('mellat/:id/reverse')
  reverse(@Param('id') id: string) {
    return this.payments.reverse(id);
  }

  /** bpRefundRequest — after settlement, partly or fully. */
  @Post('mellat/:id/refund')
  refund(@Param('id') id: string, @Body() dto: RefundMellatPaymentDto) {
    return this.payments.refund(id, dto.amount, dto.note || '');
  }
}
