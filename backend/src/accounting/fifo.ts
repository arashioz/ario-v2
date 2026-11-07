/**
 * FIFO cost engine (اولین صادره از اولین وارده).
 *
 * Everything is tracked in kilograms: each purchase line becomes a lot with a cost per kg,
 * and each sale line consumes the oldest remaining lots of the same product. The sale's cost
 * of goods is therefore the exact purchase price of the goods that physically left, e.g.
 * bought at 133 → sold at 155 (profit 22), then bought at 145 → sold at 155 (profit 10).
 *
 * A lot's cost is its landed cost (بهای تمام‌شده): the invoice price after the supplier discount
 * plus its share of the freight/unloading paid on that purchase, split by weight.
 *
 * Each sale's profit is also split against the latest purchase price on the sale date:
 * trading profit (sell − latest cost) and inflation profit (latest cost − actual FIFO cost).
 * With 5t@133, sell 3t@155, buy 2t@142, sell 2t@155: trading 66M + 26M, inflation 18M.
 *
 * Every received shop purchase becomes a lot, whichever company it came from.
 * Direct factory shipments never sit in Ario stock. Supplier accounts stay separate.
 */

import { stockEntersShop } from '../suppliers/supplier-names';

export interface FifoProduct {
  _id: string;
  name: string;
  unit: string;
  weightPerUnitKg?: number;
  buyPrice?: number;
  sellPrice?: number;
  priceRetail?: number;
  priceSupermarket?: number;
  priceWholesale?: number;
  stock?: number;
  supplierName?: string;
  category?: string;
}

export interface FifoInvoice {
  _id: string;
  invoiceNumber: string;
  type: 'sale' | 'purchase';
  invoiceDate: Date;
  createdAt?: Date;
  customerId?: string | null;
  customerName: string;
  totalAmount: number;
  discount?: number;
  finalAmount: number;
  creditAmount?: number;
  remainingDebt?: number;
  shippingPayer?: string;
  shippingCost?: number;
  updatedAt?: Date;
  /** factory sales are not taken from shop lots. */
  fulfillment?: string;
  saleType?: string;
  factoryPurchaseId?: string;
  /** On the parent-company purchase, the customer sale it belongs to. */
  factorySaleId?: string;
  legacyPayments?: { date: Date; amount: number; method?: string }[];
  items: {
    productId: string;
    productName: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
    weightKg?: number;
    secondaryQuantity?: number;
    /** false: purchased but not delivered, so it is not a shop lot. */
    received?: boolean;
    /** Parent-company price per unit on a direct factory sale. Hidden from the customer invoice. */
    factoryUnitCost?: number;
    factoryCostConfirmed?: boolean;
  }[];
}

export interface Lot {
  id: string; // invoiceId:lineIndex
  invoiceId: string;
  invoiceNumber: string;
  supplier: string;
  date: Date;
  createdAt: Date | null;
  productId: string;
  productName: string;
  kgIn: number;
  kgLeft: number;
  /** Quantity written on the purchase invoice, in the product's own unit (a carton, not a kilo). */
  quantityIn: number;
  /** Landed cost: invoicePricePerKg + freightPerKg. */
  costPerKg: number;
  invoicePricePerKg: number;
  freightPerKg: number;
  // Filled while sales consume this lot
  kgSold: number;
  revenue: number;
  cost: number;
  fulfillment: 'shop' | 'factory';
  firstSoldAt?: Date | null;
  lastSoldAt?: Date | null;
  /** No factory/shop cost on record — must not be treated as 100% profit. */
  unknownCost?: boolean;
}

export interface Consumption {
  lotId: string | null; // null = no purchase on record (estimated)
  lotInvoiceNumber: string | null;
  lotDate: Date | null;
  kg: number;
  costPerKg: number;
  /** Company warehouse this sale took the goods from. */
  warehouse?: string;
}

/**
 * A purchase at a different price than the previous one. Stock still on hand at that moment
 * gains (or loses) `stockKg × (newCost − oldCost)` — the inflation (holding) gain.
 */
