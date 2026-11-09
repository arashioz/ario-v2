/**
 * Offline check for the Beh-Pardakht Mellat gateway code — no bank, no database.
 * It pins the SOAP wire format against the live WSDL (document/literal wrapped,
 * elementFormDefault="unqualified", one `return` string per answer) and walks the whole
 * sale state machine: pay request → callback → verify → settle → booked in the shop.
 *
 *   node scripts/check-mellat-gateway.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../frontend/node_modules/typescript');

function load(file, dependencies, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      experimentalDecorators: true,
      emitDecoratorMetadata: false,
    },
  }).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    console,
    Date,
    Math,
    Number,
    Object,
    Array,
    JSON,
    String,
    Boolean,
    Error,
    RegExp,
    Intl,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    Promise,
    require: (id) => {
      assert.ok(id in dependencies, `Unexpected dependency ${id}`);
      return dependencies[id];
    },
    ...globals,
  });
  return module.exports;
}

/* ---- stubs for the Nest/mongoose surface the services import ---- */

const noopDecorator = () => () => undefined;
const nestCommon = {
  Injectable: () => () => undefined,
  Logger: class {
    log() {}
    warn() {}
    error() {}
  },
  BadRequestException: class extends Error {},
  BadGatewayException: class extends Error {},
  NotFoundException: class extends Error {},
  ServiceUnavailableException: class extends Error {},
};
const nestConfig = {
  ConfigService: class {
    constructor(values) {
      this.values = values || {};
    }
    get(key) {
      return this.values[key];
    }
  },
};
const nestMongoose = { InjectModel: noopDecorator, MongooseModule: {} };
const mongoose = {
  Model: class {},
  Document: class {},
  Schema: class {
    static Types = { ObjectId: String };
  },
};

const env = {
  MELLAT_ENABLED: 'true',
  MELLAT_TERMINAL_ID: '1234',
  MELLAT_USER_NAME: 'shop-user',
  MELLAT_USER_PASSWORD: 'secret',
  MELLAT_CURRENCY: 'rials',
  MELLAT_CALLBACK_URL: 'https://shop.example.test/api/payments/mellat/callback',
};
/* ---- the SOAP transport, faked ---- */

const soapCalls = [];
let answers = [];

const soapEnvelope = (value) =>
  '<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
  '<soap:Body><ns2:response xmlns:ns2="http://interfaces.core.sw.bps.com/"><return>' +
  value +
  '</return></ns2:response></soap:Body></soap:Envelope>';

const fetchStub = async (url, init) => {
  const body = String(init.body || '');
  const operation = /<tns:([A-Za-z]+)>/.exec(body)?.[1] || '?';
  soapCalls.push({ url: String(url), operation, body, headers: init.headers });
  const next = answers.length ? answers.shift() : { value: '0' };
  if (next.fault) {
    return {
      ok: true,
      status: 200,
      text: async () =>
        '<?xml version="1.0"?><soap:Envelope><soap:Body><soap:Fault><faultstring>' +
        next.fault +
        '</faultstring></soap:Fault></soap:Body></soap:Envelope>',
    };
  }
  return { ok: next.ok !== false, status: next.status || 200, text: async () => soapEnvelope(next.value) };
};

const reset = () => {
  soapCalls.length = 0;
  answers = [];
};

const { MellatService, mellatLabel } = load('backend/src/payments/mellat.service.ts', {
  '@nestjs/common': nestCommon,
  '@nestjs/config': nestConfig,
}, { fetch: fetchStub, AbortSignal: { timeout: () => undefined } });

const mellat = new MellatService(new nestConfig.ConfigService(env));

