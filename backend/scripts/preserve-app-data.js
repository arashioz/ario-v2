/**
 * The migration rebuilds the business collections from the old app's backup. This module makes that safe
 * to re-run after the new app has been in use:
 * - `guard` refuses to run while records exist that only the new app has (they would be wiped), except
 *   customer payments the old app also recorded (same customer, same amount, within 3 days).
 * - `snapshot` / `restore` carry over what is edited in the new app and absent from the old one:
 *   product catalog fields, prices set through pricing, and customer profile edits newer than the backup.
 *
 * Set ARIO_FORCE=1 to rebuild anyway (a full database dump is still taken first).
 */
const MIGRATION_USER = 'سیستم مایگریشن';
const DAY = 24 * 3600 * 1000;

const PRODUCT_FIELDS = ['category', 'subcategory', 'supplierName', 'barcode', 'minStockAlert', 'isActive', 'imageUrl'];
const PRICE_FIELDS = ['sellPrice', 'priceRetail', 'priceSupermarket', 'priceWholesale', 'priceSetAt', 'priceHistory'];
const CUSTOMER_FIELDS = ['phoneNumber', 'phoneSecondary', 'address', 'latitude', 'longitude', 'customerType', 'creditLimit', 'notes', 'isActive'];

const ids = (list) => new Set(list.map((x) => String(x._id)));

async function guard(db, L) {
  const problems = [];
  const col = (n) => db.collection(n);

  const legacyInvoices = new Set([...ids(L.saleInvoices), ...ids(L.purchaseInvoices)]);
  const newInvoices = (await col('invoices').find({}, { projection: { invoiceNumber: 1 } }).toArray())
    .filter((i) => !legacyInvoices.has(String(i._id)));
  if (newInvoices.length) problems.push(`${newInvoices.length} invoice(s) only in the new app: ${newInvoices.map((i) => i.invoiceNumber).join(', ')}`);

  const proformas = await col('proformas').countDocuments({ status: 'pending' });
  if (proformas) problems.push(`${proformas} pending pro-forma(s)`);

  const legacyCustomers = ids(L.customers);
  const newCustomers = (await col('customers').find({}, { projection: { name: 1 } }).toArray())
    .filter((c) => !legacyCustomers.has(String(c._id)));
  if (newCustomers.length) problems.push(`${newCustomers.length} customer(s) only in the new app: ${newCustomers.map((c) => c.name).join(', ')}`);

  const legacyExpenses = ids(L.expenses);
  const newExpenses = (await col('expenses').find({}, { projection: { description: 1 } }).toArray())
    .filter((e) => !legacyExpenses.has(String(e._id)));
  if (newExpenses.length) problems.push(`${newExpenses.length} expense(s) only in the new app`);

  const oldPayments = [];
  for (const d of L.debtors) for (const p of d.payments || []) oldPayments.push({ customerId: String(d.customerId || ''), amount: p.amount, date: new Date(p.date || d.updatedAt) });
  const appTx = await col('customertransactions').find({ recordedByName: { $ne: 'مدیر سیستم' } }).toArray();
  const duplicates = [];
  for (const t of appTx) {
    const dup = t.type === 'payment' && oldPayments.some((p) =>
      p.customerId === String(t.customer) && Math.abs(p.amount - t.amount) < 1 && Math.abs(p.date - new Date(t.date)) < 3 * DAY);
    if (dup) duplicates.push(t);
    else problems.push(`customer ${t.type} of ${t.amount} recorded by ${t.recordedByName} on ${new Date(t.date).toISOString().slice(0, 10)} is not in the backup`);
  }

  const manualSupplierPayments = await col('supplierpayments').countDocuments({ legacyId: { $exists: false } });
  if (manualSupplierPayments) problems.push(`${manualSupplierPayments} supplier payment(s) recorded in the new app`);

  const legacyNotes = ids(L.shopNotes);
  const newNotes = (await col('shopnotes').find({}).toArray()).filter((n) => !legacyNotes.has(String(n._id)));

  return { problems, duplicates, newNotes };
}

async function snapshot(db) {
  const products = await db.collection('products').find({}).toArray();
  const customers = await db.collection('customers').find({}).toArray();
  return { products, customers };
}

/** True when prices were set in the new app (pricing sheet / manual edit), not just by the migration. */
const pricedInApp = (p) => !!p.priceSetAt || (p.priceHistory || []).some((h) => h.changedByName !== MIGRATION_USER);

async function restore(db, snap, L) {
  const report = { catalog: 0, prices: [], customers: [], extraNotes: 0 };
  const products = db.collection('products');
  for (const old of snap.products) {
    const set = {};
    for (const f of PRODUCT_FIELDS) if (old[f] !== undefined && old[f] !== '') set[f] = old[f];
    if (pricedInApp(old)) {
      for (const f of PRICE_FIELDS) if (old[f] !== undefined) set[f] = old[f];
      report.prices.push(`${old.name}: ${old.priceRetail?.toLocaleString('en')} / ${old.priceSupermarket?.toLocaleString('en')} / ${old.priceWholesale?.toLocaleString('en')}`);
    }
    const r = await products.updateOne({ _id: old._id }, { $set: set });
    if (r.matchedCount) report.catalog++;
  }

  const legacyById = new Map(L.customers.map((c) => [String(c._id), c]));
  const customers = db.collection('customers');
  for (const old of snap.customers) {
    const current = await customers.findOne({ _id: old._id });
    if (!current) continue;
    const backupUpdated = new Date(legacyById.get(String(old._id))?.updatedAt || 0);
    if (!(new Date(old.updatedAt) > backupUpdated)) continue;
    const set = {};
    for (const f of CUSTOMER_FIELDS) {
      const v = old[f];
      if (v === undefined || v === null || v === '') continue;
      if (JSON.stringify(v) !== JSON.stringify(current[f])) set[f] = v;
    }
    if (Object.keys(set).length) {
      await customers.updateOne({ _id: old._id }, { $set: set });
      report.customers.push(`${old.name}: ${Object.keys(set).join(', ')}`);
    }
  }
  return report;
}

module.exports = { guard, snapshot, restore };
