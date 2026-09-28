/**
 * Imports the old system's company payments into `supplierpayments` and prepares purchase
 * invoices for the supplier account:
 * - supplier names "شرکت" / "شرکت بنام …" / "شرکت قند بلالی" become one account (شرکت قند بلالی)
 * - the destination ("بنام محسن بلالی", IBAN, …) is kept separately
 * - each purchase gets `creditAmount` (the part owed to the supplier) from the old supplier debts
 *
 * The backend allocates payments to invoices (oldest first) on start-up and on every change.
 *
 * Usage: node scripts/import-supplier-payments.js   (idempotent)
 */
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27019/ario_db';
const PARENT_COMPANY = 'شرکت قند بلالی';

const clean = (s) =>
  (s || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim();

const latinDigits = (s) => s.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

/** Keep in sync with src/suppliers/supplier-names.ts */
function canonicalSupplier(name) {
  const s = clean(name);
  if (!s || s === 'شرکت' || s.startsWith('شرکت ') || s.includes('بلالی')) return PARENT_COMPANY;
  return s;
}

/** "شرکت بنام محسن بلالی" → محسن بلالی; "شرکت پانیدبیهق قند بلالی IR۱۹…" → پانیدبیهق قند بلالی + IR19… */
function parseDestination(raw) {
  let s = clean(raw);
  const iban = s.match(/IR\s*[0-9۰-۹٠-٩\s]{10,}/i);
  const card = s.match(/(?:[0-9۰-۹]{4}[\s-]?){3}[0-9۰-۹]{4}/);
  const account = iban ? latinDigits(iban[0]).replace(/\s/g, '').toUpperCase() : card ? latinDigits(card[0]).replace(/[\s-]/g, '') : '';
  if (iban) s = s.replace(iban[0], '');
  else if (card) s = s.replace(card[0], '');
  s = clean(s)
    .replace(/^شرکت\s*/, '')
    .replace(/^(بنام|به نام)\s*/, '')
    .trim();
  return { destination: s, destinationAccount: account };
}

async function importSupplierPayments(db) {
  const debts = await db.collection('supplierdebts').find().toArray();
  const creditByInvoice = new Map(debts.filter((d) => d.purchaseInvoiceId).map((d) => [String(d.purchaseInvoiceId), d.amount || 0]));

  const purchases = await db.collection('invoices').find({ type: 'purchase' }).toArray();
  let credited = 0;
  for (const inv of purchases) {
    const credit = creditByInvoice.has(String(inv._id))
      ? Math.min(inv.finalAmount || 0, creditByInvoice.get(String(inv._id)))
      : inv.paymentMethod === 'credit'
        ? inv.finalAmount || 0
        : inv.creditAmount || 0;
    if (credit > 0) credited += credit;
    await db.collection('invoices').updateOne(
      { _id: inv._id },
      { $set: { customerName: canonicalSupplier(inv.customerName), creditAmount: credit } },
    );
  }

  const old = await db.collection('companypayments').find().toArray();
  let imported = 0;
  for (const cp of old) {
    const { destination, destinationAccount } = parseDestination(cp.supplier);
    const res = await db.collection('supplierpayments').updateOne(
      { legacyId: String(cp._id) },
      {
        $set: {
          supplier: canonicalSupplier(cp.supplier),
          amount: cp.amount,
          date: new Date(cp.date || cp.createdAt),
          method: cp.method || 'card',
          destination,
          destinationAccount,
          rawSupplier: clean(cp.supplier),
          notes: cp.notes || '',
        },
        $setOnInsert: {
          legacyId: String(cp._id),
          allocations: [],
          createdByName: 'انتقال از سیستم قبلی',
          createdAt: new Date(cp.createdAt || Date.now()),
          updatedAt: new Date(cp.updatedAt || Date.now()),
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) imported++;
  }

  const total = old.reduce((s, p) => s + (p.amount || 0), 0);
  console.log(`Supplier payments: ${old.length} in old system (${imported} new), total ${total.toLocaleString('en-US')}`);
  console.log(`Purchase invoices: ${purchases.length}, owed to supplier ${credited.toLocaleString('en-US')}`);
  console.log(`Expected debt before allocation: ${(credited - total).toLocaleString('en-US')}`);
}

module.exports = { importSupplierPayments, canonicalSupplier, parseDestination };

if (require.main === module) {
  mongoose
    .connect(MONGODB_URI)
    .then(() => importSupplierPayments(mongoose.connection.db))
    .then(() => mongoose.disconnect())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
