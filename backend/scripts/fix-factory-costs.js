/**
 * Copies the parent-company unit price onto factory sales that have no factoryUnitCost,
 * from the linked factory purchase line or the product buy price. Confirmed costs are left alone.
 *
 *   node scripts/fix-factory-costs.js --dry
 *   node scripts/fix-factory-costs.js
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

async function main() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  const invoices = mongoose.connection.db.collection('invoices');
  const products = new Map(
    (await mongoose.connection.db.collection('products').find({}).toArray()).map((p) => [String(p._id), p]),
  );
  const sales = await invoices.find({ type: 'sale', fulfillment: 'factory' }).toArray();
  const purchases = new Map(
    (await invoices.find({ type: 'purchase', fulfillment: 'factory' }).toArray()).map((p) => [String(p._id), p]),
  );
  let updated = 0;
  let skipped = 0;
  for (const sale of sales) {
    const purchase = sale.factoryPurchaseId ? purchases.get(String(sale.factoryPurchaseId)) : null;
    let changed = false;
    const items = (sale.items || []).map((item) => {
      const typed = Math.round(Number(item.factoryUnitCost) || 0);
      if (item.factoryCostConfirmed || typed > 0) return item;
      const source = (purchase?.items || []).find(
        (row) => String(row.productId) === String(item.productId) || row.productName === item.productName,
      );
      const fromPurchase = Math.round(Number(source?.unitPrice) || 0);
      const fromProduct = Math.round(Number(products.get(String(item.productId))?.buyPrice) || 0);
      const next = fromPurchase > 0 ? fromPurchase : fromProduct;
      if (!(next > 0)) return item;
      changed = true;
      return { ...item, factoryUnitCost: next };
    });
    if (!changed) {
      skipped += 1;
      continue;
    }
    updated += 1;
    if (!dry) await invoices.updateOne({ _id: sale._id }, { $set: { items } });
  }
  console.log(dry ? 'dry-run' : 'written', { sales: sales.length, updated, skipped });
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
