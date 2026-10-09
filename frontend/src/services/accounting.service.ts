import { api } from './api';

export interface PeriodQuery {
  from?: string;
  to?: string;
}

export interface SalesSummary {
  revenue: number;
  cost: number;
  profit: number;
  kg: number;
  tons: number;
  /** profit ÷ sales */
  marginPercent: number;
  /** profit ÷ purchase cost */
  markupPercent: number;
  profitPerKg: number;
  avgSellPerKg: number;
  avgCostPerKg: number;
}

export interface OpenLot {
  invoiceNumber: string;
  date: string;
  kgLeft: number;
  costPerKg: number;
}

export type PriceTierKey = 'retail' | 'supermarket' | 'wholesale';
export type TierValues = Record<PriceTierKey, number>;
export const PRICE_TIER_LABELS: Record<PriceTierKey, string> = {
  wholesale: 'عمده',
  supermarket: 'سوپرمارکت',
  retail: 'خرده',
};

export interface InventoryItem {
  productId: string;
  name: string;
  unit: string;
  weightPerUnitKg: number;
  exists: boolean;
  stockUnits: number;
  /** Received purchase quantities minus shop sales. Registered stock should match this. */
  expectedUnits: number;
  stockKg: number;
  stockValue: number;
  currentValue: TierValues;
  purchasedKg: number;
  purchasedAmount: number;
  purchaseCount: number;
  avgBuyPerKg: number;
  soldKg: number;
  soldRevenue: number;
  soldCost: number;
  profit: number;
  marginPercent: number;
  profitPerKg: number;
  avgSellPerKg: number;
  fifoRemainingKg: number;
  remainingValue: number;
  openLots: OpenLot[];
}

export interface InventoryReport {
  totals: {
    stockKg: number;
    stockValue: number;
    currentValue: TierValues;
    currentProfit: TierValues;
    purchasedKg: number;
    purchasedAmount: number;
    soldKg: number;
    soldRevenue: number;
    soldCost: number;
    profit: number;
    marginPercent: number;
    profitPerKg: number;
    differenceKg: number | null;
  };
  items: InventoryItem[];
}

export type GroupRow = SalesSummary & { key: string; invoices: number };

export interface LotRow {
  invoiceNumber: string;
  invoiceId: string;
  date: string;
  supplier?: string;
  productName: string;
  kgIn: number;
  costPerKg: number;
  buyAmount: number;
  kgSold: number;
  kgLeft: number;
  soldPercent: number;
  revenue: number;
  profit: number;
  avgSellPerKg: number;
  profitPerKg: number;
  marginPercent: number;
}

export interface SuspiciousLine {
  invoiceId: string;
  invoiceNumber: string;
  date: string;
  customerName: string;
  productName: string;
  quantity: number;
  unit: string;
  kg: number;
  sellPerKg: number;
  costPerKg: number;
  profit: number;
  marginPercent: number;
  level: 'error' | 'loss';
}

export interface ChannelSplit {
  shop: SalesSummary & { invoices: number };
  factory: SalesSummary & { invoices: number };
}

export interface ProfitReport {
  summary: SalesSummary & { invoices: number; days: number };
  /** Full total is `summary`. These two add up to it. */
  channels?: ChannelSplit;
  byProduct: (GroupRow & { name: string })[];
  byDay: (GroupRow & { date: string })[];
  byCustomer: (GroupRow & { name: string; customerId?: string | null })[];
  byLot: LotRow[];
  suspicious: SuspiciousLine[];
  warnings: { estimatedLines: number; estimatedKg: number; estimatedInvoices: string[] };
  method: 'FIFO';
}

export interface InvoiceProfit extends SalesSummary {
  estimated: boolean;
  lines: {
    productName: string;
    quantity: number;
    unit: string;
    kg: number;
    revenue: number;
    cost: number;
    profit: number;
    sellPerKg: number;
    costPerKg: number;
    costPerUnit: number;
    lots: { invoiceNumber: string | null; kg: number; costPerKg: number; estimated: boolean }[];
  }[];
}

