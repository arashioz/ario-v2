/**
 * برای هر کالایی که کد انبار ندارد یک SKU یکتا می‌سازد: AR-00001
 * کدهای سالم دست نمی‌خورند. کد تکراری با یک شماره تازه عوض می‌شود.
 *
 *   node scripts/assign-skus.js
 *   node scripts/assign-skus.js --dry
 *
 * روی سرور:
 *   docker compose exec app node scripts/assign-skus.js
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
const codeOf = (n) => `AR-${String(n).padStart(5, '0')}`;

async function main() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  const products = await mongoose.connection.db.collection('products')
    .find({}, { projection: { name: 1, sku: 1 } })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();

  const used = new Set();
  let next = 1;
  for (const product of products) {
    const match = String(product.sku || '').match(/^AR-(\d+)$/);
    if (!match) continue;
    used.add(match[0]);
    next = Math.max(next, Number(match[1]) + 1);
  }

  const take = () => {
    while (used.has(codeOf(next))) next += 1;
    const sku = codeOf(next);
    used.add(sku);
    next += 1;
    return sku;
  };

  const writes = [];
  const rows = [];
  const seen = new Set();
  for (const product of products) {
    const current = String(product.sku || '').trim();
    const valid = /^AR-\d+$/.test(current) && !seen.has(current);
    if (valid) {
      seen.add(current);
      continue;
    }
    const sku = take();
    seen.add(sku);
    rows.push({ name: product.name || '', from: current, sku });
    writes.push({ updateOne: { filter: { _id: product._id }, update: { $set: { sku } } } });
  }

  if (!dry && writes.length) await mongoose.connection.db.collection('products').bulkWrite(writes);
  console.log(dry ? 'پیش‌نمایش — چیزی نوشته نشد' : 'SKU نوشته شد');
  console.log(`کل کالاها: ${products.length}`);
  console.log(`کد جدید: ${writes.length}`);
  console.log(`کد قبلی سالم ماند: ${products.length - writes.length}`);
  for (const row of rows) console.log(`  ${row.sku}  ${row.from ? `${row.from} → ` : ''}${row.name}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message || err);
  try { await mongoose.disconnect(); } catch { /* already closed */ }
  process.exit(1);
});
