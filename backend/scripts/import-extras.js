/**
 * Brings over the rest of the old Ario data that the first migration left out:
 * - product sub-categories (the old app's categories: نایلونی، کارتنی شکسته، سلفونی، …)
 * - the default supplier of every product (all goods came from the parent company)
 * - shop settings: name, phone, bank cards, POS weight thresholds for supermarket / wholesale prices
 * - the cash and card balances the old app showed at export time (reference only)
 *
 * Usage: node scripts/import-extras.js   (idempotent; never overwrites values edited in the app)
 */
const mongoose = require('mongoose');
const { loadLegacy } = require('./legacy-source');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27019/ario_db';
const PARENT_COMPANY = 'شرکت قند بلالی';

async function importExtras(db) {
  const data = loadLegacy();

  const oldCategory = new Map((data.categories || []).map((c) => [String(c._id), c.name]));
  let subcats = 0;
  let suppliers = 0;
  for (const p of data.products || []) {
    const sub = oldCategory.get(String(p.categoryId));
    const _id = new mongoose.Types.ObjectId(String(p._id));
    if (sub) {
      const r = await db.collection('products').updateOne(
        { _id, $or: [{ subcategory: { $exists: false } }, { subcategory: '' }] },
        { $set: { subcategory: sub } },
      );
      subcats += r.modifiedCount;
    }
  }
  const r = await db.collection('products').updateMany(
    { $or: [{ supplierName: { $exists: false } }, { supplierName: '' }] },
    { $set: { supplierName: PARENT_COMPANY } },
  );
  suppliers += r.modifiedCount;
  console.log(`Products: ${subcats} sub-categories set, ${suppliers} linked to ${PARENT_COMPANY}`);

  const old = (data.settings || [])[0];
  if (old) {
    const existing = await db.collection('appsettings').findOne({});
    const bankCards = (old.bankCards || []).map((c) => ({
      label: c.label || '',
      cardNumber: String(c.cardNumber || '').replace(/\D/g, ''),
      iban: '',
      accountHolder: c.accountHolder || '',
      isDefault: !!c.isDefault,
    }));
    const legacy = {
      cashBalance: old.cashBalance || 0,
      cardBalance: old.cardBalance || 0,
      openingDate: old.openingDate || null,
      exportedAt: data.generatedAt || null,
    };
    if (!existing) {
      await db.collection('appsettings').insertOne({
        shopName: old.shopName || 'فروشگاه آریو',
        shopPhone: old.catalogPhone || '',
        shopAddress: '',
        invoiceFooter: '',
        supermarketMinKg: old.catalogSupermarketMinKg || 200,
        wholesaleMinKg: old.catalogWholesaleMinKg || 1500,
        autoSaleType: true,
        proformaForBulk: true,
        salesView: { layout: 'cards', groupByDay: true, showWeight: true, showPayment: true, showItems: false, showSaleType: true },
        bankCards,
        legacy,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`Settings: created from old app (supermarket ≥ ${old.catalogSupermarketMinKg} kg, wholesale ≥ ${old.catalogWholesaleMinKg} kg)`);
    } else {
      const set = { legacy };
      if (!existing.bankCards || !existing.bankCards.length) set.bankCards = bankCards;
      if (!existing.shopPhone && old.catalogPhone) set.shopPhone = old.catalogPhone;
      if (!existing.shopName || existing.shopName === 'فروشگاه آریو') set.shopName = old.shopName;
      await db.collection('appsettings').updateOne({ _id: existing._id }, { $set: set });
      console.log('Settings: old balances and missing fields filled in');
    }
  }

  await importCheques(db, data);
}

// Sample cheques the cheques module used to create on an empty collection.
const DEMO_SAYAD = ['2981746201948271', '1902837465910283', '8765432109876543'];
const CHEQUE_STATUS = { collected: 'passed', bounced: 'bounced', endorsed: 'endorsed' };

/** The old app's cheque reminders become received cheques (it recorded neither serial nor bank). */
async function importCheques(db, data) {
  const cheques = db.collection('cheques');
  const demo = await cheques.deleteMany({ sayadNumber: { $in: DEMO_SAYAD }, legacyId: { $exists: false } });
  if (demo.deletedCount) console.log(`Cheques: ${demo.deletedCount} sample cheques removed`);

  const norm = (s) => String(s || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim();
  let n = 0;
  for (const c of data.checkReminders || []) {
    let customer = c.customerId ? await db.collection('customers').findOne({ _id: new mongoose.Types.ObjectId(String(c.customerId)) }) : null;
    if (!customer && c.payerName) {
      const all = await db.collection('customers').find({}, { projection: { name: 1, phoneNumber: 1 } }).toArray();
      customer = all.find((x) => norm(x.name) === norm(c.payerName)) || null;
    }
    const status = CHEQUE_STATUS[c.status] || 'pending';
    const doc = {
      type: 'received',
      chequeNumber: 'ثبت‌نشده',
      sayadNumber: '',
      bankName: 'نامشخص',
      branchName: '',
      amount: c.amount || 0,
      issueDate: new Date(c.createdAt),
      dueDate: new Date(c.dueDate || c.followUpDate || c.createdAt),
      customerId: customer ? customer._id : undefined,
      partyName: customer ? customer.name : c.payerName || 'مشتری',
      partyPhone: (customer && customer.phoneNumber) || '',
      drawerName: c.payerName || '',
      status,
      statusDate: status === 'pending' ? undefined : new Date(c.updatedAt),
      statusNotes: '',
      invoiceNumber: c.invoiceNumber || '',
      notes: [c.notes, 'منتقل‌شده از آریو قبلی'].filter(Boolean).join(' — '),
      recordedByName: 'مدیر سیستم',
      legacyId: String(c._id),
      createdAt: new Date(c.createdAt),
      updatedAt: new Date(c.updatedAt || c.createdAt),
    };
    await cheques.updateOne({ legacyId: doc.legacyId }, { $set: doc }, { upsert: true });
    n++;
  }
  if (n) console.log(`Cheques: ${n} received cheques from the old app`);
}

module.exports = { importExtras };

if (require.main === module) {
  mongoose
    .connect(MONGODB_URI)
    .then(() => importExtras(mongoose.connection.db))
    .then(() => mongoose.disconnect())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
