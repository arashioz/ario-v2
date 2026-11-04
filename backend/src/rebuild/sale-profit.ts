import { priceOn, type PeriodRow } from '../pricing/price-period.service';

export interface ProfitSourceLine {
  productId?: unknown;
  quantity?: number;
  totalPrice?: number;
  factoryUnitCost?: number;
  unitCost?: number;
  profit?: number;
}

export interface SaleProfitInput {
  fulfillment?: string;
  invoiceDate?: Date | string;
  discount?: number;
  items?: ProfitSourceLine[];
}

/**
 * Profit of one sale from the landed buy price in force on its own date.
 * A missing price that day stays zero. Today's buy price is not a fallback.
 */
export function historicalSaleProfit(invoice: SaleProfitInput, periods: PeriodRow[]) {
  const fromFactory = invoice.fulfillment === 'factory';
  const asOf = invoice.invoiceDate || new Date();
  const goods = (invoice.items || []).reduce((sum, it) => sum + (Number(it.totalPrice) || 0), 0);
  const discount = Math.min(goods, Math.max(0, Math.round(Number(invoice.discount) || 0)));
  const factor = goods > 0 ? (goods - discount) / goods : 1;
  let costAmount = 0;
  let profitAmount = 0;
  const lines = (invoice.items || []).map((it) => {
    const then = priceOn(periods, String(it.productId || ''), asOf);
    const typed = Math.round(Number(it.factoryUnitCost) || 0);
    const unitCost = fromFactory ? (typed || then) : then;
    const qty = Number(it.quantity) || 0;
    const lineNet = Math.round((Number(it.totalPrice) || 0) * factor);
    const lineCost = unitCost > 0 ? Math.round(unitCost * qty) : 0;
    const profit = unitCost > 0 ? lineNet - lineCost : 0;
    costAmount += lineCost;
    profitAmount += profit;
    return { unitCost, profit, unresolved: !(unitCost > 0) };
  });
  return { costAmount, profitAmount, lines };
}

/** Fields a historical profit rewrite is allowed to set. Invoice prices and totals are not in here. */
export function derivedProfitSet(lines: { unitCost: number; profit: number }[], costAmount: number, profitAmount: number) {
  const set: Record<string, number> = { costAmount, profitAmount };
  lines.forEach((line, i) => {
    set[`items.${i}.unitCost`] = line.unitCost;
    set[`items.${i}.profit`] = line.profit;
  });
  return set;
}

const DERIVED = /^(costAmount|profitAmount|items\.\d+\.(unitCost|profit))$/;

export const onlyDerivedProfitFields = (set: Record<string, number>) => Object.keys(set).every((key) => DERIVED.test(key));