export interface PriceChange {
  productId: string;
  productName: string;
  date: Date;
  invoiceId: string;
  invoiceNumber: string;
  oldCost: number;
  newCost: number;
  stockKg: number;
  gain: number;
}

export interface SaleLine {
  invoiceId: string;
  invoiceNumber: string;
  date: Date;
  customerId: string | null;
  customerName: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  kg: number;
  revenue: number; // after invoice discount
  cost: number;
  profit: number;
  /** shop: left Ario stock. factory: parent-company price, stock untouched. */
  fulfillment: 'shop' | 'factory';
  /** True when cost of goods is missing; profit on this line is 0, not the full sale. */
  unknownCost?: boolean;
  estimatedKg: number; // kg that had no purchase lot to draw from
  consumptions: Consumption[];
  /** Latest purchase price per kg on the sale date (what it would cost to buy the goods again). */
  replacementCostPerKg: number;
  /** revenue − kg × replacement cost: earned by trading. */
  tradingProfit: number;
  /** kg × replacement cost − FIFO cost: earned because the purchase price rose while holding stock. */
  inflationProfit: number;
}

export interface InvoiceProfit {
  invoiceId: string;
  revenue: number;
  cost: number;
  profit: number;
  kg: number;
  estimated: boolean;
  unknownRevenue?: number;
}

export interface FifoResult {
  products: Map<string, FifoProduct>;
  lots: Lot[];
  lotsByProduct: Map<string, Lot[]>;
  saleLines: SaleLine[];
  invoiceProfit: Map<string, InvoiceProfit>;
  invoices: FifoInvoice[];
  priceChanges: PriceChange[];
  /** Latest purchase price per kg for each product. */
  lastCost: Map<string, number>;
  computedAt: Date;
}

const EPS = 1e-9;

const takeFromLot = (lot: Lot, take: number, revenueShare: number, date: Date) => {
  const piece = take * lot.costPerKg;
  lot.kgLeft -= take;
  lot.kgSold += take;
  lot.cost += piece;
  lot.revenue += revenueShare;
  if (!lot.firstSoldAt) lot.firstSoldAt = date;
  lot.lastSoldAt = date;
  return piece;
};

/**
 * Invoice units still sitting in a lot.
 * A sale removes kilograms; the carton count shrinks by the same share,
 * so the warehouse shows the quantity written on the purchase invoice.
 */
export function unitsLeft(quantityIn: number, kgIn: number, kgLeft: number): number {
  const qty = Number(quantityIn) || 0;
  if (qty <= 0) return 0;
  const received = Number(kgIn) || 0;
  const left = Math.max(0, Number(kgLeft) || 0);
  if (received <= 0) return left > 0 ? qty : 0;
  return qty * (left / received);
}

/** Kilograms in one stock unit (a 10kg rice bag is 10, not 1). */
export const kgPerStock = (product?: Pick<FifoProduct, 'unit' | 'weightPerUnitKg'> | null) => {
  const w = Number(product?.weightPerUnitKg) || 0;
  if (w > 0) return w;
  return product?.unit === 'کیلوگرم' ? 1 : 0;
};

/**
 * Kilograms on one invoice line.
 * Catalog math is quantity × pack weight. The invoice may also store weightKg.
 * A stored weight that is only the bag count, or exactly twice the catalog math, is not used.
 * Any other stored weight that is larger than the catalog math is the invoice's own tonnage and wins,
 * so a line is never shrunk below what the invoice wrote.
 */
export const lineKg = (it: FifoInvoice['items'][number], product?: FifoProduct): number => {
  const qty = Number(it.quantity) || 0;
  const per = kgPerStock(product);
  const fromQty = per > 0 ? qty * per : 0;
  const w = Number(it.weightKg) || 0;
  const sec = Number(it.secondaryQuantity) || 0;
  const recorded = w > 0 ? w : sec;
  const close = (a: number, b: number) => b > 0 && Math.abs(a - b) <= Math.max(0.6, b * 0.02);
  if (fromQty > 0 && recorded > 0 && per !== 1 && close(recorded, fromQty * 2)) return fromQty;
  if (fromQty > 0 && recorded > 0 && close(recorded, fromQty)) return fromQty;
  if (fromQty > 0 && per > 1 && recorded > 0 && close(recorded, qty)) return fromQty;
  if (recorded > fromQty && recorded > 0) return recorded;
  if (fromQty > 0) return fromQty;
  if (recorded > 0) return recorded;
  return qty;
};

