/**
 * انبارگردانی را روی موجودی انبار «لنگر» می‌کند: عدد شمارش‌شده را به‌جای
 * «خرید − فروش + اصلاحِ کهنه» می‌گذارد تا نه موجودی کم بماند و نه دوبار شمرده شود.
 *
 *   موجودی = خریدهای رسیده − فروش‌های آریو + موجودی اولیه + اصلاح انبارگردانی
 *
 * برای هر کالایی که انبارگردانیِ آخر عددش را عوض کرده:
 *   مغایرت   = counted − (book + opening)
 *   stockAdjust ← مغایرت         (حذف شمارشِ دوباره / اختلاف کهنه)
 *   stock         ← counted
 *
 * کالاهایی که انبارگردانی ندارند فقط با --rebuild-others به فرمول بالا عادی‌سازی می‌شوند؛
 * در حالت عادی دست‌نخورده می‌مانند تا اصلاحِ تولید کارگاهی پاک نشود.
 *
 *   node scripts/repair-stock-count.js            # پیش‌نمایش، چیزی نمی‌نویسد
 *   node scripts/repair-stock-count.js --apply     # نوشتن در دیتابیس
 *   node scripts/repair-stock-count.js --apply --rebuild-others
 *   node scripts/repair-stock-count.js --receive   # ردیف «تحویل‌نشده» را هم موجود بشمار
 *
 * روی سرور (داخل کانتینر):
 *   docker compose exec app node scripts/repair-stock-count.js
 *   docker compose exec app node scripts/repair-stock-count.js --apply
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

const apply = process.argv.includes('--apply');
const rebuildOthers = process.argv.includes('--rebuild-others');
const receiveAll = process.argv.includes('--receive');
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27019/ario_db';

const nameKey = (s) =>
  String(s || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const round3 = (n) => Math.round(n * 1000) / 1000;

/** Kilograms in one stock unit (a 10kg rice bag is 10, not 1) — same rule as the report. */
const kgPerStock = (product) => {
  const w = Number(product?.weightPerUnitKg) || 0;
  if (w > 0) return w;
  return product?.unit === 'کیلوگرم' ? 1 : 0;
};

const isValidId = (v) => mongoose.Types.ObjectId.isValid(v) && String(v).length === 24;
const fa = (n) => Number(n || 0).toLocaleString('fa-IR', { maximumFractionDigits: 3 });

