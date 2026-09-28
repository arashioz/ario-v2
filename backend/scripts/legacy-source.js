/**
 * Reads the old Ario app's data in whichever form it was exported:
 * - `src/static/fullBackup.json` (or $ARIO_BACKUP): the full database dump, format "ario-full-backup/1",
 *   MongoDB Extended JSON — one array per collection
 * - otherwise the older per-section exports (database-backup-*.json, sale-invoices-*.json, …)
 *
 * Both are returned in the same shape, with ObjectIds as strings and dates as ISO strings.
 */
const fs = require('fs');
const path = require('path');

const STATIC_DIR = path.join(__dirname, '../src/static');
const FULL_BACKUP = process.env.ARIO_BACKUP || path.join(STATIC_DIR, 'fullBackup.json');

/** {$oid} → string, {$date} → ISO string, {$numberLong|Int|Double|Decimal} → number. */
function revive(v) {
  if (Array.isArray(v)) return v.map(revive);
  if (!v || typeof v !== 'object') return v;
  if ('$oid' in v) return String(v.$oid);
  if ('$date' in v) {
    const d = v.$date;
    const ms = typeof d === 'object' && d ? Number(d.$numberLong) : d;
    return new Date(ms).toISOString();
  }
  for (const k of ['$numberLong', '$numberInt', '$numberDouble', '$numberDecimal']) if (k in v) return Number(v[k]);
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = revive(x);
  return out;
}

function readFull(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!raw.collections || raw.meta?.app !== 'ario') throw new Error(`${file} is not an Ario full backup`);
  const c = revive(raw.collections);
  return {
    source: `${path.basename(file)} (${raw.meta.format}, ${raw.meta.createdAt})`,
    generatedAt: raw.meta.createdAt,
    products: c.products || [],
    categories: c.categories || [],
    customers: c.customers || [],
    debtors: c.debtors || [],
    expenseCategories: c.expensecategories || [],
    expenses: c.expenses || [],
    saleInvoices: c.saleinvoices || [],
    purchaseInvoices: c.purchaseinvoices || [],
    companyPayments: c.companypayments || [],
    supplierDebts: c.supplierdebts || [],
    cashTransactions: c.cashtransactions || [],
    shopNotes: c.shopnotes || [],
    checkReminders: c.checkreminders || [],
    settings: c.shopsettings || [],
  };
}

function readExports() {
  const read = (name) => JSON.parse(fs.readFileSync(path.join(STATIC_DIR, name), 'utf8'));
  const db = read('database-backup-2026-09-25.json');
  const history = read('history-2026-09-25.json').data;
  return {
    source: 'per-section exports of 2026-09-25',
    generatedAt: db.generatedAt,
    products: db.data.products || [],
    categories: db.data.categories || [],
    // This export carries the customers' map locations.
    customers: read('customers-with-invoices-2026-09-25.json').data,
    debtors: db.data.debtors || [],
    expenseCategories: db.data.expenseCategories || [],
    expenses: read('expenses-2026-09-25.json').data,
    saleInvoices: read('sale-invoices-2026-09-25.json').data,
    purchaseInvoices: read('purchase-invoices-2026-09-25.json').data,
    companyPayments: history.companyPayments || [],
    supplierDebts: history.supplierDebts || [],
    cashTransactions: history.cashTransactions || [],
    shopNotes: history.shopNotes || [],
    checkReminders: [],
    settings: db.data.settings || [],
  };
}

let cached = null;

function loadLegacy() {
  if (cached) return cached;
  const hasFull = fs.existsSync(FULL_BACKUP) && fs.statSync(FULL_BACKUP).size > 0;
  cached = hasFull ? readFull(FULL_BACKUP) : readExports();
  return cached;
}

module.exports = { loadLegacy, revive, STATIC_DIR };
