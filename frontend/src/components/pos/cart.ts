import type { Product } from '../../services/products.service';
import type { InvoiceItem } from '../../services/invoices.service';
import type { SaleType } from '../../services/settings.service';

export interface CartLine {
  product: Product;
  /** In the product's primary unit (بسته، کارتن، …); may be fractional when sold by weight. */
  quantity: number;
  unitPrice: number;
  /** Price typed by hand; kept when the price tier changes. */
  priceOverride: boolean;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
export const r3 = (n: number) => Math.round(n * 1000) / 1000;

export const kgPerUnit = (p: Product) =>
  p.weightPerUnitKg ||
  (p.hasDualUnit && p.secondaryUnit === 'کیلوگرم' ? p.unitRatio || 0 : 0) ||
  (p.unit === 'کیلوگرم' ? 1 : 0) ||
  (p.sellBy === 'kg' ? 1 : 0);

export const tierPrice = (p: Product, type: SaleType) => {
  const tier = type === 'wholesale' ? p.priceWholesale : type === 'supermarket' ? p.priceSupermarket : p.priceRetail;
  return tier && tier > 0 ? tier : p.sellPrice;
};

export const pricePerKg = (unitPrice: number, p: Product) => {
  const k = kgPerUnit(p);
  return k ? Math.round(unitPrice / k) : 0;
};

export const stockKg = (p: Product) => r1((p.stock || 0) * kgPerUnit(p));

export const lineKg = (l: CartLine) => r1(l.quantity * kgPerUnit(l.product));
export const lineTotal = (l: CartLine) => Math.round(l.quantity * l.unitPrice);

export const toInvoiceItem = (l: CartLine): InvoiceItem => {
  const kg = lineKg(l);
  return {
    productId: l.product._id,
    productName: l.product.name,
    quantity: r3(l.quantity),
    unit: l.product.unit,
    secondaryQuantity: l.product.hasDualUnit ? kg : undefined,
    secondaryUnit: l.product.hasDualUnit ? l.product.secondaryUnit : undefined,
    unitPrice: l.unitPrice,
    totalPrice: lineTotal(l),
    weightKg: kg,
  };
};