async function wireFormatTests() {
/* ---- 1. wire format ---- */

reset();
assert.equal(mellat.enabled, true);
assert.equal(mellat.toGatewayAmount(123456), 1234560, 'toman is sent as rials');
assert.equal(mellat.fromGatewayAmount(1234560), 123456);

answers.push({ value: '0, AF82041a2Bf6989c7fF9' });
const pay = await mellat.payRequest({
  orderId: 7,
  amount: mellat.toGatewayAmount(123456),
  callBackUrl: env.MELLAT_CALLBACK_URL,
  mobileNo: '989151234567',
  additionalData: 'فاکتور SAL-1 — 123456 تومان',
});
const sent = soapCalls[0];

assert.equal(sent.operation, 'bpPayRequest');
assert.equal(sent.url, 'https://bpm.shaparak.ir/pgwchannel/services/pgw');
assert.equal(sent.headers['Content-Type'], 'text/xml; charset=utf-8');
assert.equal(sent.headers.SOAPAction, '""', 'the WSDL declares an empty SOAPAction');
assert.ok(sent.body.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'XML declaration first');
assert.ok(sent.body.includes('xmlns:tns="http://interfaces.core.sw.bps.com/"'), 'wrapper namespace');
assert.ok(sent.body.includes('<tns:bpPayRequest>'), 'document/literal wrapped');
// elementFormDefault="unqualified" → the parameters must NOT carry the namespace prefix.
assert.ok(!/<(?:tns|ns\d):orderId>/.test(sent.body), 'parameters stay unqualified');
assert.ok(sent.body.includes('<terminalId>1234</terminalId>'));
assert.ok(sent.body.includes('<userName>shop-user</userName>'));
assert.ok(sent.body.includes('<userPassword>secret</userPassword>'));
assert.ok(sent.body.includes('<orderId>7</orderId>'));
assert.ok(sent.body.includes('<amount>1234560</amount>'));
assert.match(sent.body, /<localDate>\d{8}<\/localDate>/, 'localDate is YYYYMMDD');
assert.match(sent.body, /<localTime>\d{6}<\/localTime>/, 'localTime is HHMMSS');
assert.ok(sent.body.includes('<callBackUrl>https://shop.example.test'), 'callback URL is sent');

// WSDL sequence: terminalId, userName, userPassword, orderId, amount, localDate, localTime,
// additionalData, callBackUrl, payerId, mobileNo
const order = ['terminalId', 'userName', 'userPassword', 'orderId', 'amount', 'localDate', 'localTime',
  'additionalData', 'callBackUrl', 'payerId', 'mobileNo'];
const positions = order.map((name) => sent.body.indexOf(`<${name}>`));
assert.ok(
  positions.every((value, i) => value > -1 && (i === 0 || value > positions[i - 1])),
  'parameters follow the WSDL order',
);

assert.equal(pay.resCode, '0');
assert.equal(pay.refId, 'AF82041a2Bf6989c7fF9', 'RefId keeps its exact case');

reset();
answers.push({ value: '0, R2' });
await mellat.payRequest({ orderId: 8, amount: 10, callBackUrl: 'x', additionalData: 'a<b>&"c"' });
assert.ok(
  soapCalls[0].body.includes('<additionalData>a&lt;b&gt;&amp;&quot;c&quot;</additionalData>'),
  'values are XML escaped',
);

reset();
answers.push({ fault: 'terminal not allowed' });
await assert.rejects(() => mellat.verify(1, 1, 1), /پاسخ/, 'a SOAP fault is raised');

console.log('PASS: SOAP envelope, namespace, parameter order, rials conversion, escaping, RefId parsing');
}


async function saleFlowTests() {
/* ---- 2. the whole sale, with a faked database ---- */

const schemaLib = load('backend/src/payments/schemas/mellat-payment.schema.ts', {
  '@nestjs/mongoose': { ...nestMongoose, Prop: noopDecorator, Schema: () => () => undefined, SchemaFactory: { createForClass: () => ({}) } },
  mongoose,
});
const dtoLib = load('backend/src/payments/dto/create-mellat-payment.dto.ts', {
  'class-validator': { IsOptional: noopDecorator, IsInt: noopDecorator, IsString: noopDecorator, Min: noopDecorator, MaxLength: noopDecorator },
});
const { PaymentsService } = load('backend/src/payments/payments.service.ts', {
  '@nestjs/common': nestCommon,
  '@nestjs/config': nestConfig,
  '@nestjs/mongoose': nestMongoose,
  mongoose,
  '../invoices/invoices.service': { InvoicesService: class {} },
  './mellat.service': { MellatService, mellatLabel },
  './schemas/mellat-payment.schema': schemaLib,
  './dto/create-mellat-payment.dto': dtoLib,
});

const docs = [];
let counter = 0;
const makeDoc = (data) => {
  const doc = {
    ...data,
    createdAt: new Date(),
    saves: 0,
    save: async () => {
      doc.saves++;
      return doc;
    },
    get: (key) => doc[key],
    set: (key, value) => {
      doc[key] = value;
    },
    markModified: () => undefined,
    toJSON: () => ({ ...doc }),
  };
  docs.push(doc);
  return doc;
};
const matches = (doc, filter) =>
  Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some((part) => matches(doc, part));
    return String(doc[key]) === String(value);
  });

