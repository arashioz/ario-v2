/**
 * برای هر کالا یک بارکد EAN-13 یکتا می‌سازد (پیشوند ایران ۶۲۶).
 * بارکدهای عددی سالم دست نمی‌خورند. تکراری‌ها عوض می‌شوند.
 *
 *   node scripts/assign-barcodes.js
 *   node scripts/assign-barcodes.js --dry
 *
 * روی سرور / دیپلوی:
 *   docker compose exec -T app node scripts/assign-barcodes.js
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

function ean13Check(d12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

function codeOf(n) {
  const body = `626${String(n).padStart(9, '0')}`;
  return body + ean13Check(body);
}

function isCode(s) {
  return /^\d{8,14}$/.test(String(s || '').trim());
}

async function main() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  const products = await mongoose.connection.db
    .collection('products')
    .find({}, { projection: { name: 1, barcode: 1 } })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();

  const used = new Set();
  let next = 1;
  for (const product of products) {
    const current = String(product.barcode || '').trim();
    const match = current.match(/^626(\d{9})\d$/);
    if (!match) continue;
    used.add(current);
    next = Math.max(next, Number(match[1]) + 1);
  }

  const take = () => {
    let code = codeOf(next);
    while (used.has(code)) {
      next += 1;
      code = codeOf(next);
    }
    used.add(code);
    next += 1;
    return code;
  };

  const writes = [];
  const rows = [];
  const seen = new Set();
  for (const product of products) {
    const current = String(product.barcode || '').trim();
    const valid = isCode(current) && !seen.has(current);
    if (valid) {
      seen.add(current);
      continue;
    }
    const barcode = take();
    seen.add(barcode);
    rows.push({ name: product.name || '', from: current, barcode });
    writes.push({ updateOne: { filter: { _id: product._id }, update: { $set: { barcode } } } });
  }

  if (!dry && writes.length) await mongoose.connection.db.collection('products').bulkWrite(writes);
  console.log(dry ? 'پیش‌نمایش — چیزی نوشته نشد' : 'بارکد نوشته شد');
  console.log(`کل کالاها: ${products.length}`);
  console.log(`بارکد جدید: ${writes.length}`);
  console.log(`بارکد قبلی سالم ماند: ${products.length - writes.length}`);
  for (const row of rows) console.log(`  ${row.barcode}  ${row.from ? `${row.from} → ` : ''}${row.name}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message || err);
  try {
    await mongoose.disconnect();
  } catch {
    /* already closed */
  }
  process.exit(1);
});
