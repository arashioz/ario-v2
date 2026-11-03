/**
 * فاکتورهای خرید را با موجودی انبار یکی می‌کند.
 *   موجودی = خریدهای رسیده‌شده به آریو − فروش‌هایی که از انبار آریو رفته‌اند + اصلاح انبارگردانی
 *
 * ردیف خریدی که کد کالا ندارد، با نام همان کالا به محصول وصل می‌شود.
 * فروش از کارخانه و خریدِ هنوزتحویل‌نشده وارد موجودی نمی‌شود.
 *
 *   node scripts/rebuild-stock.js
 *   node scripts/rebuild-stock.js --dry
 *   node scripts/rebuild-stock.js --receive     # ردیف‌های «تحویل نشده» را هم موجود کن
 *
 * روی سرور:
 *   docker compose exec app node scripts/rebuild-stock.js
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

function loadEnv() {
  const file = path.join(__dirname, '../.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

loadEnv();

const dry = process.argv.includes('--dry');
const receiveAll = process.argv.includes('--receive');
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27019/ario_db';

const nameKey = (s) => String(s || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim().toLowerCase();

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

async function main() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;
  const products = await db.collection('products').find({}, { projection: { name: 1, unit: 1, stock: 1, stockAdjust: 1, openingStock: 1 } }).toArray();
  const byName = new Map();
  for (const product of products) {
    const key = nameKey(product.name);
    if (key && !byName.has(key)) byName.set(key, product);
  }

  const invoices = await db.collection('invoices').find(
    { type: { $in: ['sale', 'purchase'] } },
    { projection: { type: 1, fulfillment: 1, items: 1, invoiceNumber: 1 } },
  ).toArray();

  const totals = new Map();
  const invoiceWrites = [];
  const unmatched = [];
  let purchases = 0;
  let sales = 0;
  let factorySales = 0;
  let linked = 0;
  let unreceivedLines = 0;
  let receivedNow = 0;

  for (const inv of invoices) {
    const purchase = inv.type === 'purchase';
    if (inv.fulfillment === 'factory') {
      if (!purchase) factorySales++;
      continue;
    }
    if (purchase) purchases++;
    else sales++;
    let dirty = false;
    for (const item of inv.items || []) {
      let productId = String(item.productId || '');
      const valid = mongoose.Types.ObjectId.isValid(productId) && productId.length === 24;
      if (purchase && !valid) {
        const match = byName.get(nameKey(item.productName));
        if (!match) {
          unmatched.push(`${inv.invoiceNumber}: ${item.productName || 'بدون نام'}`);
          continue;
        }
        productId = String(match._id);
        item.productId = match._id;
        linked++;
        dirty = true;
      }
      if (!mongoose.Types.ObjectId.isValid(productId) || String(productId).length !== 24) continue;
      if (purchase && item.received === false && !receiveAll) {
        unreceivedLines++;
        unmatched.push(`${inv.invoiceNumber}: ${item.productName} هنوز تحویل‌نشده (با --receive موجود می‌شود)`);
        continue;
      }
      if (purchase && item.received === false && receiveAll) {
        item.received = true;
        receivedNow++;
        dirty = true;
      }
      const qty = Number(item.quantity) || 0;
      totals.set(String(productId), (totals.get(String(productId)) || 0) + (purchase ? qty : -qty));
    }
    if (dirty) invoiceWrites.push({ updateOne: { filter: { _id: inv._id }, update: { $set: { items: inv.items } } } });
  }

  if (!dry && invoiceWrites.length) await db.collection('invoices').bulkWrite(invoiceWrites);

  const writes = [];
  const changed = [];
  for (const product of products) {
    const id = String(product._id);
    const adjust = Number(product.stockAdjust) || 0;
    const opening = Number(product.openingStock) || 0;
    if (!totals.has(id) && !adjust && !opening) continue;
    const stock = round3((totals.get(id) || 0) + adjust + opening);
    const before = Number(product.stock) || 0;
    if (Math.abs(before - stock) < 0.0005) continue;
    changed.push({ name: product.name, unit: product.unit || '', before, stock });
    writes.push({ updateOne: { filter: { _id: product._id }, update: { $set: { stock } } } });
  }

  if (!dry && writes.length) await db.collection('products').bulkWrite(writes);

  console.log(dry ? 'پیش‌نمایش — چیزی نوشته نشد' : 'موجودی نوشته شد');
  console.log(`فاکتور خرید (تحویل‌شده): ${purchases}`);
  console.log(`فاکتور فروش از آریو: ${sales}`);
  console.log(`فاکتور فروش از شرکت (حساب نشد): ${factorySales}`);
  console.log(`ردیف خرید به کالا وصل شد: ${linked}`);
  console.log(`ردیف تحویل‌نشده که موجود شد: ${receivedNow}`);
  console.log(`ردیف خرید تحویل‌نشده (حساب نشد): ${unreceivedLines}`);
  console.log(`کالا روی فاکتورها: ${totals.size}`);
  if (unmatched.length) {
    console.log('این ردیف‌ها موجود نشدند:');
    for (const line of unmatched.slice(0, 40)) console.log(`  ${line}`);
  }
  console.log(`کالا اصلاح‌شده: ${changed.length}`);
  for (const row of changed.sort((a, b) => a.name.localeCompare(b.name, 'fa'))) {
    console.log(`  ${row.name}: ${row.before} → ${row.stock} ${row.unit}`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message || err);
  try { await mongoose.disconnect(); } catch { /* already closed */ }
  process.exit(1);
});
