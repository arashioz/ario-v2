# درگاه اینترنتی بانک ملت (Beh-Pardakht Mellat IPG)

Replace the old gateway with the bank's own SOAP service. Nothing here talks to a third-party
aggregator: the app is the acceptor (پذیرنده) and the bank is `bpm.shaparak.ir`.

## راه‌اندازی (one time)

1. **IP whitelist** — send the public IP of the app server to Beh-Pardakht. Without it every SOAP
   call answers `421` (IP نامعتبر است).
2. **Domain** — the `callBackUrl` must live under the domain registered for the terminal, or the
   bank answers `62`. Behind nginx the address is built from the incoming request, so a normal
   `http://<server>` install works; set `PUBLIC_APP_URL`/`MELLAT_CALLBACK_URL` if you put the app
   behind a domain or CDN.
3. **Credentials** in `.env` next to `docker-compose.yml`:

```
MELLAT_ENABLED=true
MELLAT_TERMINAL_ID=<شماره پایانه>
MELLAT_USER_NAME=<نام کاربری>
MELLAT_USER_PASSWORD=<رمز عبور>
MELLAT_CURRENCY=rials          # 1 تومان = ۱۰؛ only "toman" if the terminal itself is toman
MELLAT_ACCOUNT_ID=<id from settings.bankCards>   # where online sales are booked
```

`MELLAT_ENABLED=false` (default) keeps the gateway invisible in the UI, so a half-configured
server can never take money.

## جریان پرداخت

| # | Bank method | Where |
|---|-------------|-------|
| 1 | `bpPayRequest` | `POST /api/payments/mellat/invoice/:invoiceId` → returns `RefId` |
| 2 | bank page | the browser POSTs `RefId` to `startpay.mellat` (`openMellatPage()` — needs the shop's Referer) |
| 3 | callback | the bank POSTs `RefId, ResCode, SaleOrderId, SaleReferenceId, CardHolderPan, FinalAmount` to `/api/payments/mellat/callback` |
| 4 | `bpVerifyRequest` | always before trusting a callback; the answer decides |
| 5 | `bpSettleRequest` | without it the money is never cleared to the shop account |
| 6 | booking | `invoices.addPayment()` → customer ledger + cashbox, marked so a replay cannot double-pay |
| – | `bpInquiryRequest` | `POST /api/payments/mellat/:id/refresh` when a customer never came back |
| – | `bpReversalRequest` | automatic when verify says the sale is not ours (code 48 is left alone) |
| – | `bpRefundRequest` | `POST /api/payments/mellat/:id/refund` after settlement |

Keep the 20-minute rule from the document in mind: if `bpVerifyRequest` is not sent within 20
minutes of the payment, the gateway auto-reverses the sale — `refresh()` closes those rows.

## تست بدون بانک

```
node scripts/check-mellat-gateway.cjs
```

It pins the SOAP envelope against the live WSDL (document/literal wrapped,
`elementFormDefault="unqualified"`, empty `SOAPAction`, single `return` string) and walks the whole
state machine: pay → callback → verify → settle → booked, plus replay, forged callback,
cancellation + reversal and refund.