const paymentsModel = {
  create: async (data) => makeDoc(data),
  findOne: (filter) => ({ exec: async () => docs.find((doc) => matches(doc, filter)) || null }),
  find: (filter) => ({
    sort: () => ({ limit: () => ({ lean: async () => docs.filter((d) => matches(d, filter)) }) }),
  }),
};
const countersModel = {
  findOneAndUpdate: () => ({ lean: async () => ({ seq: ++counter }) }),
};

const booked = [];
const invoice = {
  _id: 'INV-1',
  type: 'sale',
  invoiceNumber: 'SAL-260913-0001',
  customerId: 'CUST-1',
  customerName: 'سپهری پاک',
  customerPhone: '09151737128',
  remainingDebt: 500000,
};
const invoicesStub = {
  findById: async () => invoice,
  addPayment: async (id, body, by) => {
    booked.push({ id, ...body, by });
    return invoice;
  },
};

const payments = new PaymentsService(paymentsModel, countersModel, mellat, invoicesStub, new nestConfig.ConfigService(env));

// step 1 — bpPayRequest through the service
reset();
answers.push({ value: '0, REF-ABC' });
const launch = await payments.createForInvoice('INV-1', { amount: 123456 }, { name: 'مدیر سیستم' });
assert.equal(soapCalls[0].operation, 'bpPayRequest');
assert.equal(launch.refId, 'REF-ABC');
assert.equal(launch.orderId, 1, 'the counter hands out a fresh orderId');
assert.equal(launch.amountToman, 123456);
assert.equal(docs[0].status, 'initiated');
assert.equal(docs[0].gatewayAmount, 1234560);
assert.ok(docs[0].callBackUrl.endsWith('/api/payments/mellat/callback'), 'callback URL is the API route');

// the bank posts the customer back: verify then settle then book, in that order
reset();
answers.push({ value: '0' }, { value: '0' });
const okResult = await payments.handleCallback({
  RefId: 'REF-ABC',
  ResCode: '0',
  SaleOrderId: '1',
  SaleReferenceId: '127926981246',
  CardHolderPan: '610433*****5689',
});
assert.equal(okResult.ok, true, okResult.message);
assert.deepEqual(soapCalls.map((c) => c.operation), ['bpVerifyRequest', 'bpSettleRequest']);
assert.equal(booked.length, 1, 'the invoice is paid exactly once');
assert.equal(booked[0].id, 'INV-1');
assert.equal(booked[0].amount, 123456, 'booked in toman, not in the gateway unit');
assert.equal(booked[0].paymentMethod, 'transfer');
assert.ok(booked[0].description.includes('REF-ABC'), 'the bank trace number stays on the ledger row');
assert.equal(docs[0].status, 'settled');
assert.ok(docs[0].bookedAt, 'booking is stamped so a replay cannot double-pay');
assert.equal(docs[0].cardHolderPan, '610433*****5689');

// a replayed callback changes nothing
reset();
const replay = await payments.handleCallback({ RefId: 'REF-ABC', ResCode: '0', SaleOrderId: '1', SaleReferenceId: '127926981246' });
assert.equal(replay.ok, true);
assert.ok(replay.message.includes('پیش‌تر'), 'replay reports the earlier settle');
assert.equal(soapCalls.length, 0, 'no second verify/settle round trip');
assert.equal(booked.length, 1, 'still one booking');