/**
 * Invoices imported from the old app stored the post-discount amount (what the customer paid) in
 * totalAmount, and the import subtracted the discount again for finalAmount:
 * lines − total = total − final = discount.
 */
export function isDoubleDiscount(inv: { totalAmount: number; finalAmount: number; discount?: number }, sumItems: number) {
  const d = inv.discount || 0;
  return d > 0 && Math.abs(sumItems - inv.totalAmount - d) <= 5 && Math.abs(inv.totalAmount - inv.finalAmount - d) <= 5;
}

/**
 * One sale's toman. Shipping the customer paid is not sales. A doubled discount
 * is undone. Line prices never add money on top of this figure.
 */
export function goodsAmount(inv: {
  totalAmount?: number;
  finalAmount?: number;
  discount?: number;
  shippingPayer?: string | null;
  shippingCost?: number;
  items?: { totalPrice?: number }[];
}): number {
  const items = inv.items || [];
  const sumItems = items.reduce((s, it) => s + (Number(it.totalPrice) || 0), 0);
  const shipping = inv.shippingPayer === 'customer' ? Number(inv.shippingCost) || 0 : 0;
  const paid = isDoubleDiscount(
    { totalAmount: Number(inv.totalAmount) || 0, finalAmount: Number(inv.finalAmount) || 0, discount: inv.discount },
    sumItems,
  )
    ? Number(inv.totalAmount) || 0
    : Math.max(0, (Number(inv.finalAmount) || 0) - shipping);
  return Math.max(0, Math.round(paid));
}

/** Split `goodsAmount` across lines. The parts add up to the invoice, never to a price list. */
export function lineRevenues(inv: {
  totalAmount?: number;
  finalAmount?: number;
  discount?: number;
  shippingPayer?: string | null;
  shippingCost?: number;
  items?: { totalPrice?: number; quantity?: number; unitPrice?: number }[];
}): number[] {
  const items = inv.items || [];
  const goods = goodsAmount(inv);
  if (!items.length) return [];
  if (goods <= 0) return items.map(() => 0);
  const weightOf = (it: { totalPrice?: number; quantity?: number; unitPrice?: number }) => {
    const priced = Number(it.totalPrice) || 0;
    if (priced > 0) return priced;
    const unit = Number(it.unitPrice) || 0;
    const qty = Number(it.quantity) || 0;
    return unit > 0 && qty > 0 ? unit * qty : 0;
  };
  let weights = items.map(weightOf);
  let sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0) {
    weights = items.map((it) => Math.max(Number(it.quantity) || 0, 0));
    sum = weights.reduce((s, w) => s + w, 0);
  }
  if (sum <= 0) {
    const even = Math.round(goods / items.length);
    const out = items.map(() => even);
    out[out.length - 1] = goods - even * (items.length - 1);
    return out;
  }
  const out = weights.map((w, i) => (i === weights.length - 1 ? 0 : Math.round((goods * w) / sum)));
  out[out.length - 1] = goods - out.reduce((s, n) => s + n, 0);
  return out;
}

/** Freight/unloading the shop paid on a purchase; it is part of the goods' cost, not an expense. */
export const purchaseFreight = (inv: Pick<FifoInvoice, 'type' | 'shippingPayer' | 'shippingCost'>) =>
  inv.type === 'purchase' && inv.shippingPayer === 'me' ? inv.shippingCost || 0 : 0;

