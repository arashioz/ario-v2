/**
 * موجودی هر کالا را از نو می‌نویسد:
 *   جمع تعداد فاکتورهای خریدِ تحویل‌شده
 *   منهای جمع تعداد فاکتورهای فروشی که از موجودی آریو رفته‌اند.
 *
 * فروش از شرکت و ردیف خریدی که هنوز تحویل نشده وارد حساب نمی‌شود.
 * کالایی که روی هیچ فاکتوری نیست دست نمی‌خورد.
 *
 *   node scripts/rebuild-stock.js          # می‌نویسد
 *   node scripts/rebuild-stock.js --dry    # فقط نشان می‌دهد
 *
 * روی سرور، بعد از ساخت ایمیج:
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
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27019/ario_db';

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

async function main() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const invoices = await db.collection('invoices').find(
    { type: { $in: ['sale', 'purchase'] } },
    { projection: { type: 1, fulfillment: 1, items: 1, invoiceNumber: 1 } },
  ).toArray();

  const totals = new Map();
  let purchases = 0;
  let sales = 0;
  let factorySales = 0;
  let unreceivedLines = 0;

  for (const inv of invoices) {
    const purchase = inv.type === 'purchase';
    if (inv.fulfillment === 'factory') {
      if (!purchase) factorySales++;
      continue;
    }
    if (purchase) purchases++;
    else sales++;
    for (const item of inv.items || []) {
      const productId = String(item.productId || '');
      if (!mongoose.Types.ObjectId.isValid(productId) || productId.length !== 24) continue;
      if (purchase && item.received === false) {
        unreceivedLines++;
        continue;
      }
      const qty = Number(item.quantity) || 0;
      totals.set(productId, (totals.get(productId) || 0) + (purchase ? qty : -qty));
    }
  }

  const products = await db.collection('products').find({}, { projection: { name: 1, unit: 1, stock: 1 } }).toArray();
  const writes = [];
  const changed = [];
  for (const product of products) {
    const id = String(product._id);
    if (!totals.has(id)) continue;
    const stock = round3(totals.get(id) || 0);
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
  console.log(`ردیف خرید تحویل‌نشده (حساب نشد): ${unreceivedLines}`);
  console.log(`کالا روی فاکتورها: ${totals.size}`);
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
