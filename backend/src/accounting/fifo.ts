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
 */

export interface FifoProduct {
  _id: string;
  name: string;
  unit: string;
  weightPerUnitKg?: number;
  buyPrice?: number;
  stock?: number;
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
  /** factory sales are not taken from shop lots. */
  fulfillment?: string;
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
  /** Landed cost: invoicePricePerKg + freightPerKg. */
  costPerKg: number;
  invoicePricePerKg: number;
  freightPerKg: number;
  // Filled while sales consume this lot
  kgSold: number;
  revenue: number;
  cost: number;
}

export interface Consumption {
  lotId: string | null; // null = no purchase on record (estimated)
  lotInvoiceNumber: string | null;
  lotDate: Date | null;
  kg: number;
  costPerKg: number;
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

export const lineKg = (it: FifoInvoice['items'][number], product?: FifoProduct): number => {
  if (it.weightKg && it.weightKg > 0) return it.weightKg;
  if (product?.weightPerUnitKg) return (it.quantity || 0) * product.weightPerUnitKg;
  return it.secondaryQuantity || it.quantity || 0;
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

export function runFifo(invoices: FifoInvoice[], productList: FifoProduct[]): FifoResult {
  const products = new Map(productList.map((p) => [String(p._id), p]));

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

  for (const inv of sorted) {
    const id = String(inv._id);
    if (inv.type === 'purchase') {
      // Company invoice for a direct shipment: it is not stock Ario holds.
      if (inv.fulfillment === 'factory') continue;
      const lines = inv.items.map((it, idx) => ({ it, idx })).filter((l) => l.it.received !== false);
      const costs = purchaseLineCosts({ ...inv, items: lines.map((l) => l.it) }, products);
      lines.forEach(({ it, idx }, i) => {
        const { kg, invoicePricePerKg, freightPerKg, costPerKg: newCost } = costs[i];
        if (kg <= 0) return;
        const prev = lastCost.get(it.productId);
        if (prev !== undefined && Math.abs(newCost - prev) > 0.5) {
          const stockKg = (queue.get(it.productId) ?? []).reduce((s, l) => s + l.kgLeft, 0);
          priceChanges.push({
            productId: it.productId,
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
          productId: it.productId,
          productName: it.productName,
          kgIn: kg,
          kgLeft: kg,
          costPerKg: newCost,
          invoicePricePerKg,
          freightPerKg,
          kgSold: 0,
          revenue: 0,
          cost: 0,
        };
        lots.push(lot);
        if (!lotsByProduct.has(it.productId)) lotsByProduct.set(it.productId, []);
        lotsByProduct.get(it.productId)!.push(lot);
        if (!queue.has(it.productId)) queue.set(it.productId, []);
        queue.get(it.productId)!.push(lot);
        lastCost.set(it.productId, lot.costPerKg);
      });
      continue;
    }

    // Revenue is the money actually received for the goods, spread over the lines by their price.
    // Delivery charged to the customer passes through to the carrier; it is not sales revenue.
    const shippingCharge = inv.shippingPayer === 'customer' ? inv.shippingCost || 0 : 0;
    const sumItems = inv.items.reduce((s, it) => s + (it.totalPrice || 0), 0);
    const received = isDoubleDiscount(inv, sumItems) ? inv.totalAmount : inv.finalAmount - shippingCharge;
    const discountFactor = sumItems > 0 ? received / sumItems : 1;
    const ip: InvoiceProfit = { invoiceId: id, revenue: 0, cost: 0, profit: 0, kg: 0, estimated: false };

    for (const it of inv.items) {
      const pid = it.productId;
      const kg = lineKg(it, products.get(pid));
      const revenue = (it.totalPrice || 0) * discountFactor;

      // Shipped from the factory: cost is the parent-company price, and shop lots stay untouched.
      if (inv.fulfillment === 'factory') {
        const factoryUnit = it.factoryUnitCost || 0;
        const cost = factoryUnit * (it.quantity || 0);
        const estimatedKg = factoryUnit > 0 ? 0 : kg;
        if (estimatedKg > 0) ip.estimated = true;
        const perKg = kg > 0 ? cost / kg : 0;
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
          profit: revenue - cost,
          fulfillment: 'factory',
          estimatedKg,
          consumptions: [{ lotId: null, lotInvoiceNumber: null, lotDate: null, kg, costPerKg: perKg }],
          replacementCostPerKg: perKg,
          tradingProfit: revenue - cost,
          inflationProfit: 0,
        });
        ip.revenue += revenue;
        ip.cost += cost;
        ip.kg += kg;
        continue;
      }

      const consumptions: Consumption[] = [];
      let need = kg;
      let cost = 0;
      const q = queue.get(pid) ?? [];

      while (need > EPS && q.length) {
        const lot = q[0];
        const take = Math.min(lot.kgLeft, need);
        cost += take * lot.costPerKg;
        lot.kgLeft -= take;
        lot.kgSold += take;
        lot.cost += take * lot.costPerKg;
        lot.revenue += kg > 0 ? (revenue * take) / kg : 0;
        consumptions.push({ lotId: lot.id, lotInvoiceNumber: lot.invoiceNumber, lotDate: lot.date, kg: take, costPerKg: lot.costPerKg });
        need -= take;
        if (lot.kgLeft <= EPS) {
          lot.kgLeft = 0;
          q.shift();
        }
      }

      let estimatedKg = 0;
      if (need > EPS) {
        const c = priceThen(pid);
        if (c > 0) {
          cost += need * c;
          consumptions.push({ lotId: null, lotInvoiceNumber: null, lotDate: null, kg: need, costPerKg: c });
        }
        estimatedKg = need;
        ip.estimated = true;
      }

      const replacement = priceThen(pid);

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
        profit: revenue - cost,
        fulfillment: 'shop',
        estimatedKg,
        consumptions,
        replacementCostPerKg: replacement,
        tradingProfit: revenue - kg * replacement,
        inflationProfit: kg * replacement - cost,
      });
      ip.revenue += revenue;
      ip.cost += cost;
      ip.kg += kg;
    }
    ip.profit = ip.revenue - ip.cost;
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