/** Per-line kg and landed cost per kg of a purchase invoice. */
export function purchaseLineCosts(inv: FifoInvoice, products: Map<string, FifoProduct>) {
  const kgs = inv.items.map((it) => lineKg(it, products.get(it.productId)));
  const totalKg = kgs.reduce((s, k) => s + (k > 0 ? k : 0), 0);
  const discount = inv.discount || 0;
  const discountFactor = inv.totalAmount > 0 && discount > 0 ? Math.max(0, inv.totalAmount - discount) / inv.totalAmount : 1;
  const freightPerKg = totalKg > 0 ? purchaseFreight(inv) / totalKg : 0;
  return inv.items.map((it, idx) => {
    const kg = kgs[idx];
    const invoicePricePerKg = kg > 0 ? ((it.totalPrice || 0) * discountFactor) / kg : 0;
    return { kg, invoicePricePerKg, freightPerKg, costPerKg: invoicePricePerKg + freightPerKg };
  });
}

/**
 * Landed purchase price of one stock unit (a bag, not a kilo).
 * Invoice unit price after the supplier discount, plus that line's share of freight.
 * With no freight and no discount this is the typed unit price.
 */
export function landedUnitPrices(
  inv: Pick<FifoInvoice, 'type' | 'shippingPayer' | 'shippingCost' | 'totalAmount' | 'discount' | 'items'>,
  products: Map<string, FifoProduct> = new Map(),
): number[] {
  const costs = purchaseLineCosts(
    {
      _id: '',
      invoiceNumber: '',
      invoiceDate: new Date(0),
      customerName: '',
      finalAmount: 0,
      type: inv.type,
      shippingPayer: inv.shippingPayer,
      shippingCost: inv.shippingCost,
      totalAmount: inv.totalAmount || 0,
      discount: inv.discount,
      items: inv.items,
    },
    products,
  );
  return inv.items.map((it, i) => {
    const qty = Number(it.quantity) || 0;
    const kg = costs[i]?.kg || 0;
    if (!(qty > 0) || !(kg > 0)) return Math.max(0, Math.round(Number(it.unitPrice) || 0));
    return Math.max(0, Math.round(costs[i].costPerKg * (kg / qty)));
  });
}

export interface FifoWorkshop {
  _id: string;
  date: Date;
  inputs: { productId: string; quantity: number; weightKg: number; unitCost: number }[];
  output: { productId: string; productName: string; quantity: number; weightKg: number; unitCost: number };
  packagingCost: number;
  laborCost: number;
}