export interface CreditInvoiceRow {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string | null;
  customerName: string;
  date: string;
  amount: number;
  upfront: number;
  credit: number;
  paidLater: number;
  remaining: number;
  profit: number;
  marginPercent: number;
  realizedProfit: number;
  unrealizedProfit: number;
  settledAt: string | null;
  daysToSettle: number | null;
  ageDays: number;
  payments: { date: string; amount: number; method?: string; profit: number }[];
}

export interface CreditDayRow {
  date: string;
  creditSent: number;
  creditSentProfit: number;
  creditInvoices: number;
  collected: number;
  realizedProfit: number;
  /** Payments this day for credit invoices sold on an earlier day. */
  collectedPrior: number;
  collectedPriorProfit: number;
  settled: number;
}

export interface CreditReport {
  summary: {
    creditSent: number;
    creditSentProfit: number;
    creditInvoices: number;
    collected: number;
    realizedProfit: number;
    collectedPrior: number;
    collectedPriorProfit: number;
    outstanding: number;
    unrealizedProfit: number;
    openInvoices: number;
    avgDaysToSettle: number | null;
  };
  days: CreditDayRow[];
  invoices: CreditInvoiceRow[];
}

export interface DayWork {
  sold: number;
  soldKg: number;
  invoices: number;
  credit: number;
  creditInvoices: number;
  /** Credit from earlier days that was paid on this day. */
  priorCollected: number;
}

export interface AccountingDashboard {
  stockKg: number;
  stockValue: number;
  currentValue: TierValues;
  currentProfit: TierValues;
  today: SalesSummary;
  month: SalesSummary;
  todayChannels?: ChannelSplit;
  monthChannels?: ChannelSplit;
  creditOutstanding: number;
  work: DayWork;
}

export interface InflationSplit extends SalesSummary {
  /** revenue − kg × latest purchase price on the sale day */
  tradingProfit: number;
  /** kg × latest purchase price − actual (FIFO) cost */
  inflationProfit: number;
  tradingShare: number;
  inflationShare: number;
  tradingPerKg: number;
  inflationPerKg: number;
  tradingMarkupPercent: number;
  generalInflationErosion: number;
  realProfit: number;
}

export interface InflationProduct extends InflationSplit {
  productId: string;
  name: string;
  costStart: number | null;
  costEnd: number | null;
  costInflationPercent: number;
  sellStart: number | null;
  sellEnd: number | null;
  sellChangePercent: number;
  purchasedKg: number;
  purchasedAmount: number;
  avgBuyPerKg: number | null;
  /** Average sell per kg over the last 7 / 30 / 90 days, independent of the report period. */
  sellAvg7: number | null;
  sellAvg30: number | null;
  sellAvg90: number | null;
  priceChanges: number;
  holdingGain: number;
  stockKg: number;
  lastCost: number;
  unrealizedGain: number;
}

export interface PriceChangeRow {
  productId: string;
  productName: string;
  date: string;
  invoiceId: string;
  invoiceNumber: string;
  oldCost: number;
  newCost: number;
  changePercent: number;
  stockKg: number;
  gain: number;
}

export interface InflationReport {
  summary: InflationSplit & {
    invoices: number;
    holdingGain: number;
    priceChanges: number;
  costInflationPercent: number;
  sellChangePercent: number;
  generalInflationAnnual: number;
  purchasedKg: number;
  purchasedAmount: number;
  avgBuyPerKg: number;
};
  stock: { kg: number; fifoValue: number; replacementValue: number; unrealizedGain: number };
  products: InflationProduct[];
  priceChanges: PriceChangeRow[];
  byDay: { date: string; kg: number; revenue: number; profit: number; tradingProfit: number; inflationProfit: number; sellPerKg: number; costPerKg: number }[];
}

/** `list`: pass purchase inflation onto the previous sell price. `recent` / `custom`: markup on the base cost. */
export type SuggestMode = 'list' | 'recent' | 'custom';
/** `replacement`: latest landed cost. `average`: weighted average of the stock on hand. */
export type CostBasis = 'replacement' | 'average';

export interface TierPrices {
  retail: number;
  supermarket: number;
  wholesale: number;
  perKg: number;
  /** Against the base cost (incl. inflation buffer). */
  profitPerKg: number;
}

