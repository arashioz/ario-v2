/**
 * Comprehensive Migration & Seeding Script for Ario Application
 * Source: the old app's full backup `src/static/fullBackup.json` (see legacy-source.js; falls back to the
 * 2026-09-25 per-section exports).
 *
 * Imports:
 * - Dual-Unit Products (stock converted from kg to packages)
 * - Consolidated Customers with exact debtor balances, GPS, phones
 * - Full Customer Transactions (Debts & Payments)
 * - Sale Invoices (linked to customers) and Purchase Invoices (type: 'purchase')
 * - Expenses (with manager withdrawals 'withdrawal' flag) and Expense Categories
 * - Company Payments, Supplier Debts, Cash Transactions, Shop Notes, received cheques
 *
 * Takes a full database dump first (backups/) and keeps what was edited in the new app — see preserve-app-data.js.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const mongoose = require('mongoose');
const { loadLegacy } = require('./legacy-source');
const { guard, snapshot, restore } = require('./preserve-app-data');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27019/ario_db';
const MONGO_CONTAINER = process.env.MONGO_CONTAINER || 'ariov2_mongodb';
const BACKUP_DIR = path.join(__dirname, '../backups');

function dumpDatabase() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(BACKUP_DIR, `ario_db-before-migration-${stamp}.archive.gz`);
  const dbName = new URL(MONGODB_URI).pathname.slice(1) || 'ario_db';
  execSync(`docker exec ${MONGO_CONTAINER} mongodump --db ${dbName} --archive --gzip --quiet > "${file}"`, { stdio: ['ignore', 'ignore', 'inherit'], shell: '/bin/sh' });
  if (!fs.statSync(file).size) throw new Error(`database dump ${file} is empty`);
  return file;
}

function normalizeStr(str) {
  if (!str) return '';
  return str
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhone(p) {
  if (!p) return '';
  let phone = normalizeStr(p).replace(/[^0-9]/g, '');
  if (phone.startsWith('98')) phone = '0' + phone.substring(2);
  if (phone.length === 10 && phone.startsWith('9')) phone = '0' + phone;
  return phone;
}

async function runMigration() {
  console.log('Connecting to MongoDB at:', MONGODB_URI);
  await mongoose.connect(MONGODB_URI);
  console.log('Connected successfully!');

  const db = mongoose.connection.db;

  // 1. Read the old app's data
  const L = loadLegacy();
  console.log('Source:', L.source);
  const dbBackup = { products: L.products, customers: L.customers, debtors: L.debtors, expenseCategories: L.expenseCategories };
  const custInvData = L.customers;
  const expensesData = L.expenses;
  const historyData = {
    companyPayments: L.companyPayments,
    supplierDebts: L.supplierDebts,
    cashTransactions: L.cashTransactions,
    shopNotes: L.shopNotes,
  };
  const purchaseInvoicesData = L.purchaseInvoices;
  const saleInvoicesData = L.saleInvoices;

  const check = await guard(db, L);
  if (check.duplicates.length) console.log(`Skipping ${check.duplicates.length} new-app payment(s) the backup already contains`);
  if (check.problems.length) {
    console.log('\nRecords that exist only in the new app and would be lost:');
    check.problems.forEach((p) => console.log('  -', p));
    if (process.env.ARIO_FORCE !== '1') {
      console.log('\nAborted. Record them in the old app first, or re-run with ARIO_FORCE=1.');
      await mongoose.disconnect();
      process.exit(2);
    }
  }
  if (process.env.ARIO_SKIP_DUMP !== '1') console.log('Database dump:', dumpDatabase());
  const snap = await snapshot(db);

  // 2. Clear collections
  console.log('Clearing existing collections for fresh import...');
  await db.collection('products').deleteMany({});
  await db.collection('customers').deleteMany({});
  await db.collection('invoices').deleteMany({});
  await db.collection('customertransactions').deleteMany({});
  await db.collection('expenses').deleteMany({});
  await db.collection('expensecategories').deleteMany({});
  await db.collection('companypayments').deleteMany({});
  await db.collection('supplierdebts').deleteMany({});
  await db.collection('supplierpayments').deleteMany({});
  await db.collection('proformas').deleteMany({});
  await db.collection('cashtransactions').deleteMany({});
  await db.collection('shopnotes').deleteMany({});

  // 3. Migrate Products
  console.log('\n--- 1. MIGRATING DUAL-UNIT PRODUCTS ---');
  const productsToInsert = [];
  const productMapById = new Map();

  for (const rawProd of dbBackup.products) {
    const kgRatio = rawProd.kgPerPackage || 1;
    const buyPricePerKg = rawProd.avgCostPerKg || rawProd.purchasePrice || 0;
    const buyPricePerPkg = Math.round(buyPricePerKg * kgRatio);

    const pRetailPct = rawProd.profitRetail || rawProd.profitPercent || 6;
    const pSupermarketPct = rawProd.profitSupermarket || 5;
    const pWholesalePct = rawProd.profitWholesale || 3;

    const priceRetail = Math.round(buyPricePerPkg * (1 + pRetailPct / 100));
    const priceSupermarket = Math.round(buyPricePerPkg * (1 + pSupermarketPct / 100));
    const priceWholesale = Math.round(buyPricePerPkg * (1 + pWholesalePct / 100));

    let unitName = 'بسته';
    if (rawProd.name.includes('کارتن')) unitName = 'کارتن';
    else if (rawProd.name.includes('کیسه')) unitName = 'کیسه';
    else if (rawProd.name.includes('سلفون')) unitName = 'سلفون';
    else if (rawProd.name.includes('فله')) unitName = 'کیسه';

    // Old app stored stock in kilograms (stock === stockKg); we store it in primary units (package/carton/bag).
    const stockKg = rawProd.stockKg ?? rawProd.stock ?? 0;
    // Six decimals: a 50 kg bag rounded to 3 decimals would lose up to 25 g of stock.
    const stockUnits = Math.round((stockKg / kgRatio) * 1e6) / 1e6;

    const prodDoc = {
      _id: new mongoose.Types.ObjectId(rawProd._id),
      name: rawProd.name.trim(),
      barcode: rawProd.barcode || '',
      category: rawProd.name.includes('نایلون')
        ? 'نایلون و پلاستیک'
        : rawProd.name.includes('نبات')
        ? 'نبات'
        : rawProd.name.includes('شکر')
        ? 'شکر'
        : 'قند و کارتن',
      unit: unitName,
      hasDualUnit: true,
      secondaryUnit: 'کیلوگرم',
      unitRatio: kgRatio,
      weightPerUnitKg: kgRatio,
      buyPrice: buyPricePerPkg,
      sellPrice: priceRetail,
      priceRetail,
      priceSupermarket,
      priceWholesale,
      stock: stockUnits,
      minStockAlert: 10,
      priceHistory: [
        {
          oldPrice: 0,
          newPrice: priceRetail,
          reason: 'ورود اولیه اطلاعات از نسخه قبلی',
          changedByName: 'سیستم مایگریشن',
          date: new Date(rawProd.createdAt || Date.now()),
        },
      ],
      description: `هر ${unitName} برابر با ${kgRatio} کیلوگرم — وزن کل انبار: ${(stockUnits * kgRatio).toLocaleString('fa-IR')} کیلو`,
      isActive: true,
      createdAt: new Date(rawProd.createdAt || Date.now()),
      updatedAt: new Date(rawProd.updatedAt || Date.now()),
    };

    productsToInsert.push(prodDoc);
    productMapById.set(rawProd._id, prodDoc);
  }

  await db.collection('products').insertMany(productsToInsert);
  console.log(`Successfully migrated ${productsToInsert.length} products!`);

  // 4. Migrate and Deduplicate Customers & Calculate Accurate Debts
  console.log('\n--- 2. MIGRATING & DEDUPLICATING CUSTOMERS ---');
  const custLocMap = new Map();
  custInvData.forEach((c) => {
    custLocMap.set(c._id, c);
  });

  const idRedirect = {};
  const masterCustomers = [];

  // Group debtors by customerId and invoiceId
  const debtorsByCustId = new Map();
  const debtorsByInvoiceId = new Map();
  dbBackup.debtors.forEach((d) => {
    if (d.customerId) {
      if (!debtorsByCustId.has(d.customerId)) debtorsByCustId.set(d.customerId, []);
      debtorsByCustId.get(d.customerId).push(d);
    }
    if (d.saleInvoiceId) {
      debtorsByInvoiceId.set(d.saleInvoiceId, d);
    }
  });

  const nameGroups = new Map();
  dbBackup.customers.forEach((c) => {
    const norm = normalizeStr(c.name);
    if (!nameGroups.has(norm)) nameGroups.set(norm, []);
    nameGroups.get(norm).push(c);
  });

  const JAHANI_7TIR = '6a97d9c60ff5a1649e883d88';
  const JAHANI_BALA = '6a97dfaa0ff5a1649e883fc4';
  const jahani1 = dbBackup.customers.find((c) => c._id === JAHANI_7TIR);
  const jahani2 = dbBackup.customers.find((c) => c._id === JAHANI_BALA);

  function getRemainingDebtForCustomer(cId) {
    const debts = debtorsByCustId.get(cId) || [];
    if (debts.length === 0) return 0;
    return debts.reduce((sum, d) => sum + Math.max(0, (d.amount || 0) - (d.paidAmount || 0)), 0);
  }

  for (const [normName, list] of nameGroups.entries()) {
    if (normName === 'جهانی هفت تیر' || normName === 'جهانی بالا') {
      continue;
    }

    if (list.length === 1) {
      const c = list[0];
      const loc = custLocMap.get(c._id);
      const lat = (loc && loc.lat) || (loc && loc.location && loc.location.lat) || undefined;
      const lng = (loc && loc.lng) || (loc && loc.location && loc.location.lng) || undefined;
      const addr = (loc && loc.address) || (loc && loc.location && loc.location.address) || c.address || '';

      const debtFromDebtors = getRemainingDebtForCustomer(c._id);
      const finalBalance = debtFromDebtors > 0 ? debtFromDebtors : (c.totalCredit || 0);

      masterCustomers.push({
        _id: new mongoose.Types.ObjectId(c._id),
        name: c.name.trim(),
        phoneNumber: normalizePhone(c.phone) || '',
        phoneSecondary: '',
        address: addr,
        latitude: lat,
        longitude: lng,
        customerType: 'supermarket',
        balance: finalBalance,
        creditLimit: 0,
        notes: c.notes || '',
        isActive: true,
        createdAt: new Date(c.createdAt || Date.now()),
        updatedAt: new Date(c.updatedAt || Date.now()),
      });
    } else {
      const primary = list.find((c) => c.phone) || list[0];
      const secondaries = list.filter((c) => c._id !== primary._id);

      secondaries.forEach((sec) => {
        idRedirect[sec._id] = primary._id;
      });

      const loc =
        custLocMap.get(primary._id) || (secondaries[0] && custLocMap.get(secondaries[0]._id));
      const lat = (loc && loc.lat) || (loc && loc.location && loc.location.lat) || undefined;
      const lng = (loc && loc.lng) || (loc && loc.location && loc.location.lng) || undefined;
      const addr = (loc && loc.address) || (loc && loc.location && loc.location.address) || primary.address || '';

      const secondaryPhones = secondaries
        .map((s) => normalizePhone(s.phone))
        .filter((p) => p && p !== normalizePhone(primary.phone));
      const secondaryPhoneStr = secondaryPhones[0] || '';

      let totalBalance = 0;
      for (const item of list) {
        const dRem = getRemainingDebtForCustomer(item._id);
        totalBalance += dRem > 0 ? dRem : (item.totalCredit || 0);
      }

      const combinedNotes = [
        primary.notes,
        ...secondaries.map((s) => s.notes).filter(Boolean),
        secondaryPhoneStr ? `شماره دوم: ${secondaryPhoneStr}` : null,
      ]
        .filter(Boolean)
        .join(' | ');

      masterCustomers.push({
        _id: new mongoose.Types.ObjectId(primary._id),
        name: primary.name.trim(),
        phoneNumber: normalizePhone(primary.phone) || secondaryPhoneStr || '',
        phoneSecondary: secondaryPhoneStr,
        address: addr,
        latitude: lat,
        longitude: lng,
        customerType: 'supermarket',
        balance: totalBalance,
        creditLimit: 0,
        notes: combinedNotes,
        isActive: true,
        createdAt: new Date(primary.createdAt || Date.now()),
        updatedAt: new Date(primary.updatedAt || Date.now()),
      });
    }
  }

  // Jahani merge
  if (jahani1 && jahani2) {
    idRedirect[JAHANI_BALA] = JAHANI_7TIR;
    const loc = custLocMap.get(JAHANI_7TIR) || custLocMap.get(JAHANI_BALA);
    const jahaniDebts =
      getRemainingDebtForCustomer(JAHANI_7TIR) + getRemainingDebtForCustomer(JAHANI_BALA);
    const jahaniBalance =
      jahaniDebts > 0
        ? jahaniDebts
        : (jahani1.totalCredit || 0) + (jahani2.totalCredit || 0);

    masterCustomers.push({
      _id: new mongoose.Types.ObjectId(JAHANI_7TIR),
      name: 'جهانی (هفت تیر / بالا)',
      phoneNumber: '09155751391',
      phoneSecondary: '',
      address: (loc && loc.address) || (loc && loc.location && loc.location.address) || '',
      latitude: (loc && loc.lat) || undefined,
      longitude: (loc && loc.lng) || undefined,
      customerType: 'supermarket',
      balance: jahaniBalance,
      creditLimit: 0,
      notes: 'ادغام مشتریان شعب هفت تیر و بالا',
      isActive: true,
      createdAt: new Date(jahani1.createdAt || Date.now()),
      updatedAt: new Date(jahani1.updatedAt || Date.now()),
    });
  }

  await db.collection('customers').insertMany(masterCustomers);
  console.log(`Successfully migrated ${masterCustomers.length} master customers!`);

  const masterCustById = new Map();
  const masterCustByName = new Map();
  masterCustomers.forEach((c) => {
    masterCustById.set(c._id.toString(), c);
    masterCustByName.set(normalizeStr(c.name), c);
  });

  // 5. Migrate Customer Transactions (Debts & Payments)
  console.log('\n--- 3. MIGRATING CUSTOMER TRANSACTIONS (DEBTS & PAYMENTS) ---');
  const transactionsToInsert = [];
  const saleInvoiceById = new Map(saleInvoicesData.map((inv) => [inv._id, inv]));
  // Debtors whose payments become customer ledger transactions; the rest (walk-in credit) keep them on the invoice.
  const debtorsWithLedger = new Set();

  for (const debtor of dbBackup.debtors) {
    let effectiveCustId = debtor.customerId;
    if (effectiveCustId && idRedirect[effectiveCustId]) {
      effectiveCustId = idRedirect[effectiveCustId];
    }
    if (!effectiveCustId) {
      const matched = masterCustByName.get(normalizeStr(debtor.name));
      if (matched) effectiveCustId = matched._id.toString();
    }
    if (!effectiveCustId) continue;

    const custDoc = masterCustById.get(effectiveCustId);
    if (!custDoc) continue;
    debtorsWithLedger.add(debtor._id);

    const debtDate = new Date(debtor.createdAt || debtor.dueDate || Date.now());
    const linkedInvoice = debtor.saleInvoiceId ? saleInvoiceById.get(debtor.saleInvoiceId) : null;
    const invoiceRef = linkedInvoice
      ? { invoiceId: new mongoose.Types.ObjectId(linkedInvoice._id), invoiceNumber: linkedInvoice.invoiceNumber }
      : {};

    // 1. Debt Transaction (فاکتور نسیه)
    transactionsToInsert.push({
      customer: new mongoose.Types.ObjectId(effectiveCustId),
      type: 'debt',
      amount: debtor.amount || 0,
      balanceAfter: custDoc.balance,
      paymentMethod: 'cash',
      description: debtor.description || `بدهی فاکتور نسیه ${debtor.name}`,
      ...invoiceRef,
      allocations: [],
      recordedByName: 'مدیر سیستم',
      date: debtDate,
      createdAt: debtDate,
      updatedAt: debtDate,
    });

    // 2. Payments (تسویه‌ها و پرداخت‌های انجام‌شده)
    if (debtor.payments && debtor.payments.length > 0) {
      for (const p of debtor.payments) {
        let pMethod = 'cash';
        if (p.method === 'card_to_card' || p.method === 'card') pMethod = 'transfer';
        else if (p.method === 'pos') pMethod = 'pos';
        else if (p.method === 'cheque') pMethod = 'cheque';

        const pDate = new Date(p.date || debtor.updatedAt || Date.now());

        transactionsToInsert.push({
          customer: new mongoose.Types.ObjectId(effectiveCustId),
          type: 'payment',
          amount: p.amount,
          balanceAfter: custDoc.balance,
          paymentMethod: pMethod,
          description: p.note || `پرداخت بدهی (${debtor.description || 'تسویه نسیه'})`,
          ...invoiceRef,
          allocations: linkedInvoice ? [{ ...invoiceRef, amount: p.amount }] : [],
          recordedByName: 'مدیر سیستم',
          date: pDate,
          createdAt: pDate,
          updatedAt: pDate,
        });
      }
    }
  }

  if (transactionsToInsert.length > 0) {
    await db.collection('customertransactions').insertMany(transactionsToInsert);
    console.log(`Successfully migrated ${transactionsToInsert.length} customer debt & payment transactions!`);
  }

  // 6. Migrate Sale Invoices (740 Invoices)
  console.log(`\n--- 4. MIGRATING ${saleInvoicesData.length} SALE INVOICES ---`);
  const invoicesToInsert = [];
  let linkedSalesCount = 0;

  for (const rawInv of saleInvoicesData) {
    let finalCustId = rawInv.customerId;
    if (finalCustId && idRedirect[finalCustId]) {
      finalCustId = idRedirect[finalCustId];
    }

    const debtor = debtorsByInvoiceId.get(rawInv._id);
    if (!finalCustId && debtor && debtor.customerId) {
      let dCustId = debtor.customerId;
      if (idRedirect[dCustId]) dCustId = idRedirect[dCustId];
      finalCustId = dCustId;
    }

    const rawName = rawInv.customerName || (debtor && debtor.name) || '';
    if (!finalCustId && rawName && rawName !== 'مشتری تکی' && rawName !== 'مشتری نسیه') {
      const match = masterCustByName.get(normalizeStr(rawName));
      if (match) finalCustId = match._id.toString();
    }

    let customerName = 'مشتری تکی / حضوری';
    let customerPhone = '';
    let saleType = rawInv.priceTier || 'retail';

    if (finalCustId && masterCustById.has(finalCustId)) {
      const cust = masterCustById.get(finalCustId);
      customerName = cust.name;
      customerPhone = cust.phoneNumber || '';
      linkedSalesCount++;
      if (saleType === 'retail') saleType = 'supermarket';
    } else if (rawInv.customerName && rawInv.customerName !== 'مشتری تکی') {
      customerName = rawInv.customerName;
    }

    let paymentMethod = 'pos';
    if (rawInv.paymentMethod === 'cash') paymentMethod = 'cash';
    else if (rawInv.paymentMethod === 'credit' || !rawInv.isPaid) paymentMethod = 'credit';
    else if (rawInv.paymentMethod === 'transfer' || rawInv.paymentMethod === 'card_to_card')
      paymentMethod = 'transfer';
    else if (rawInv.paymentMethod === 'cheque' || rawInv.creditIsCheck) paymentMethod = 'cheque';
    else if (rawInv.payment && rawInv.payment.cash > 0 && rawInv.payment.card > 0) {
      paymentMethod = 'split';
    }

    const items = (rawInv.items || []).map((it) => {
      const prod = productMapById.get(it.productId);
      const kgRatio = (prod && prod.unitRatio) || it.kgPerPackage || 1;
      const unit = (prod && prod.unit) || it.unit || 'بسته';
      const qtyPackages = it.qtyPackages || it.qtyInput || Math.round((it.quantity || 1) / kgRatio) || 1;
      const weightKg = it.qtyKg || Math.round(qtyPackages * kgRatio);
      const unitPrice = it.unitPricePerPackage || it.unitPrice || (prod ? prod.sellPrice : 0);
      const totalPrice = it.totalPrice || unitPrice * qtyPackages;

      return {
        productId: it.productId,
        productName: it.productName || (prod ? prod.name : 'کالای فروشگاه'),
        quantity: qtyPackages,
        unit,
        secondaryQuantity: weightKg,
        secondaryUnit: 'کیلوگرم',
        unitPrice,
        totalPrice,
        weightKg,
      };
    });

    const totalAmount = rawInv.totalAmount || items.reduce((s, i) => s + i.totalPrice, 0);
    const discount = rawInv.discount || 0;
    const finalAmount = Math.max(0, totalAmount - discount);
    const totalWeightKg = rawInv.totalKg || items.reduce((s, i) => s + (i.weightKg || 0), 0);

    // The debtor record is the source of truth for the credit portion and later payments.
    // Exception: walk-in invoices typed in later for an earlier date got an automatic debtor that was
    // bulk-settled at entry time; the invoice itself is paid, so they are not real credit sales.
    const walkInDebtor = debtor && !debtorsWithLedger.has(debtor._id);
    const backEntered =
      String(rawInv.createdAt || '').slice(0, 10) > String(rawInv.date || rawInv.createdAt || '').slice(0, 10);
    const creditDebtor = walkInDebtor && backEntered && rawInv.isPaid ? null : debtor;
    let creditAmount;
    let remainingDebt;
    if (creditDebtor) {
      creditAmount = debtor.amount || 0;
      remainingDebt = Math.max(0, creditAmount - (debtor.paidAmount || 0));
    } else {
      creditAmount = rawInv.isPaid ? 0 : Math.max(0, finalAmount - ((rawInv.payment && rawInv.payment.card) || 0));
      remainingDebt = creditAmount;
    }
    const paidAmount = Math.max(0, finalAmount - remainingDebt);
    const legacyPayments =
      creditDebtor && walkInDebtor
        ? (debtor.payments || []).map((p) => ({
            date: new Date(p.date || debtor.updatedAt || Date.now()),
            amount: p.amount || 0,
            method: p.method === 'pos' ? 'pos' : p.method === 'cash' ? 'cash' : p.method === 'cheque' ? 'cheque' : 'transfer',
          }))
        : [];

    const invDoc = {
      legacyPayments,
      _id: new mongoose.Types.ObjectId(rawInv._id),
      invoiceNumber: rawInv.invoiceNumber,
      type: 'sale',
      saleType,
      customerId: finalCustId ? new mongoose.Types.ObjectId(finalCustId) : undefined,
      customerName,
      customerPhone,
      invoiceDate: new Date(rawInv.date || rawInv.createdAt || Date.now()),
      items,
      totalAmount,
      discount,
      finalAmount,
      totalWeightKg,
      paymentMethod,
      splitDetails: {
        pos: (rawInv.payment && rawInv.payment.card) || (paymentMethod === 'pos' ? paidAmount : 0),
        cash: (rawInv.payment && rawInv.payment.cash) || (paymentMethod === 'cash' ? paidAmount : 0),
        transfer: paymentMethod === 'transfer' ? paidAmount : 0,
        cheque: paymentMethod === 'cheque' ? paidAmount : 0,
        credit: remainingDebt,
      },
      isPaid: remainingDebt === 0,
      paidAmount,
      remainingDebt,
      creditAmount,
      customerPrevBalance: 0,
      customerNewBalance: remainingDebt,
      notes: rawInv.notes || rawInv.shippingNotes || '',
      createdByName: 'مدیر سیستم',
      createdAt: new Date(rawInv.createdAt || Date.now()),
      updatedAt: new Date(rawInv.updatedAt || Date.now()),
    };

    invoicesToInsert.push(invDoc);
  }

  // 7. Migrate Purchase Invoices (35 Invoices)
  console.log(`\n--- 5. MIGRATING ${purchaseInvoicesData.length} PURCHASE INVOICES ---`);
  for (const rawPur of purchaseInvoicesData) {
    const items = (rawPur.items || []).map((it) => {
      const prod = productMapById.get(it.productId);
      const kgRatio = (prod && prod.unitRatio) || it.kgPerPackage || 1;
      const unit = (prod && prod.unit) || it.unit || 'بسته';
      const qtyPackages = it.qtyPackages || it.qtyInput || Math.round((it.quantity || 1) / kgRatio) || 1;
      const weightKg = it.qtyKg || Math.round(qtyPackages * kgRatio);
      const unitPrice = it.unitPricePerPackage || it.unitPrice || (prod ? prod.buyPrice : 0);
      const totalPrice = it.totalPrice || unitPrice * qtyPackages;

      return {
        productId: it.productId,
        productName: it.productName || (prod ? prod.name : 'کالای خریداری شده'),
        quantity: qtyPackages,
        unit,
        secondaryQuantity: weightKg,
        secondaryUnit: 'کیلوگرم',
        unitPrice,
        totalPrice,
        weightKg,
      };
    });

    const totalAmount = rawPur.totalAmount || items.reduce((s, i) => s + i.totalPrice, 0);
    const totalWeightKg = rawPur.totalKg || items.reduce((s, i) => s + (i.weightKg || 0), 0);

    const purDoc = {
      _id: new mongoose.Types.ObjectId(rawPur._id),
      invoiceNumber: rawPur.invoiceNumber,
      type: 'purchase',
      saleType: 'wholesale',
      customerName: rawPur.supplier || 'تامین‌کننده شرکت',
      customerPhone: '',
      invoiceDate: new Date(rawPur.date || rawPur.createdAt || Date.now()),
      items,
      totalAmount,
      discount: 0,
      finalAmount: totalAmount,
      totalWeightKg,
      paymentMethod: rawPur.paidNow ? 'transfer' : 'credit',
      splitDetails: {
        pos: 0,
        cash: 0,
        transfer: rawPur.paidNow ? totalAmount : 0,
        cheque: 0,
        credit: rawPur.paidNow ? 0 : totalAmount,
      },
      isPaid: rawPur.paidNow || false,
      paidAmount: rawPur.paidNow ? totalAmount : 0,
      remainingDebt: rawPur.paidNow ? 0 : totalAmount,
      customerPrevBalance: 0,
      customerNewBalance: 0,
      notes: `فاکتور خرید از ${rawPur.supplier || 'شرکت'}`,
      createdByName: 'مدیر سیستم',
      createdAt: new Date(rawPur.createdAt || Date.now()),
      updatedAt: new Date(rawPur.updatedAt || Date.now()),
    };

    invoicesToInsert.push(purDoc);
  }

  await db.collection('invoices').insertMany(invoicesToInsert);
  console.log(`Successfully migrated ${invoicesToInsert.length} total invoices:`);
  console.log(`  - Sale Invoices: ${saleInvoicesData.length} (Linked to customers: ${linkedSalesCount})`);
  console.log(`  - Purchase Invoices: ${purchaseInvoicesData.length}`);

  // 8. Migrate Expense Categories & Expenses
  console.log('\n--- 6. MIGRATING EXPENSES & MANAGER WITHDRAWALS ---');
  const catDocs = (dbBackup.expenseCategories || []).map((cat) => ({
    _id: new mongoose.Types.ObjectId(cat._id),
    name: cat.name.trim(),
    type: cat.type || 'other',
    icon: cat.icon || 'tag',
    isBuiltin: cat.isBuiltin !== undefined ? cat.isBuiltin : true,
    active: cat.active !== undefined ? cat.active : true,
    sortOrder: cat.sortOrder || 0,
    createdAt: new Date(cat.createdAt || Date.now()),
    updatedAt: new Date(cat.updatedAt || Date.now()),
  }));

  if (catDocs.length > 0) {
    await db.collection('expensecategories').insertMany(catDocs);
    console.log(`Successfully migrated ${catDocs.length} expense categories!`);
  }

  const expensesToInsert = [];
  let withdrawalsCount = 0;
  let withdrawalsTotal = 0;
  let storeExpensesCount = 0;
  let storeExpensesTotal = 0;

  for (const exp of expensesData) {
    const isWithdrawal =
      exp.type === 'withdrawal' || (exp.description && exp.description.includes('برداشت'));

    let categoryName = 'سایر هزینه‌ها';
    if (isWithdrawal) {
      categoryName = 'برداشت شخصی مدیر';
      withdrawalsCount++;
      withdrawalsTotal += exp.amount || 0;
    } else {
      storeExpensesCount++;
      storeExpensesTotal += exp.amount || 0;
      switch (exp.type) {
        case 'shipping':
          categoryName = 'ارسال بار و کرایه';
          break;
        case 'salary':
          categoryName = 'حقوق و دستمزد';
          break;
        case 'utilities':
          categoryName = 'قبوض و نرم‌افزار';
          break;
        case 'rent':
          categoryName = 'اجاره محل';
          break;
        default:
          categoryName = 'سایر هزینه‌های فروشگاه';
      }
    }

    expensesToInsert.push({
      _id: new mongoose.Types.ObjectId(exp._id),
      type: isWithdrawal ? 'withdrawal' : exp.type || 'other',
      categoryId: exp.categoryId || undefined,
      categoryName,
      amount: exp.amount || 0,
      description: exp.description || '',
      date: new Date(exp.date || exp.createdAt || Date.now()),
      isPersonalWithdrawal: isWithdrawal,
      paymentMethod: 'card',
      recordedByName: 'مدیر سیستم',
      createdAt: new Date(exp.createdAt || Date.now()),
      updatedAt: new Date(exp.updatedAt || Date.now()),
    });
  }

  await db.collection('expenses').insertMany(expensesToInsert);
  console.log(`Successfully migrated ${expensesToInsert.length} expenses:`);
  console.log(`  - Manager Personal Withdrawals: ${withdrawalsCount} records, Total: ${withdrawalsTotal.toLocaleString('fa-IR')} تومان`);
  console.log(`  - Store Operating Expenses: ${storeExpensesCount} records, Total: ${storeExpensesTotal.toLocaleString('fa-IR')} تومان`);

  // 9. Migrate History (Company Payments, Supplier Debts, Cash Transactions, Shop Notes)
  console.log('\n--- 7. MIGRATING HISTORY & COMPANY PAYMENTS ---');
  if (historyData.companyPayments && historyData.companyPayments.length > 0) {
    const cpDocs = historyData.companyPayments.map((cp) => ({
      _id: new mongoose.Types.ObjectId(cp._id),
      supplier: cp.supplier || 'شرکت',
      amount: cp.amount,
      method: cp.method || 'card',
      date: new Date(cp.date || cp.createdAt || Date.now()),
      notes: cp.notes || '',
      createdBy: 'مدیر سیستم',
      createdAt: new Date(cp.createdAt || Date.now()),
      updatedAt: new Date(cp.updatedAt || Date.now()),
    }));
    await db.collection('companypayments').insertMany(cpDocs);
    console.log(`Successfully migrated ${cpDocs.length} company payments!`);
  }

  if (historyData.supplierDebts && historyData.supplierDebts.length > 0) {
    const sdDocs = historyData.supplierDebts.map((sd) => ({
      _id: new mongoose.Types.ObjectId(sd._id),
      supplier: sd.supplier || 'شرکت',
      purchaseInvoiceId: sd.purchaseInvoiceId || '',
      amount: sd.amount || 0,
      paidAmount: sd.paidAmount || 0,
      date: new Date(sd.date || sd.createdAt || Date.now()),
      notes: sd.notes || '',
      isSettled: sd.isSettled || false,
      createdAt: new Date(sd.createdAt || Date.now()),
      updatedAt: new Date(sd.updatedAt || Date.now()),
    }));
    await db.collection('supplierdebts').insertMany(sdDocs);
    console.log(`Successfully migrated ${sdDocs.length} supplier debts!`);
  }

  if (historyData.cashTransactions && historyData.cashTransactions.length > 0) {
    const ctDocs = historyData.cashTransactions.map((ct) => ({
      _id: new mongoose.Types.ObjectId(ct._id),
      type: ct.type || 'sale_card',
      amount: ct.amount || 0,
      direction: ct.direction || 'in',
      description: ct.description || '',
      referenceId: ct.referenceId || '',
      referenceModel: ct.referenceModel || '',
      date: new Date(ct.date || ct.createdAt || Date.now()),
      createdAt: new Date(ct.createdAt || Date.now()),
      updatedAt: new Date(ct.updatedAt || Date.now()),
    }));
    await db.collection('cashtransactions').insertMany(ctDocs);
    console.log(`Successfully migrated ${ctDocs.length} cash/POS transactions!`);
  }

  if (historyData.shopNotes && historyData.shopNotes.length > 0) {
    const snDocs = historyData.shopNotes.map((sn) => ({
      _id: new mongoose.Types.ObjectId(sn._id),
      text: sn.text || '',
      done: sn.done || false,
      color: sn.color || 'yellow',
      sortOrder: sn.sortOrder || 0,
      createdBy: 'مدیر سیستم',
      createdAt: new Date(sn.createdAt || Date.now()),
      updatedAt: new Date(sn.updatedAt || Date.now()),
    }));
    await db.collection('shopnotes').insertMany(snDocs);
    console.log(`Successfully migrated ${snDocs.length} shop notes!`);
  }

  console.log('\n--- 8. SUPPLIER ACCOUNT (company payments → purchase invoices) ---');
  await require('./import-supplier-payments').importSupplierPayments(db);

  console.log('\n--- 9. SUB-CATEGORIES, PRODUCT SUPPLIERS, SHOP SETTINGS ---');
  await require('./import-extras').importExtras(db);

  console.log('\n--- 10. KEEPING EDITS MADE IN THE NEW APP ---');
  const kept = await restore(db, snap, L);
  if (check.newNotes.length) {
    await db.collection('shopnotes').insertMany(check.newNotes);
    console.log(`Shop notes added in the new app: ${check.newNotes.length}`);
  }
  console.log(`Product catalog fields kept for ${kept.catalog} products`);
  if (kept.prices.length) console.log(`Prices set in the new app kept (retail / supermarket / wholesale):\n  ${kept.prices.join('\n  ')}`);
  if (kept.customers.length) console.log(`Customer edits kept:\n  ${kept.customers.join('\n  ')}`);

  console.log('\n======================================================');
  console.log('✅ ALL STATIC DATA SUCCESSFULLY MIGRATED INTO BACKEND!');
  console.log('======================================================');

  await mongoose.disconnect();
  process.exit(0);
}

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
