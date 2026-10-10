#!/usr/bin/env node
/**
 * Inserts the قند بلالی reconciliation into Ario.
 * Nothing is deleted: extra payments stay, and a signed adjustment offsets them
 * until someone confirms a bank receipt and removes that adjustment in the app.
 *
 * Deploy this version first, then:
 *   node backend/scripts/post-belali-reconciliation.js
 *   node backend/scripts/post-belali-reconciliation.js --dry-run
 *
 * ARIO_API defaults to http://89.44.241.67/api
 * ARIO_USER / ARIO_PASSWORD override the admin user in .env
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const dryRun = process.argv.includes('--dry-run');

function envFile(file, key) {
  if (!fs.existsSync(file)) return '';
  const line = fs.readFileSync(file, 'utf8').split('\n').find((l) => l.startsWith(`${key}=`));
  if (!line) return '';
  return line.slice(key.length + 1).replace(/^["']|["']$/g, '').trim();
}

const API = (process.env.ARIO_API || 'http://89.44.241.67/api').replace(/\/$/, '');
const USER = process.env.ARIO_USER || envFile(path.join(root, '.env'), 'ADMIN_DEFAULT_USERNAME') || 'admin';
const PASS =
  process.env.ARIO_PASSWORD ||
  envFile(path.join(root, '.env'), 'ADMIN_DEFAULT_PASSWORD') ||
  envFile(path.join(root, 'backend/.env'), 'ADMIN_DEFAULT_PASSWORD');

const ADJUSTMENTS = [
  {
    externalRef: 'belali-1405-opening',
    date: '2026-03-21',
    amount: 750000,
    kind: 'opening',
    title: 'افتتاحیه دفتر شرکت',
    relatedInvoiceNumber: '',
    notes:
      'حساب تفصیلی ۳۰۸۰۰۴۰۷ بلالی آرش، سند افتتاحیه ۱۴۰۵/۰۱/۰۱ به مبلغ ۷٬۵۰۰٬۰۰۰ ریال. اپ سند افتتاحیه نداشت.',
  },
  {
    externalRef: 'belali-offset-pay-346150000',
    date: '2026-09-15',
    amount: 346150000,
    kind: 'reconcile',
    title: 'خنثی‌سازی واریز ۳۴۶٬۱۵۰٬۰۰۰ خارج از دفتر شرکت',
    relatedInvoiceNumber: '',
    notes:
      'واریز ۱۵ شهریور ۱۴۰۵ در اپ مانده و حذف نشده. دفتر شرکت تا ۲۶ شهریور چنین مبلغی ندارد. این تعدیل فقط اثرش را بر مانده برمی‌گرداند. اگر رسید بانکی پیدا شد، همین تعدیل را حذف کنید تا واریز دوباره در بدهی بیاید.',
  },
  {
    externalRef: 'belali-offset-pay-100m-1405-04-02',
    date: '2026-06-23',
    amount: 100000000,
    kind: 'reconcile',
    title: 'خنثی‌سازی واریز ۱۰۰ میلیون ۲ تیر',
    relatedInvoiceNumber: '',
    notes:
      'واریز کارت ۲ تیر ۱۴۰۵ در دفتر شرکت نیست و حذف نشده. این تعدیل اثرش را تا تطبیق با بانک خنثی می‌کند. اگر رسید داشت، تعدیل را بردارید.',
  },
  {
    externalRef: 'belali-invoice-209-price',
    date: '2026-09-02',
    amount: -16350000,
    kind: 'reconcile',
    title: 'تعدیل فی فاکتور ۲۰۹ شرکت',
    relatedInvoiceNumber: 'PUR-261010-0001',
    notes:
      'تعداد شش قلم با فاکتور ۲۰۹ دفتر یکی است. فی اپ بالاتر است: نایلون ۵ باید ۶۶۵٬۰۰۰ باشد نه ۷۲۵٬۰۰۰، نایلون ۳ باید ۴۰۰٬۵۰۰ باشد نه ۴۳۶٬۵۰۰، کله ۵ باید ۷۳۰٬۰۰۰ باشد نه ۷۵۵٬۰۰۰، کله ۲٫۵ باید ۳۷۷٬۵۰۰ باشد نه ۳۹۰٬۰۰۰. فاکتور اپ دست نخورده. اختلاف ۱۶٬۳۵۰٬۰۰۰ تومان.',
  },
  {
    externalRef: 'belali-invoice-24-round',
    date: '2026-04-29',
    amount: -1861,
    kind: 'reconcile',
    title: 'تعدیل گرد کردن فاکتور ۲۴',
    relatedInvoiceNumber: 'PUR-260809-0001',
    notes:
      'دفتر ۷۰٬۱۲۸٬۱۳۹ تومان و اپ ۷۰٬۱۳۰٬۰۰۰. اختلاف از تعداد کسری سلفون ۷۰۰ و ۴۵۰ است. ۱۳ کارتن شکسته ۵ کیلویی در اپ به‌نام کله ثبت شده؛ مبلغ همان است و این سند موجودی را عوض نمی‌کند.',
  },
];

const FISH = {
  externalRef: 'belali-fish-1650431849',
  supplier: 'شرکت قند بلالی',
  amount: 200000000,
  date: '2026-09-17',
  method: 'transfer',
  notes: 'فیش ۱۶۵۰۴۳۱۸۴۹ مورخ ۱۴۰۵/۰۶/۲۶. در دفتر شرکت هست و در اپ نبود. رسید انتقالی بابت بدهی.',
};

async function main() {
  if (!PASS) {
    console.error('Set ARIO_PASSWORD or ADMIN_DEFAULT_PASSWORD in .env');
    process.exit(1);
  }
  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  if (!loginRes.ok) {
    console.error(`Login failed (${loginRes.status}). Deploy this version before running the script if the route is missing.`);
    process.exit(1);
  }
  const { access_token: token } = await loginRes.json();
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const accountRes = await fetch(`${API}/suppliers/account`, { headers });
  if (!accountRes.ok) {
    console.error(`Account failed (${accountRes.status})`);
    process.exit(1);
  }
  const before = await accountRes.json();
  console.log(`Debt before: ${before.summary.debt.toLocaleString('en-US')} adjustments: ${(before.adjustments || []).length}`);

  for (const row of ADJUSTMENTS) {
    const exists = (before.adjustments || []).some((a) => a.externalRef === row.externalRef);
    if (exists) {
      console.log(`skip adjustment ${row.externalRef}`);
      continue;
    }
    console.log(`${dryRun ? 'would add' : 'add'} adjustment ${row.externalRef} ${row.amount}`);
    if (dryRun) continue;
    const res = await fetch(`${API}/suppliers/adjustments`, { method: 'POST', headers, body: JSON.stringify(row) });
    if (!res.ok) {
      console.error(row.externalRef, res.status, await res.text());
      process.exit(1);
    }
  }

  const paid = (before.payments || []).some((p) => p.externalRef === FISH.externalRef || String(p.notes || '').includes('1650431849'));
  if (paid) console.log('skip fish 1650431849');
  else {
    console.log(`${dryRun ? 'would add' : 'add'} fish 1650431849 ${FISH.amount}`);
    if (!dryRun) {
      const res = await fetch(`${API}/suppliers/payments`, { method: 'POST', headers, body: JSON.stringify(FISH) });
      if (!res.ok) {
        console.error('fish', res.status, await res.text());
        process.exit(1);
      }
    }
  }

  const mohsen = (before.payments || []).find((p) => p.amount === 73681200);
  if (mohsen && String(mohsen.date).slice(0, 10) !== '2026-06-02') {
    console.log(`${dryRun ? 'would set' : 'set'} Mohsen transfer date to 2026-06-02 (was ${String(mohsen.date).slice(0, 10)})`);
    if (!dryRun) {
      const res = await fetch(`${API}/suppliers/payments/${mohsen._id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ date: '2026-06-02' }),
      });
      if (!res.ok) {
        console.error('mohsen date', res.status, await res.text());
        process.exit(1);
      }
    }
  }

  const purchasesRes = await fetch(`${API}/invoices?type=purchase`, { headers });
  if (!purchasesRes.ok) {
    console.error(`Invoices failed (${purchasesRes.status})`);
    process.exit(1);
  }
  const purchases = await purchasesRes.json();
  const inv194 = purchases.find((i) => i.invoiceNumber === 'PUR-261010-0002');
  if (inv194 && String(inv194.invoiceDate).slice(0, 10) !== '2026-08-27') {
    console.log(`${dryRun ? 'would set' : 'set'} ${inv194.invoiceNumber} date to 2026-08-27 (was ${String(inv194.invoiceDate).slice(0, 10)})`);
    if (!dryRun) {
      const res = await fetch(`${API}/invoices/${inv194._id}/date`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ invoiceDate: '2026-08-27' }),
      });
      if (!res.ok) {
        console.error('invoice date', res.status, await res.text());
        process.exit(1);
      }
    }
  }

  if (dryRun) {
    console.log('Dry run. No documents written.');
    return;
  }
  const afterRes = await fetch(`${API}/suppliers/account`, { headers });
  const after = await afterRes.json();
  console.log(`Debt after: ${after.summary.debt.toLocaleString('en-US')} adjustments: ${after.adjustments.length} payments: ${after.summary.paymentsCount}`);
  console.log('Company file at 1405/06/26 was 6,145,804,939 toman. Sugar purchased on 2026-09-24 (7,800,000) stays, so the live debt should be about 6,153,604,939.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