export function runFifo(invoices: FifoInvoice[], productList: FifoProduct[], workshops: FifoWorkshop[] = []): FifoResult {
  const products = new Map(productList.map((p) => [String(p._id), p]));
  const productsByName = new Map(productList.map((p) => [p.name.trim(), p]));
  const resolveProduct = (pid: string, name?: string) => products.get(pid) || (name ? productsByName.get(name.trim()) : undefined);

  const sorted = [...invoices].sort(
    (a, b) =>
      new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime() ||
      // Same day: goods must arrive before they can be sold.
      (a.type === 'purchase' ? 0 : 1) - (b.type === 'purchase' ? 0 : 1) ||
      new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime(),
  );

  const lots: Lot[] = [];
  const lotsByProduct = new Map<string, Lot[]>();
  const queue = new Map<string, Lot[]>(); // open lots per product, oldest first
  const lastCost = new Map<string, number>();
  const saleLines: SaleLine[] = [];
  const invoiceProfit = new Map<string, InvoiceProfit>();
  const priceChanges: PriceChange[] = [];

  /**
   * Price already known on the sale date: the latest purchase on or before that day.
   * A later, more expensive purchase must not be pulled backwards. Otherwise a sale at 710
   * against a 670 lot is reported as a loss once today's buy price is higher.
   */
  const priceThen = (pid: string) => lastCost.get(pid) ?? 0;

  // Parent-company invoices for direct shipments — not shop stock.
  const factoryUnitBuys = new Map<string, { day: string; unitPrice: number }[]>();
  for (const inv of sorted) {
    if (inv.type !== 'purchase' || stockEntersShop(inv)) continue;
    const day = dayKey(inv.invoiceDate);
    for (const it of inv.items || []) {
      const unitPrice = Math.round(Number(it.unitPrice) || 0);
      if (unitPrice <= 0 || it.received === false) continue;
      const rows = factoryUnitBuys.get(it.productId) ?? [];
      rows.push({ day, unitPrice });
      factoryUnitBuys.set(it.productId, rows);
    }
  }
  const factoryUnitOnOrBefore = (pid: string, day: string) => {
    let price = 0;
    for (const row of factoryUnitBuys.get(pid) ?? []) {
      if (row.day > day) break;
      price = row.unitPrice;
    }
    return price;
  };
  const events = [
    ...sorted.map((inv, index) => ({ date: new Date(inv.invoiceDate).getTime(), index, inv, batch: null as FifoWorkshop | null })),
    ...workshops.map((batch, index) => ({ date: new Date(batch.date).getTime(), index: sorted.length + index, inv: null as FifoInvoice | null, batch })),
  ].sort((a, b) => a.date - b.date || a.index - b.index);
  for (const event of events) {
    if (event.batch) {
      const batch = event.batch;
      let cost = batch.packagingCost + batch.laborCost;
      for (const input of batch.inputs) {
        let need = input.weightKg || input.quantity;
        const q = queue.get(input.productId) ?? [];
        while (need > EPS && q.length) {
          const lot = q[0];
          const take = Math.min(need, lot.kgLeft);
          cost += take * lot.costPerKg;
          lot.kgLeft -= take;
          need -= take;
          if (lot.kgLeft <= EPS) { lot.kgLeft = 0; q.shift(); }
        }
        // Opening stock may have no purchase lot; use the cost recorded at production.
        cost += need * input.unitCost * input.quantity / (input.weightKg || input.quantity);
      }
      const output = batch.output;
      const kg = output.weightKg || output.quantity;
      const lot: Lot = {
        id: `workshop:${batch._id}`, invoiceId: batch._id, invoiceNumber: `تولید ${batch._id.slice(-6)}`,
        supplier: 'کارگاه', date: batch.date, createdAt: batch.date,
        productId: output.productId, productName: output.productName,
        kgIn: kg, kgLeft: kg, quantityIn: Number(output.quantity) || 0, costPerKg: cost / kg, invoicePricePerKg: cost / kg,
        freightPerKg: 0, kgSold: 0, revenue: 0, cost: 0, fulfillment: 'shop',
      };
      lots.push(lot);
      if (!lotsByProduct.has(output.productId)) lotsByProduct.set(output.productId, []);
      lotsByProduct.get(output.productId)!.push(lot);
      if (!queue.has(output.productId)) queue.set(output.productId, []);
      queue.get(output.productId)!.push(lot);
      lastCost.set(output.productId, lot.costPerKg);
      continue;
    }
    const inv = event.inv!;
    const id = String(inv._id);
    if (inv.type === 'purchase') {
      // Company invoice for a direct shipment: it is not stock Ario holds.
      if (!stockEntersShop(inv)) continue;
      const lines = inv.items.map((it, idx) => ({ it, idx })).filter((l) => l.it.received !== false);
      const costs = purchaseLineCosts({ ...inv, items: lines.map((l) => l.it) }, products);
      lines.forEach(({ it, idx }, i) => {
        const { kg, invoicePricePerKg, freightPerKg, costPerKg: newCost } = costs[i];
        if (kg <= 0) return;
        const found = resolveProduct(String(it.productId || ''), it.productName);
        const pid = found ? String(found._id) : String(it.productId || '');
        const prev = lastCost.get(pid);
        if (prev !== undefined && Math.abs(newCost - prev) > 0.5) {
          const stockKg = (queue.get(pid) ?? []).reduce((s, l) => s + l.kgLeft, 0);
          priceChanges.push({
            productId: pid,
            productName: it.productName,
            date: inv.invoiceDate,
            invoiceId: id,
            invoiceNumber: inv.invoiceNumber,
            oldCost: prev,
            newCost,
            stockKg,
            gain: stockKg * (newCost - prev),
          });
        }
        const lot: Lot = {
          id: `${id}:${idx}`,
          invoiceId: id,
          invoiceNumber: inv.invoiceNumber,
          supplier: inv.customerName,
          date: inv.invoiceDate,
          createdAt: inv.createdAt ? new Date(inv.createdAt) : null,
          productId: pid,
          productName: it.productName,
          kgIn: kg,
          kgLeft: kg,
          quantityIn: Number(it.quantity) || 0,
          costPerKg: newCost,
          invoicePricePerKg,
          freightPerKg,
          kgSold: 0,
          revenue: 0,
          cost: 0,
          fulfillment: 'shop',
        };
        lots.push(lot);
        if (!lotsByProduct.has(pid)) lotsByProduct.set(pid, []);
        lotsByProduct.get(pid)!.push(lot);
        if (!queue.has(pid)) queue.set(pid, []);
        queue.get(pid)!.push(lot);
        lastCost.set(pid, lot.costPerKg);
      });
      continue;
    }

    // Every line's revenue is a share of the invoice's own toman. A missing line
    // price only decides the share; it never adds the catalog price on top.
    const revenues = lineRevenues(inv);
    const ip: InvoiceProfit = { invoiceId: id, revenue: 0, cost: 0, profit: 0, kg: 0, estimated: false, unknownRevenue: 0 };

    for (const [idx, it] of inv.items.entries()) {
      const found = resolveProduct(String(it.productId || ''), it.productName);
      const pid = found ? String(found._id) : String(it.productId || '');
      const product = found;
      const kg = lineKg(it, product);
      const revenue = revenues[idx] || 0;
      const pricedFromList = false;

      // Direct factory shipment: sell − parent-company invoice cost. Never shop FIFO,
      // and never treat missing cost as 100% profit.
      if (inv.fulfillment === 'factory') {
        const saleDay = dayKey(inv.invoiceDate);
        const typed = Math.round(Number(it.factoryUnitCost) || 0);
        const purchase = inv.factoryPurchaseId ? sorted.find((row) => String(row._id) === String(inv.factoryPurchaseId)) : undefined;
        const source = purchase?.items.find((row) => String(row.productId) === pid || row.productName === it.productName);
        const fromPurchase = Math.round(Number(source?.unitPrice) || 0);
        const fromFactoryHistory = factoryUnitOnOrBefore(pid, saleDay);
        const fromProduct = Math.round(Number(product?.buyPrice) || 0);
        let factoryUnit = 0;
        if (it.factoryCostConfirmed) factoryUnit = typed;
        else if (typed > 0) factoryUnit = typed;
        else if (fromPurchase > 0) factoryUnit = fromPurchase;
        else if (fromFactoryHistory > 0) factoryUnit = fromFactoryHistory;
        else if (fromProduct > 0) factoryUnit = fromProduct;
        const unknownCost = factoryUnit <= 0;
        const cost = unknownCost ? 0 : factoryUnit * (it.quantity || 0);
        const profit = unknownCost ? 0 : revenue - cost;
        const estimatedKg = pricedFromList || unknownCost ? kg : 0;
        if (estimatedKg > 0) ip.estimated = true;
        const perKg = kg > 0 && !unknownCost ? cost / kg : 0;
        const lotId = purchase ? `factory:${String(purchase._id)}:${pid}` : `factory-sale:${id}:${pid}`;
        let lot = lots.find((row) => row.id === lotId);
        if (!lot) {
          const kgIn = Math.max(kg, source ? lineKg(source, product) : 0);
          lot = {
            id: lotId,
            invoiceId: purchase ? String(purchase._id) : id,
            invoiceNumber: purchase?.invoiceNumber || inv.invoiceNumber,
            supplier: purchase?.customerName || 'کارخانه',
            date: purchase?.invoiceDate || inv.invoiceDate,
            createdAt: null,
            productId: pid,
            productName: it.productName,
            kgIn,
            kgLeft: kgIn,
            quantityIn: Number(it.quantity) || 0,
            costPerKg: perKg,
            invoicePricePerKg: perKg,
            freightPerKg: 0,
            kgSold: 0,
            revenue: 0,
            cost: 0,
            fulfillment: 'factory',
            unknownCost,
          };
          lots.push(lot);
        }
        if (unknownCost) {
          lot.kgSold += kg;
          lot.revenue += revenue;
          lot.unknownCost = true;
          if (!lot.firstSoldAt) lot.firstSoldAt = inv.invoiceDate;
          lot.lastSoldAt = inv.invoiceDate;
        } else {
          if (lot.unknownCost) {
            lot.unknownCost = false;
            lot.costPerKg = perKg;
            lot.invoicePricePerKg = perKg;
          }
          takeFromLot(lot, kg, revenue, inv.invoiceDate);
        }
        lot.kgLeft = Math.max(0, lot.kgIn - lot.kgSold);
        saleLines.push({
          invoiceId: id,
          invoiceNumber: inv.invoiceNumber,
          date: inv.invoiceDate,
          customerId: inv.customerId ? String(inv.customerId) : null,
          customerName: inv.customerName,
          productId: pid,
          productName: it.productName,
          quantity: it.quantity,
          unit: it.unit,
          kg,
          revenue,
          cost,
          profit,
          fulfillment: 'factory',
          unknownCost,
          estimatedKg,
          consumptions: [{ lotId: lot.id, lotInvoiceNumber: lot.invoiceNumber, lotDate: lot.date, kg, costPerKg: perKg, warehouse: lot.supplier }],
          replacementCostPerKg: perKg,
          tradingProfit: profit,
          inflationProfit: 0,
        });
        ip.revenue += revenue;
        ip.cost += cost;
        ip.kg += kg;
        if (unknownCost) ip.unknownRevenue = (ip.unknownRevenue || 0) + revenue;
        continue;
      }

      const consumptions: Consumption[] = [];
      let need = kg;
      let cost = 0;
      const q = queue.get(pid) ?? [];

      while (need > EPS && q.length) {
        const lot = q[0];
        const take = Math.min(lot.kgLeft, need);
        const share = kg > 0 ? (revenue * take) / kg : 0;
        cost += takeFromLot(lot, take, share, inv.invoiceDate);
        consumptions.push({ lotId: lot.id, lotInvoiceNumber: lot.invoiceNumber, lotDate: lot.date, kg: take, costPerKg: lot.costPerKg, warehouse: lot.supplier });
        need -= take;
        if (lot.kgLeft <= EPS) {
          lot.kgLeft = 0;
          q.shift();
        }
      }

      let estimatedKg = 0;
      let unknownCost = false;
      if (need > EPS) {
        const c = priceThen(pid);
        if (c > 0) {
          cost += need * c;
          consumptions.push({ lotId: null, lotInvoiceNumber: null, lotDate: null, kg: need, costPerKg: c });
        } else {
          unknownCost = true;
        }
        estimatedKg = need;
        ip.estimated = true;
      }

      const replacement = priceThen(pid);
      const profit = unknownCost && cost <= 0 ? 0 : revenue - cost;

      saleLines.push({
        invoiceId: id,
        invoiceNumber: inv.invoiceNumber,
        date: inv.invoiceDate,
        customerId: inv.customerId ? String(inv.customerId) : null,
        customerName: inv.customerName,
        productId: pid,
        productName: it.productName,
        quantity: it.quantity,
        unit: it.unit,
        kg,
        revenue,
        cost,
        profit,
        fulfillment: 'shop',
        unknownCost,
        estimatedKg,
        consumptions,
        replacementCostPerKg: replacement,
        tradingProfit: unknownCost ? 0 : revenue - kg * replacement,
        inflationProfit: unknownCost ? 0 : kg * replacement - cost,
      });
      ip.revenue += revenue;
      ip.cost += cost;
      ip.kg += kg;
      if (unknownCost) ip.unknownRevenue = (ip.unknownRevenue || 0) + revenue;
    }
    ip.profit = ip.revenue - (ip.unknownRevenue || 0) - ip.cost;
    invoiceProfit.set(id, ip);
  }

  return {
    products,
    lots,
    lotsByProduct,
    saleLines,
    invoiceProfit,
    invoices: sorted,
    priceChanges,
    lastCost,
    computedAt: new Date(),
  };
}

const tehranDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' });
/** YYYY-MM-DD in Tehran time. */
export const dayKey = (d: Date | string) => tehranDay.format(new Date(d));