// forged callback: the RefId is ours but the order number is not
reset();
answers.push({ value: '0, REF-2' });
await payments.createForInvoice('INV-1', { amount: 1000 }, { name: 'مدیر' });
const tampered = await payments.handleCallback({ RefId: 'REF-2', ResCode: '0', SaleOrderId: '999', SaleReferenceId: '55' });
assert.equal(tampered.ok, false);
assert.ok(tampered.message.includes('عدم تطابق'), 'the RefId/SaleOrderId pair is enforced');
assert.deepEqual(soapCalls.map((c) => c.operation), ['bpPayRequest'], 'a mismatched answer never reaches bpVerifyRequest');
assert.equal(docs[1].status, 'failed');

// a third attempt the customer abandons on the bank page
answers.push({ value: '0, REF-3' });
await payments.createForInvoice('INV-1', { amount: 2000 }, { name: 'مدیر' });

// customer cancelled and the bank sent no reference id → nothing to verify, just close it
reset();
const bare = await payments.handleCallback({ RefId: 'REF-3', ResCode: '17', SaleOrderId: '3', SaleReferenceId: '0' });
assert.equal(bare.ok, false);
assert.ok(bare.message.includes('کد مرجع'), 'a callback without SaleReferenceId is refused');
assert.equal(soapCalls.length, 0, 'no SOAP call is possible without a reference id');
assert.equal(docs[2].status, 'failed');

// the bank did give a reference id but the sale is unknown → the money is reversed
reset();
answers.push({ value: '42' }, { value: '0' });
const cancelled = await payments.handleCallback({ RefId: 'REF-3', ResCode: '17', SaleOrderId: '3', SaleReferenceId: '88' });
assert.equal(cancelled.ok, false);
assert.deepEqual(soapCalls.map((c) => c.operation), ['bpVerifyRequest', 'bpReversalRequest']);
assert.equal(docs[2].status, 'reversed');
assert.equal(booked.length, 1, 'a cancelled sale is never booked');

// ResCode 17 on the callback, but the bank still confirms the sale (43 = already verified)
reset();
answers.push({ value: '0, REF-4' });
await payments.createForInvoice('INV-1', { amount: 3000 }, { name: 'مدیر' });
reset();
answers.push({ value: '43' }, { value: '45' });
const late = await payments.handleCallback({ RefId: 'REF-4', ResCode: '17', SaleOrderId: '4', SaleReferenceId: '77' });
assert.equal(late.ok, true, late.message);
assert.equal(booked.length, 2, 'the verified sale is booked');
assert.equal(docs[3].status, 'settled');

// refund of a settled sale
reset();
answers.push({ value: '0' });
const refunded = await payments.refund(String(docs[0].orderId), 20000, 'کالای مرجوعی');
assert.equal(refunded.ok, true);
assert.equal(soapCalls[0].operation, 'bpRefundRequest');
assert.ok(soapCalls[0].body.includes('<refundAmount>200000</refundAmount>'), 'refund uses the gateway unit');
assert.equal(docs[0].refunds.length, 1);
assert.equal(docs[0].status, 'settled', 'a partial refund does not close the sale');
const tooMuch = await payments.refund(String(docs[0].orderId), 400000).catch((err) => err.message);
assert.ok(String(tooMuch).includes('مجموع استرداد'), 'refunds cannot exceed the sale');

// where the browser is sent after the callback
const url = payments.returnUrl({ headers: { host: 'shop.example.test' } }, { ok: true, orderId: 5, message: 'تأیید شد' });
assert.ok(url.includes('/tabs/invoices'), url);
assert.ok(url.includes('mellat=ok') && url.includes('mellatOrder=5'));

// the bank's codes speak Persian
assert.ok(mellatLabel('421').includes('IP'));
assert.ok(mellatLabel('12').includes('موجودی'));

// a terminal that was never configured must stay shut
const dark = new PaymentsService(
  paymentsModel,
  countersModel,
  new MellatService(new nestConfig.ConfigService({})),
  invoicesStub,
  new nestConfig.ConfigService({}),
);
assert.equal(dark.capabilities.enabled, false);
await assert.rejects(() => dark.createForInvoice('INV-1', { amount: 1 }, {}), /فعال نیست/);

console.log('PASS: pay → callback → verify → settle → booked, replay guard, forged callback, cancel + reversal, refund');
}

wireFormatTests()
  .then(saleFlowTests)
  .then(() => console.log('PASS: Mellat gateway offline check (all sections)'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

