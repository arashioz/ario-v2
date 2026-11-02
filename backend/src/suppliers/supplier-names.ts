/** The parent company all sugar is bought from. */
export const PARENT_COMPANY = 'شرکت قند بلالی';

export const clean = (s: string) =>
  (s || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * One account per supplier: old records used "شرکت" / "شرکت بنام …" / "شرکت قند بلالی"
 * for the same parent company. Keep in sync with scripts/import-supplier-payments.js.
 */
const registered = new Set<string>();

/** Names of supplier companies defined in the app; they are never folded into the parent company. */
export function setRegisteredSuppliers(names: string[]) {
  registered.clear();
  for (const n of names) registered.add(clean(n));
}

export function canonicalSupplier(name: string | null | undefined): string {
  const s = clean(name ?? '');
  if (registered.has(s)) return s;
  // Only the parent company's own aliases. Other names that merely start with «شرکت» stay their own account.
  if (!s || s === 'شرکت' || s.startsWith('شرکت بنام') || s.startsWith('شرکت به نام') || s.includes('بلالی')) return PARENT_COMPANY;
  return s;
}

export function isParentSupplier(name: string | null | undefined): boolean {
  return canonicalSupplier(name) === PARENT_COMPANY;
}

/**
 * Every received purchase adds to shop stock, whichever company it came from.
 * Only direct factory shipments are kept out of Ario stock. Accounting (cost, cash, supplier
 * accounts) keeps its own rules through purchaseEntersShop.
 */
export function stockEntersShop(inv: { type?: string | null; fulfillment?: string | null }): boolean {
  if (inv.type && inv.type !== 'purchase') return false;
  return inv.fulfillment !== 'factory';
}

/**
 * Purchases from other companies stay on that company's account (cost, cash, supplier accounts).
 * They do not change the main invoice list, and factory-shipment purchases are not Ario stock.
 * Shop stock uses stockEntersShop instead.
 */
export function purchaseEntersShop(inv: { type?: string | null; fulfillment?: string | null; customerName?: string | null }): boolean {
  if (inv.type && inv.type !== 'purchase') return false;
  if (inv.fulfillment === 'factory' || inv.fulfillment === 'ledger') return false;
  return isParentSupplier(inv.customerName);
}
