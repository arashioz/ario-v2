/**
 * برنج عنبربو: فاکتور خرید درست است (۴۴ بسته = ۴۴۰ کیلو) ولی موجودی دوبل شده بود.
 *
 * علت:
 *  - فاکتور PUR-261102-0007 با تأمین‌کننده «طبیعستون» به‌صورت ledger ثبت شد
 *  - انبارگردانی وقتی سیستم صفر نشان می‌داد ۴۴ بسته شمرد (stockAdjust)
 *  - همان ۴۴ بسته از فاکتور هم در موجودی نشست → تقریباً دو برابر (۸۸۰ کیلو)
 *  - فروش SAL-261103-0004 دو بسته کم کرد
 *
 * مانده درست: ۴۴ خرید − ۲ فروش = ۴۲ بسته = ۴۲۰ کیلو
 *
 *   node scripts/fix-anbarbu-rice.js
 *   node scripts/fix-anbarbu-rice.js --dry
 *
 * روی سرور:
 *   docker exec ariov2_app node scripts/fix-anbarbu-rice.js
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
const NAME = /عنبربو/;

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

async function main() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;
  const product = await db.collection('products').findOne({ name: NAME });
  if (!product) throw new Error('کالای برنج عنبربو پیدا نشد');

  const pid = String(product._id);
  const invoices = await db.collection('invoices').find({ 'items.productId': pid }).toArray();
  let purchased = 0;
  let sold = 0;
  const rows = [];
  for (const inv of invoices) {
    for (const item of inv.items || []) {
      if (String(item.productId) !== pid) continue;
      const qty = Number(item.quantity) || 0;
      if (inv.type === 'purchase') purchased += qty;
      else sold += qty;
      rows.push({
        number: inv.invoiceNumber,
        type: inv.type,
        fulfillment: inv.fulfillment,
        qty,
        weightKg: item.weightKg,
        customer: inv.customerName,
      });
    }
  }

  const expected = round3(purchased - sold);
  const pack = Number(product.weightPerUnitKg) || 10;
  const before = {
    stock: product.stock,
    stockAdjust: product.stockAdjust,
    openingStock: product.openingStock,
    supplierName: product.supplierName,
  };

  console.log('کالا:', product.name, pid);
  console.log('قبل:', JSON.stringify(before));
  console.log('فاکتورها:');
  for (const row of rows) console.log(' ', JSON.stringify(row));
  console.log(`خرید ${purchased} بسته − فروش ${sold} بسته = مانده ${expected} بسته (${expected * pack} کیلو)`);
  console.log(
    `اگر stockAdjust (${before.stockAdjust || 0}) روی فاکتور بماند موجودی می‌شود ${round3(expected + (Number(before.stockAdjust) || 0))} بسته ≈ ${round3((expected + (Number(before.stockAdjust) || 0)) * pack)} کیلو (دوبرابر)`,
  );

  const purchase = invoices.find((inv) => inv.type === 'purchase');
  const supplier = (purchase && purchase.customerName) || product.supplierName || '';

  if (dry) {
    console.log('پیش‌نمایش — چیزی نوشته نشد');
    await mongoose.disconnect();
    return;
  }

  await db.collection('products').updateOne(
    { _id: product._id },
    {
      $set: {
        stock: expected,
        stockAdjust: 0,
        openingStock: 0,
        ...(supplier ? { supplierName: supplier } : {}),
      },
    },
  );
  if (purchase && purchase.fulfillment === 'ledger') {
    await db.collection('invoices').updateOne({ _id: purchase._id }, { $set: { fulfillment: 'shop' } });
    console.log('فاکتور خرید از ledger به shop آمد تا در انبار آریو بماند');
  }

  const after = await db.collection('products').findOne({ _id: product._id }, { projection: { stock: 1, stockAdjust: 1, supplierName: 1 } });
  console.log('بعد:', JSON.stringify(after));
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
