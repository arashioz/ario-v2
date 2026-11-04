/**
 * سود فاکتورهای فروش قدیمی را بدون ذخیرهٔ دوباره از اپ می‌نویسد،
 * و میانگین قیمت خرید و فروش هر کالا را ماه‌به‌ماه حساب می‌کند.
 *
 * برای هر فروش، بهای خرید همان لحظه است: آخرین خرید (با کرایه) قبل از آن فاکتور،
 * نه قیمت امروز کالا. فروش کارخانه از قیمت کارخانه روی همان ردیف استفاده می‌کند.
 *
 *   node scripts/stamp-invoice-profits.js
 *   node scripts/stamp-invoice-profits.js --dry
 *
 * روی سرور:
 *   docker compose exec app node scripts/stamp-invoice-profits.js
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

const div = (a, b) => ~~(a / b);
const mod = (a, b) => a - ~~(a / b) * b;
const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
const pad = (n) => String(n).padStart(2, '0');
const tehranDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' });

function jalCal(jy) {
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}
function g2d(gy, gm, gd) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
}
function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}
function j2d(jy, jm, jd) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}
function d2j(jdn) {
  const { gy } = d2g(jdn);
  let jy = gy - 621;
  const r = jalCal(jy);
  let k = jdn - g2d(gy, 3, r.march);
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}
function monthKey(date) {
  const ymd = tehranDay.format(new Date(date));
  const [y, m, d] = ymd.split('-').map(Number);
  const j = d2j(g2d(y, m, d));
  return `${j.jy}-${pad(j.jm)}`;
}

function landedUnitPrices(inv) {
  const items = inv.items || [];
  const kgs = items.map((it) => Number(it.weightKg) || Number(it.secondaryQuantity) || 0);
  const totalKg = kgs.reduce((s, k) => s + (k > 0 ? k : 0), 0);
  const totalQty = items.reduce((s, it) => s + Math.max(0, Number(it.quantity) || 0), 0);
  const freight = inv.type === 'purchase' && inv.shippingPayer === 'me' ? Number(inv.shippingCost) || 0 : 0;
  const discount = Number(inv.discount) || 0;
  const goods = Number(inv.totalAmount) || 0;
  const factor = goods > 0 && discount > 0 ? Math.max(0, goods - discount) / goods : 1;
  const freightPerKg = totalKg > 0 ? freight / totalKg : 0;
  return items.map((it, i) => {
    const qty = Number(it.quantity) || 0;
    const kg = kgs[i];
    const line = (Number(it.totalPrice) || 0) * factor;
    if (!(qty > 0)) return Math.max(0, Math.round(Number(it.unitPrice) || 0));
    if (kg > 0 && totalKg > 0) return Math.max(0, Math.round((line / kg + freightPerKg) * (kg / qty)));
    const share = totalQty > 0 ? freight * (qty / totalQty) : 0;
    return Math.max(0, Math.round((line + share) / qty));
  });
}

function addMonth(map, pid, month, kind, qty, amount, kg) {
  if (!(qty > 0) || !(amount > 0)) return;
  if (!map.has(pid)) map.set(pid, new Map());
  const months = map.get(pid);
  const row = months.get(month) || { buyQty: 0, buyAmount: 0, buyKg: 0, sellQty: 0, sellAmount: 0, sellKg: 0 };
  if (kind === 'buy') {
    row.buyQty += qty;
    row.buyAmount += amount;
    row.buyKg += kg;
  } else {
    row.sellQty += qty;
    row.sellAmount += amount;
    row.sellKg += kg;
  }
  months.set(month, row);
}

async function main() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;
  const products = await db.collection('products').find({}, { projection: { _id: 1, name: 1, buyPrice: 1 } }).toArray();
  const invoices = await db.collection('invoices')
    .find({ type: { $in: ['sale', 'purchase'] } })
    .project({
      type: 1,
      fulfillment: 1,
      invoiceDate: 1,
      createdAt: 1,
      invoiceNumber: 1,
      shippingPayer: 1,
      shippingCost: 1,
      totalAmount: 1,
      discount: 1,
      items: 1,
    })
    .sort({ invoiceDate: 1, createdAt: 1, _id: 1 })
    .toArray();

  const lastCost = new Map();
  const months = new Map();
  const invoiceWrites = [];
  let salesStamped = 0;
  let salesSkipped = 0;
  let purchasesSeen = 0;

  for (const inv of invoices) {
    const month = monthKey(inv.invoiceDate || inv.createdAt || new Date());
    if (inv.type === 'purchase') {
      purchasesSeen++;
      const prices = landedUnitPrices(inv);
      (inv.items || []).forEach((it, i) => {
        const pid = String(it.productId || '');
        const qty = Number(it.quantity) || 0;
        const kg = Number(it.weightKg) || Number(it.secondaryQuantity) || 0;
        const unit = prices[i] || 0;
        if (!pid || !(unit > 0) || !(qty > 0)) return;
        if (inv.fulfillment !== 'factory') lastCost.set(pid, unit);
        addMonth(months, pid, month, 'buy', qty, unit * qty, kg);
      });
      continue;
    }

    const fromFactory = inv.fulfillment === 'factory';
    const items = (inv.items || []).map((it) => ({ ...it }));
    const goods = items.reduce((s, it) => s + (Number(it.totalPrice) || 0), 0);
    const discount = Math.min(goods, Math.max(0, Math.round(Number(inv.discount) || 0)));
    const factor = goods > 0 ? (goods - discount) / goods : 1;
    let costAmount = 0;
    let profitAmount = 0;
    for (const it of items) {
      const pid = String(it.productId || '');
      const qty = Number(it.quantity) || 0;
      const kg = Number(it.weightKg) || Number(it.secondaryQuantity) || 0;
      const unitCost = fromFactory
        ? Math.round(Number(it.factoryUnitCost) || lastCost.get(pid) || 0)
        : lastCost.get(pid) || 0;
      const lineNet = Math.round((Number(it.totalPrice) || 0) * factor);
      const lineCost = unitCost > 0 ? Math.round(unitCost * qty) : 0;
      const lineProfit = unitCost > 0 ? lineNet - lineCost : 0;
      it.unitCost = unitCost;
      it.profit = lineProfit;
      costAmount += lineCost;
      profitAmount += lineProfit;
      if (qty > 0 && lineNet > 0) addMonth(months, pid, month, 'sell', qty, lineNet, kg);
    }
    salesStamped++;
    if (!(costAmount > 0) && !(profitAmount > 0)) salesSkipped++;
    invoiceWrites.push({
      updateOne: {
        filter: { _id: inv._id },
        update: { $set: { items, costAmount, profitAmount } },
      },
    });
  }

  const productWrites = products.map((p) => {
    const pid = String(p._id);
    const rows = [...(months.get(pid)?.entries() || [])].sort(([a], [b]) => (a < b ? -1 : 1));
    let buyQty = 0;
    let buyAmount = 0;
    let sellQty = 0;
    let sellAmount = 0;
    const monthlyPrices = rows.map(([month, r]) => {
      buyQty += r.buyQty;
      buyAmount += r.buyAmount;
      sellQty += r.sellQty;
      sellAmount += r.sellAmount;
      return {
        month,
        buy: r.buyQty > 0 ? Math.round(r.buyAmount / r.buyQty) : 0,
        sell: r.sellQty > 0 ? Math.round(r.sellAmount / r.sellQty) : 0,
        buyPerKg: r.buyKg > 0 ? Math.round(r.buyAmount / r.buyKg) : 0,
        sellPerKg: r.sellKg > 0 ? Math.round(r.sellAmount / r.sellKg) : 0,
        buyQty: Math.round(r.buyQty * 1000) / 1000,
        sellQty: Math.round(r.sellQty * 1000) / 1000,
      };
    });
    return {
      updateOne: {
        filter: { _id: p._id },
        update: {
          $set: {
            avgBuyPrice: buyQty > 0 ? Math.round(buyAmount / buyQty) : 0,
            avgSellPrice: sellQty > 0 ? Math.round(sellAmount / sellQty) : 0,
            monthlyPrices,
          },
        },
      },
    };
  });

  if (!dry) {
    for (let i = 0; i < invoiceWrites.length; i += 200) {
      await db.collection('invoices').bulkWrite(invoiceWrites.slice(i, i + 200), { ordered: false });
    }
    for (let i = 0; i < productWrites.length; i += 200) {
      await db.collection('products').bulkWrite(productWrites.slice(i, i + 200), { ordered: false });
    }
  }

  console.log(JSON.stringify({
    dry,
    purchases: purchasesSeen,
    salesStamped,
    salesWithoutCost: salesSkipped,
    products: productWrites.length,
    invoicesWritten: dry ? 0 : invoiceWrites.length,
  }, null, 2));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
