/**
 * ارسال از کارخانه را جفت می‌کند:
 *   فاکتور فروش به نام مشتری، با قیمت سیستم آریو
 *   فاکتور خرید به قیمت کارخانه
 * تاریخ فاکتور را به روز پیش‌فاکتور برمی‌گرداند، نه روز زدن دکمه ارسال.
 *
 *   node scripts/repair-factory-sales.js --dry
 *   node scripts/repair-factory-sales.js
 *
 * روی سرور:
 *   docker compose exec app node scripts/repair-factory-sales.js --dry
 *   docker compose exec app node scripts/repair-factory-sales.js
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
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27019/ario_db';
const fold = (value) => String(value || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim();

function dayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(+date)) return '';
  const tehran = new Date(date.getTime() + 3.5 * 60 * 60 * 1000);
  return tehran.toISOString().slice(0, 10);
}

function arioPrice(product, saleType) {
  if (!product) return 0;
  const tier = saleType === 'supermarket' ? product.priceSupermarket
    : saleType === 'wholesale' ? product.priceWholesale
    : saleType === 'distributor' ? product.priceDistributor
    : product.priceRetail;
  return Math.round(Number(tier) || Number(product.sellPrice) || 0);
}

function nextNumber(existing, isSale, date) {
  const stamp = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const prefix = `${isSale ? 'SAL' : 'PUR'}-${stamp}-`;
  let n = 1;
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
  const proformas = await db.collection('proformas').find({ fulfillment: 'factory' }).toArray();
  const catalog = new Map((await products.find({}).toArray()).map((product) => [String(product._id), product]));
  const people = await customers.find({}).toArray();
  const buyerOf = (name) => people.find((person) => fold(person.name) === fold(name));
  const numbers = (await invoices.find({}, { projection: { invoiceNumber: 1 } }).toArray()).map((row) => row.invoiceNumber);
  let fixed = 0;
  let created = 0;

  const saleLines = (source, saleType) => (source.items || []).map((item) => {
    const product = catalog.get(String(item.productId));
    const cost = Math.round(Number(item.factoryUnitCost) || Number(product?.buyPrice) || 0);
    const unitPrice = Math.round(Number(item.unitPrice) > 0 ? Number(item.unitPrice) : arioPrice(product, saleType));
    return {
      ...item,
      factoryUnitCost: cost,
      unitPrice,
      totalPrice: Math.round((Number(item.quantity) || 0) * unitPrice),
      received: true,
    };
  });

  const purchaseLines = (source) => (source.items || []).map((item) => {
    const product = catalog.get(String(item.productId));
    const cost = Math.round(Number(item.factoryUnitCost) || Number(product?.buyPrice) || 0);
    return {
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: cost,
      totalPrice: Math.round((Number(item.quantity) || 0) * cost),
      weightKg: item.weightKg || 0,
      factoryUnitCost: cost,
      received: true,
    };
  });

  async function writeDebt(sale, buyer, amount) {
    if (!buyer || !(amount > 0)) return;
    const balance = (buyer.balance || 0) + amount;
    await customers.updateOne({ _id: buyer._id }, { $inc: { balance: amount }, $set: { lastTransactionDate: sale.invoiceDate } });
    buyer.balance = balance;
    await transactions.insertOne({
      customer: buyer._id,
      type: 'debt',
      amount,
      balanceAfter: balance,
      paymentMethod: 'cash',
      description: `نسیه فاکتور ${sale.invoiceNumber}`,
      invoiceId: sale._id,
      invoiceNumber: sale.invoiceNumber,
      recordedByName: 'تعمیر ارسال از کارخانه',
      date: sale.invoiceDate,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  for (const proforma of proformas) {
    if (proforma.status !== 'shipped' && !proforma.invoiceId) {
      console.log(`پیش‌فاکتور ${proforma.number} برای ${proforma.customerName} هنوز ارسال نشده و فاکتور نیست`);
      continue;
    }
    let sale = proforma.invoiceId && mongoose.Types.ObjectId.isValid(String(proforma.invoiceId))
      ? await invoices.findOne({ _id: new mongoose.Types.ObjectId(String(proforma.invoiceId)), type: 'sale' })
      : null;
    if (!sale && proforma.invoiceNumber) {
      sale = await invoices.findOne({ type: 'sale', invoiceNumber: { $in: String(proforma.invoiceNumber).split('،').map((part) => part.trim()) } });
    }
    const orderDate = proforma.orderDate ? new Date(proforma.orderDate) : (sale?.invoiceDate ? new Date(sale.invoiceDate) : new Date());
    const lines = saleLines(proforma.items?.length ? proforma : (sale || { items: [] }), proforma.saleType || sale?.saleType || 'wholesale');
    const goods = lines.reduce((sum, item) => sum + item.totalPrice, 0);
    const buyer = buyerOf(proforma.customerName);

    if (!sale) {
      if (!(goods > 0)) {
        console.log(`قیمت آریو برای ${proforma.customerName} (${proforma.number}) صفر است؛ فاکتور فروش ساخته نشد`);
        continue;
      }
      const invoiceNumber = nextNumber(numbers, true, orderDate);
      const doc = {
        invoiceNumber,
        type: 'sale',
        saleType: proforma.saleType || 'wholesale',
        customerId: buyer?._id,
        customerName: buyer?.name || proforma.customerName,
        customerPhone: proforma.customerPhone || buyer?.phoneNumber || '',
        invoiceDate: orderDate,
        proformaDate: orderDate,
        proformaNumber: proforma.number,
        shippedAt: proforma.shippedAt || null,
        items: lines,
        totalAmount: goods,
        discount: proforma.discount || 0,
        finalAmount: Math.max(0, goods - (proforma.discount || 0)),
        totalWeightKg: proforma.totalWeightKg || 0,
        paymentMethod: proforma.paymentMethod || 'credit',
        creditAmount: Math.max(0, goods - (proforma.discount || 0)),
        paidAmount: 0,
        remainingDebt: Math.max(0, goods - (proforma.discount || 0)),
        isPaid: false,
        fulfillment: 'factory',
        notes: `ساخته‌شده از پیش‌فاکتور ${proforma.number}`,
        createdByName: 'تعمیر ارسال از کارخانه',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      console.log(`${dry ? 'می‌سازد' : 'ساخت'} فروش ${invoiceNumber} برای ${doc.customerName} از ${proforma.number}: ${doc.finalAmount}`);
      if (!dry) {
        const inserted = await invoices.insertOne(doc);
        sale = { ...doc, _id: inserted.insertedId };
        await db.collection('proformas').updateOne({ _id: proforma._id }, { $set: { invoiceId: String(inserted.insertedId), invoiceNumber } });
        if ((doc.paymentMethod === 'credit' || doc.paymentMethod === 'split') && doc.creditAmount > 0) await writeDebt(sale, buyer, doc.creditAmount);
      } else {
        sale = doc;
      }
      created += 1;
    } else {
      const priced = (sale.items || []).map((item, index) => {
        if (Number(item.unitPrice) > 0) return item;
        const next = lines[index] || lines.find((line) => String(line.productId) === String(item.productId));
        return next && Number(next.unitPrice) > 0 ? { ...item, unitPrice: next.unitPrice, totalPrice: Math.round((item.quantity || 0) * next.unitPrice), factoryUnitCost: next.factoryUnitCost || item.factoryUnitCost } : item;
      });
      const goodsNow = priced.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0);
      const shipDay = dayKey(sale.shippedAt || proforma.shippedAt);
      const orderDay = dayKey(orderDate);
      const invoiceDay = dayKey(sale.invoiceDate);
      const moveDate = orderDay && shipDay && invoiceDay === shipDay && orderDay !== shipDay;
      const needsPrice = priced.some((item, index) => item !== (sale.items || [])[index]);
      if (needsPrice || moveDate || !sale.proformaDate) {
        const finalAmount = Math.max(0, goodsNow - (Number(sale.discount) || 0));
        console.log(`${dry ? 'درست می‌کند' : 'درست کرد'} ${sale.invoiceNumber} برای ${proforma.customerName}${moveDate ? ' — تاریخ برگشت به پیش‌فاکتور' : ''}${needsPrice ? ` — قیمت ${sale.finalAmount || 0} به ${finalAmount}` : ''}`);
        if (!dry) {
          const paid = Math.min(finalAmount, Math.round(Number(sale.paidAmount) || 0));
          const wasEmpty = !(Number(sale.finalAmount) > 0);
          const credit = wasEmpty ? Math.max(0, finalAmount - paid) : Math.round(Number(sale.creditAmount) || 0);
          await invoices.updateOne({ _id: sale._id }, {
            $set: {
              items: needsPrice ? priced : sale.items,
              ...(needsPrice ? { totalAmount: goodsNow, finalAmount, creditAmount: credit, paidAmount: paid, remainingDebt: Math.max(0, finalAmount - paid), isPaid: finalAmount - paid <= 0, paymentMethod: wasEmpty ? 'credit' : sale.paymentMethod } : {}),
              invoiceDate: moveDate ? orderDate : sale.invoiceDate,
              proformaDate: orderDate,
              proformaNumber: sale.proformaNumber || proforma.number,
              fulfillment: 'factory',
              customerName: sale.customerName || proforma.customerName,
            },
          });
          if (needsPrice && sale.customerId && wasEmpty && credit > 0) await writeDebt(sale, buyerOf(sale.customerName) || buyer, credit);
        }
        fixed += 1;
      }
    }

    if (!sale?._id && dry) continue;
    const purchase = sale?._id ? await invoices.findOne({ type: 'purchase', factorySaleId: String(sale._id) }) : null;
    const costs = purchaseLines(sale || proforma);
    const costTotal = costs.reduce((sum, item) => sum + item.totalPrice, 0);
    if (!purchase && sale?._id) {
      const invoiceNumber = nextNumber(numbers, false, orderDate);
      console.log(`${dry ? 'خرید می‌سازد' : 'خرید ساخت'} ${invoiceNumber} برای فروش ${sale.invoiceNumber || proforma.number}: ${costTotal}`);
      if (!dry) {
        const inserted = await invoices.insertOne({
          invoiceNumber,
          type: 'purchase',
          saleType: 'wholesale',
          customerName: 'شرکت قند بلالی',
          endCustomerName: proforma.customerName,
          invoiceDate: orderDate,
          proformaDate: orderDate,
          items: costs,
          totalAmount: costTotal,
          discount: 0,
          finalAmount: costTotal,
          totalWeightKg: proforma.totalWeightKg || sale.totalWeightKg || 0,
          paymentMethod: 'credit',
          creditAmount: costTotal,
          paidAmount: 0,
          remainingDebt: costTotal,
          isPaid: costTotal <= 0,
          fulfillment: 'factory',
          factorySaleId: String(sale._id),
          notes: `ارسال مستقیم از کارخانه برای ${proforma.customerName}، فاکتور ${sale.invoiceNumber}`,
          createdByName: 'تعمیر ارسال از کارخانه',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await invoices.updateOne({ _id: sale._id }, { $set: { factoryPurchaseId: String(inserted.insertedId), factoryPurchaseNumber: invoiceNumber } });
      }
      created += 1;
    } else if (purchase && proforma.customerName && purchase.endCustomerName !== proforma.customerName && !dry) {
      await invoices.updateOne({ _id: purchase._id }, { $set: { endCustomerName: proforma.customerName } });
    }
  }

  console.log(dry ? `پیش‌نمایش: ${fixed} فاکتور اصلاح می‌شود، ${created} فاکتور ساخته می‌شود.` : `تمام. ${fixed} فاکتور اصلاح شد، ${created} فاکتور ساخته شد.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