export interface PriceSuggestion {
  productId: string;
  name: string;
  unit: string;
  weightPerUnitKg: number;
  /** False when the product has no kilo weight; prices are then per stock unit. */
  byWeight?: boolean;
  stockUnits: number;
  stockKg: number;
  /** Landed cost of the latest purchase (invoice price + freight share). */
  lastCostPerKg: number;
  lastCostPerUnit: number;
  lastInvoicePricePerKg: number;
  lastFreightPerKg: number;
  lastPurchaseDate: string | null;
  lastPurchaseInvoice: string | null;
  prevCostPerKg: number;
  /** Purchase inflation vs the previous purchase. */
  costChangePercent: number;
  avgCostPerKg: number;
  basis: CostBasis;
  costBasisPerKg: number;
  holdDays: number;
  holdDaysMeasured: number | null;
  monthlyInflation: number;
  bufferPercent: number;
  /** costBasisPerKg × (1 + bufferPercent). */
  baseCostPerKg: number;
  /** Base cost the current list price was set against. */
  priceBaseCostPerKg: number;
  costChangeSincePricePercent: number;
  priceSetAt: string | null;
  recentSellPerKg: number | null;
  recentMarkupPercent: number | null;
  current: TierPrices & { markupOnBaseCost: number | null };
  mode: SuggestMode;
  markupUsed: number;
  belowCost: boolean;
  /** A tier was lifted so it is not sold under the latest purchase cost. */
  lossGuarded?: boolean;
  suggested: TierPrices;
  changePercent: number | null;
  needsUpdate: boolean;
}

export interface PurchaseImpact {
  invoiceId: string;
  invoiceNumber: string;
  date: string;
  supplier: string;
  freight: number;
  holdingGain: number;
  items: {
    productId: string;
    name: string;
    kg: number;
    prevCostPerKg: number | null;
    newCostPerKg: number;
    invoicePricePerKg: number;
    freightPerKg: number;
    costChangePercent: number | null;
    stockKgHeld: number | null;
    holdingGain: number;
    isLatestPurchase: boolean;
    suggestion: PriceSuggestion | null;
  }[];
}

export interface SuggestQuery {
  mode?: SuggestMode;
  markup?: number;
  basis?: CostBasis;
  /** Expected monthly inflation (%). */
  inflation?: number;
  holdDays?: number;
}

export const accountingService = {
  async dashboard(today: string, monthFrom: string): Promise<AccountingDashboard> {
    return (await api.get('/accounting/dashboard', { params: { today, monthFrom } })).data;
  },
  async inventory(p: PeriodQuery = {}): Promise<InventoryReport> {
    return (await api.get('/accounting/inventory', { params: p })).data;
  },
  async profit(p: PeriodQuery = {}): Promise<ProfitReport> {
    return (await api.get('/accounting/profit', { params: p })).data;
  },
  async credit(p: PeriodQuery = {}): Promise<CreditReport> {
    return (await api.get('/accounting/credit', { params: p })).data;
  },
  async invoiceProfit(id: string): Promise<InvoiceProfit> {
    return (await api.get(`/accounting/invoice/${id}`)).data;
  },
  async inflation(p: PeriodQuery & { general?: number } = {}): Promise<InflationReport> {
    return (await api.get('/accounting/inflation', { params: p })).data;
  },
  async priceSuggestions(q: SuggestQuery = {}): Promise<PriceSuggestion[]> {
    return (await api.get('/accounting/price-suggestions', { params: q })).data;
  },
  async purchaseImpact(invoiceId: string, q: SuggestQuery = {}): Promise<PurchaseImpact> {
    return (await api.get(`/accounting/purchase-impact/${invoiceId}`, { params: q })).data;
  },
  /** Sets all three sell-price tiers and the unit purchase price in one go. */
  async applySuggestion(s: Pick<PriceSuggestion, 'productId' | 'suggested' | 'lastCostPerUnit' | 'baseCostPerKg'>, reason: string) {
    return (
      await api.patch(`/products/${s.productId}/price`, {
        newSellPrice: s.suggested.retail,
        priceSupermarket: s.suggested.supermarket,
        priceWholesale: s.suggested.wholesale,
        newBuyPrice: s.lastCostPerUnit,
        costBasisPerKg: s.baseCostPerKg,
        reason,
      })
    ).data;
  },
};
