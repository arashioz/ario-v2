/**
 * فروش‌های «ارسال از کارخانه» را با قیمت کارخانه و درصد سود دسته درست می‌کند.
 * اگر فاکتور فروش نباشد، با --customer ساخته می‌شود. خرید کارخانه دست نمی‌خورد.
 *
 *   node scripts/repair-factory-sales.js --dry
 *   node scripts/repair-factory-sales.js --customer "حسن جلیلی"
 *
 * روی سرور:
 *   docker compose exec app node scripts/repair-factory-sales.js --dry
 *   docker compose exec app node scripts/repair-factory-sales.js --customer "حسن جلیلی"
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

function loadEnv() {
  const file = path.join(__dirname, '../.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
}

loadEnv();

const dry = process.argv.includes('--dry');
const customerFlag = process.argv.indexOf('--customer');
const customerName = customerFlag >= 0 ? process.argv[customerFlag + 1] : '';
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27019/ario_db';

const fold = (value) => String(value || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim();

function percentOf(rules, category, saleType) {
  const rule = (rules || []).find((row) => fold(row.category) === fold(category));
  const raw = !rule ? 0
    : saleType === 'supermarket' ? rule.supermarketPercent
    : saleType === 'wholesale' ? rule.wholesalePercent
    : saleType === 'distributor' ? rule.distributorPercent
    : rule.retailPercent;
  return Math.min(1000, Math.max(0, Math.round(Number(raw) || 0)));
}

function nextNumber(existing, isSale, date) {
  const stamp = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const prefix = `${isSale ? 'SAL' : 'PUR'}-${stamp}-`;
  let n = existing.filter((number) => String(number).startsWith(prefix)).length + 1;
  while (existing.includes(`${prefix}${String(n).padStart(4, '0')}`)) n += 1;
  const number = `${prefix}${String(n).padStart(4, '0')}`;
  existing.push(number);
  return number;
}

async function main() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;
  const invoices = db.collection('invoices');
  const products = db.collection('products');
  const customers = db.collection('customers');
  const transactions = db.collection('customertransactions');
  const settings = await db.collection('appsettings').findOne({});
  const rules = settings?.categoryBasePrices || [];
  const catalog = await products.find({}, { projection: { category: 1 } }).toArray();
  const category = new Map(catalog.map((product) => [String(product._id), product.category || '']));
  const numbers = (await invoices.find({}, { projection: { invoiceNumber: 1 } }).toArray()).map((row) => row.invoiceNumber);
  const people = await customers.find({}).toArray();
  const buyerOf = (name) => people.find((person) => fold(person.name) === fold(name));
  const purchases = await invoices.find({ type: 'purchase', fulfillment: 'factory' }).toArray();
  let priced = 0;
  let created = 0;

  for (const purchase of purchases) {
    const saleId = purchase.factorySaleId;
    let sale = saleId && mongoose.Types.ObjectId.isValid(String(saleId))
      ? await invoices.findOne({ _id: new mongoose.Types.ObjectId(String(saleId)) })
      : null;
    if (!sale) sale = await invoices.findOne({ type: 'sale', factoryPurchaseId: String(purchase._id) });
    const saleType = sale?.saleType || 'wholesale';
    const lines = (purchase.items || []).map((item) => {
      const cost = Math.round(Number(item.unitPrice) || 0);
      const pct = percentOf(rules, category.get(String(item.productId)), saleType);
      const unitPrice = Math.round(cost * (1 + pct / 100));
      return { ...item, factoryUnitCost: cost, unitPrice, totalPrice: Math.round((Number(item.quantity) || 0) * unitPrice), received: true };
    });
    const goods = lines.reduce((sum, item) => sum + item.totalPrice, 0);
    if (!sale) {
      if (!customerName) {
        console.log(`بدون فاکتور فروش: ${purchase.invoiceNumber} — برای ساختنش --customer بدهید`);
        continue;
      }
      const buyer = buyerOf(customerName);
      const finalAmount = goods;
      const invoiceDate = purchase.invoiceDate ? new Date(purchase.invoiceDate) : new Date();
      const invoiceNumber = nextNumber(numbers, true, invoiceDate);
      const doc = {
        invoiceNumber,
        type: 'sale',
        saleType: 'wholesale',
        customerId: buyer?._id,
        customerName: buyer?.name || fold(customerName),
        customerPhone: buyer?.phoneNumber || '',
        supplierCompany: purchase.customerName || '',
        invoiceDate,
        items: lines,
        totalAmount: goods,
        discount: 0,
        finalAmount,
        totalWeightKg: purchase.totalWeightKg || 0,
        paymentMethod: 'credit',
        splitDetails: {},
        creditAmount: finalAmount,
        paidAmount: 0,
        remainingDebt: finalAmount,
        isPaid: finalAmount <= 0,
        fulfillment: 'factory',
        factoryPurchaseId: String(purchase._id),
        factoryPurchaseNumber: purchase.invoiceNumber,
        notes: `ساخته‌شده از خرید کارخانه ${purchase.invoiceNumber}`,
        createdByName: 'تعمیر ارسال از کارخانه',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      console.log(`${dry ? 'می‌سازد' : 'ساخت'} فاکتور فروش ${invoiceNumber} برای ${doc.customerName} از ${purchase.invoiceNumber}: ${finalAmount}`);
      if (!dry) {
        const inserted = await invoices.insertOne(doc);
        await invoices.updateOne({ _id: purchase._id }, { $set: { factorySaleId: String(inserted.insertedId), factorySaleNumber: invoiceNumber } });
        if (buyer && finalAmount > 0) {
          const balance = (buyer.balance || 0) + finalAmount;
          await customers.updateOne({ _id: buyer._id }, { $inc: { balance: finalAmount }, $set: { lastTransactionDate: invoiceDate } });
          await transactions.insertOne({
            customer: buyer._id,
            type: 'debt',
            amount: finalAmount,
            balanceAfter: balance,
            paymentMethod: 'cash',
            description: `نسیه فاکتور ${invoiceNumber}`,
            invoiceId: inserted.insertedId,
            invoiceNumber,
            recordedByName: 'تعمیر ارسال از کارخانه',
            date: invoiceDate,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }
      created += 1;
      continue;
    }

    const costOf = new Map((purchase.items || []).map((item) => [String(item.productId), Math.round(Number(item.unitPrice) || 0)]));
    const nextItems = (sale.items || []).map((item) => {
      if (Number(item.unitPrice) > 0) return item;
      const cost = costOf.get(String(item.productId)) || Math.round(Number(item.factoryUnitCost) || 0);
      if (!(cost > 0)) return item;
      const unitPrice = Math.round(cost * (1 + percentOf(rules, category.get(String(item.productId)), sale.saleType || 'wholesale') / 100));
      return { ...item, factoryUnitCost: cost, unitPrice, totalPrice: Math.round((Number(item.quantity) || 0) * unitPrice) };
    });
    const goodsNow = nextItems.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0);
    const needsPrice = nextItems.some((item, index) => item !== (sale.items || [])[index]);
    if (!needsPrice || !(goodsNow > 0)) continue;
    const discount = Math.max(0, Math.round(Number(sale.discount) || 0));
    const finalAmount = Math.max(0, goodsNow - discount);
    const paid = Math.min(finalAmount, Math.round(Number(sale.paidAmount) || 0));
    const wasEmpty = !(Number(sale.finalAmount) > 0);
    const credit = wasEmpty || sale.paymentMethod === 'credit' || sale.paymentMethod === 'split'
      ? Math.max(0, finalAmount - paid)
      : Math.round(Number(sale.creditAmount) || 0);
    console.log(`${dry ? 'قیمت می‌دهد' : 'قیمت داد'} ${sale.invoiceNumber} برای ${sale.customerName}: ${sale.finalAmount || 0} → ${finalAmount}`);
    if (!dry) {
      await invoices.updateOne({ _id: sale._id }, {
        $set: {
          items: nextItems,
          totalAmount: goodsNow,
          finalAmount,
          creditAmount: credit,
          paidAmount: paid,
          remainingDebt: Math.max(0, finalAmount - paid),
          isPaid: finalAmount - paid <= 0,
          paymentMethod: wasEmpty ? 'credit' : sale.paymentMethod,
          fulfillment: 'factory',
          factoryPurchaseId: String(purchase._id),
          factoryPurchaseNumber: purchase.invoiceNumber,
        },
      });
      if (sale.customerId) {
        const oldCredit = Math.round(Number(sale.creditAmount) || 0);
        const delta = credit - oldCredit;
        if (delta !== 0) {
          await customers.updateOne({ _id: sale.customerId }, { $inc: { balance: delta } });
          const debt = await transactions.findOne({ type: 'debt', invoiceId: sale._id });
          if (debt) await transactions.updateOne({ _id: debt._id }, { $inc: { amount: delta } });
          else if (credit > 0) {
            const buyer = await customers.findOne({ _id: sale.customerId });
            await transactions.insertOne({
              customer: sale.customerId,
              type: 'debt',
              amount: credit,
              balanceAfter: buyer?.balance || credit,
              paymentMethod: 'cash',
              description: `نسیه فاکتور ${sale.invoiceNumber}`,
              invoiceId: sale._id,
              invoiceNumber: sale.invoiceNumber,
              recordedByName: 'تعمیر ارسال از کارخانه',
              date: sale.invoiceDate || new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
        }
      }
    }
    priced += 1;
  }

  console.log(dry ? `پیش‌نمایش: ${priced} فاکتور قیمت می‌گیرد، ${created} فاکتور فروش ساخته می‌شود.` : `تمام. ${priced} فاکتور قیمت گرفت، ${created} فاکتور فروش ساخته شد.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
