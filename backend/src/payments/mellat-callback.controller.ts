import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { PaymentsService, type MellatCallbackBody } from './payments.service';

/**
 * The bank's own door: Beh-Pardakht POSTs the customer back here with the fields of document
 * table 10 (RefId, ResCode, SaleOrderId, SaleReferenceId, CardHolderPan, FinalAmount).
 *
 * Deliberately NOT behind JwtAuthGuard — the browser of a logged-out customer lands here — and it
 * trusts nothing: every answer is re-confirmed with bpVerifyRequest/bpSettleRequest before the shop
 * books anything (handleCallback does that).
 */
@Controller('payments/mellat')
export class MellatCallbackController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('callback')
  @HttpCode(200)
  async callback(@Body() body: MellatCallbackBody, @Req() req: any, @Res() res: any) {
    const result = await this.payments.handleCallback(body || {});
    const target = this.payments.returnUrl(req, result);

    // 303 so the browser re-enters the SPA with a plain GET instead of replaying the bank's POST.
    if (res.redirect) return res.redirect(303, target);
    return res.status(200).json(result);
  }

  /** Some terminals probe the return link with GET; show a readable page instead of a 404. */
  @Get('callback')
  page(@Query('mellat') outcome?: string, @Query('mellatMsg') message?: string) {
    const ok = outcome === 'ok';
    return [
      '<!doctype html><html dir="rtl" lang="fa"><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      `<title>${ok ? 'پرداخت انجام شد' : 'پرداخت انجام نشد'}</title>`,
      '<body style="font-family:system-ui;display:grid;place-items:center;min-height:90vh;margin:0;background:#f8fafc">',
      `<div style="text-align:center;padding:24px;max-width:340px">`,
      `<h2 style="color:${ok ? '#047857' : '#be123c'};margin:0 0 8px">${ok ? '✓ پرداخت موفق' : '✕ پرداخت ناموفق'}</h2>`,
      `<p style="color:#475569;margin:0">${message ? decodeURIComponent(message) : 'به فروشگاه بازگردید.'}</p>`,
      '</div></body></html>',
    ].join('');
  }
}