async function main() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;

  const products = await db
    .collection('products')
    .find({}, { projection: { name: 1, unit: 1, weightPerUnitKg: 1, stock: 1, stockAdjust: 1, openingStock: 1, isActive: 1 } })
    .toArray();

  const byId = new Map(products.map((p) => [String(p._id), p]));
  const byName = new Map();
  for (const p of products) {
    const key = nameKey(p.name);
    if (key && !byName.has(key)) byName.set(key, p);
  }

  // Invoice-derived units per product (shop stock only), mirroring rebuild-stock.js.
  const invoices = await db
    .collection('invoices')
    .find({ type: { $in: ['sale', 'purchase'] } }, { projection: { type: 1, fulfillment: 1, invoiceNumber: 1, items: 1 } })
    .toArray();

  const totals = new Map();
  const unlinked = [];
  for (const inv of invoices) {
    const purchase = inv.type === 'purchase';
    if (inv.fulfillment === 'factory') continue; // direct company shipment is not Ario stock
    for (const item of inv.items || []) {
      let pid = String(item.productId || '');
      if (purchase && !isValidId(pid)) {
        const match = byName.get(nameKey(item.productName));
        if (!match) {
          unlinked.push(`${inv.invoiceNumber}: ${item.productName || 'بدون نام'}`);
          continue;
        }
        pid = String(match._id);
      }
      if (!isValidId(pid)) continue;
      if (purchase && item.received === false && !receiveAll) continue;
      const qty = Number(item.quantity) || 0;
      totals.set(pid, (totals.get(pid) || 0) + (purchase ? qty : -qty));
    }
  }

  // Latest physical count per product (the last StockCount line wins).
  const counts = await db.collection('stockcounts').find({}).sort({ createdAt: 1 }).toArray();
  const counted = new Map();
  for (const doc of counts) {
    for (const line of doc.lines || []) {
      if (!isValidId(line.productId)) continue;
      counted.set(String(line.productId), {
        countedQty: round3(Number(line.countedQty) || 0),
        at: doc.createdAt,
        by: doc.createdByName || '',
      });
    }
  }

  const writes = [];
  const countRows = [];
  const rebuildRows = [];

  for (const [pid, c] of counted) {
    const product = byId.get(pid);
    if (!product) {
      countRows.push({ missing: true, name: '(کالای حذف‌شده)', countedQty: c.countedQty });
      continue;
    }
    const book = round3(totals.get(pid) || 0);
    const opening = Number(product.openingStock) || 0;
    const oldStock = round3(Number(product.stock) || 0);
    const oldAdjust = round3(Number(product.stockAdjust) || 0);
    const maghayerat = round3(c.countedQty - book - opening); // physical minus invoice book
    const newStock = round3(c.countedQty);
    const newAdjust = maghayerat;
    const kgPer = kgPerStock(product);

    const dirty = Math.abs(oldStock - newStock) > 0.0005 || Math.abs(oldAdjust - newAdjust) > 0.0005;
    if (dirty) writes.push({ updateOne: { filter: { _id: product._id }, update: { $set: { stock: newStock, stockAdjust: newAdjust } } } });
    countRows.push({
      name: product.name,
      unit: product.unit || 'واحد',
      book,
      countedQty: c.countedQty,
      maghayerat,
      kgDelta: round3(maghayerat * kgPer),
      oldStock,
      newStock,
      oldAdjust,
      newAdjust,
      changed: dirty,
      opening,
    });
  }

  // Optional: bring products without a fresh count onto the canonical rebuild formula.
  if (rebuildOthers) {
    for (const product of products) {
      const pid = String(product._id);
      if (counted.has(pid)) continue;
      const book = round3(totals.get(pid) || 0);
      const opening = Number(product.openingStock) || 0;
      const adjust = round3(Number(product.stockAdjust) || 0);
      const oldStock = round3(Number(product.stock) || 0);
      const newStock = round3(book + adjust + opening);
      if (Math.abs(oldStock - newStock) <= 0.0005) continue;
      rebuildRows.push({ name: product.name, unit: product.unit || '', oldStock, newStock });
      writes.push({ updateOne: { filter: { _id: product._id }, update: { $set: { stock: newStock } } } });
    }
  }

  console.log(`اتصال: ${uri.replace(/\/\/[^@/]*@/, '//***@')}`);
  console.log(apply ? '** حالت نوشتن (--apply) **' : 'پیش‌نمایش — چیزی نوشته نمی‌شود (برای اعمال --apply بزنید)');
  console.log(`انبارگردانیِ ثبت‌شده: ${counts.length} دور، ${counted.size} کالا شمارش شده.`);
  console.log(`فاکتور خرید/فروش خوانده شد: ${invoices.length}`);

  console.log('\n=== مغایرت‌های انبارگردانی (عدد شمارش‌شده در برابر خرید−فروش) ===');
  const withDiff = countRows.filter((r) => !r.missing && Math.abs(r.maghayerat) > 0.0005);
  if (!withDiff.length) {
    console.log('  هیچ کالایی مغایرت ندارد؛ شمارش با کتاب (خرید−فروش) یکی است.');
  } else {
    for (const r of withDiff.sort((a, b) => Math.abs(b.maghayerat) - Math.abs(a.maghayerat))) {
      const sign = r.maghayerat > 0 ? 'اضافه' : 'کسر';
      console.log(
        `  ${r.name}: کتاب ${fa(r.book + r.opening)} ${r.unit} ← شمارش ${fa(r.countedQty)} ${r.unit} ` +
          `(مغایرت ${r.maghayerat > 0 ? '+' : ''}${fa(r.maghayerat)} ${r.unit}${r.kgDelta ? ` ≈ ${r.kgDelta > 0 ? '+' : ''}${fa(r.kgDelta)} کیلو (${sign})` : ''}) ` +
          `· موجودی ${fa(r.oldStock)} → ${fa(r.newStock)} · اصلاح ${fa(r.oldAdjust)} → ${fa(r.newAdjust)}`,
      );
    }
  }

  const noDiff = countRows.filter((r) => !r.missing && Math.abs(r.maghayerat) <= 0.0005);
  if (noDiff.length) console.log(`\n  شمارش‌های بدون مغایرت: ${noDiff.length} کالا (عدد شمارش برابرِ کتاب است)`);

  if (rebuildOthers) {
    console.log('\n=== عادی‌سازی کالاهای بدون شمارش (--rebuild-others) ===');
    if (!rebuildRows.length) console.log('  تغییری لازم نبود.');
    for (const r of rebuildRows.sort((a, b) => a.name.localeCompare(b.name, 'fa'))) {
      console.log(`  ${r.name}: ${fa(r.oldStock)} → ${fa(r.newStock)} ${r.unit}`);
    }
  }

  if (unlinked.length) {
    console.log('\n  ردیف‌های خرید بدون کد کالا (در گزارش، تا rebuildStock اجرا نشود، حساب نمی‌شوند):');
    for (const line of unlinked.slice(0, 40)) console.log(`    ${line}`);
  }

  const changedCount = countRows.filter((r) => r.changed).length + rebuildRows.length;
  console.log(`\nکالا برای اصلاح: ${changedCount}`);

  if (!apply) {
    console.log('چیزی نوشته نشد. برای اعمال: node scripts/repair-stock-count.js --apply');
    await mongoose.disconnect();
    return;
  }

  if (writes.length) {
    await db.collection('products').bulkWrite(writes);
    const ids = writes.map((w) => w.updateOne.filter._id);
    await db.collection('products').updateMany({ _id: { $in: ids } }, { $set: { updatedAt: new Date() } });
    console.log(`نوشته شد: ${writes.length} کالا. کش گزارش با تغییر updatedAt دوباره حساب می‌شود.`);
  } else {
    console.log('نیاز به تغییری نبود.');
  }

  console.log('حالا صفحهٔ انبار (Pull-to-refresh) عدد شمارش‌شده را درست نشان می‌دهد.');
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
