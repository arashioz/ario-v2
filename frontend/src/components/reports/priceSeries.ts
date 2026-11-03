import type { PriceChartProduct } from '../../services/watch.service';
import type { ChartSeries } from './PriceChart';
import { num, weight } from '../../lib/format';

export type ChartUnit = 'kg' | 'unit';
export type ChartView = 'all' | 'compare' | 'purchase' | 'sale' | 'changes';

const COLORS = { purchase: '#d97706', sale: '#0284c7', list: '#7c3aed', change: '#be123c' };
const tehranDay = (ymd: string) => new Date(`${ymd}T12:00:00+03:30`).getTime();
const ts = (iso: string) => new Date(iso).getTime();

export function buildPriceSeries(p: PriceChartProduct, unit: ChartUnit, view: ChartView): ChartSeries[] {
  const k = unit === 'unit' ? p.weightPerUnitKg || 1 : 1;
  const sortedPurchases = [...p.purchases].sort((a, b) => ts(a.date) - ts(b.date));
  const buyPoints = sortedPurchases.map((b) => ({
    t: ts(b.date),
    y: b.costPerKg * k,
    note: `${b.invoiceNumber} · ${b.supplier ? `${b.supplier} · ` : ''}${weight(b.kg)}`,
  }));
  if (buyPoints.length > 0) {
    const last = buyPoints[buyPoints.length - 1];
    if (Date.now() - last.t > 3600000) {
      buyPoints.push({ t: Date.now(), y: last.y, note: `امتداد آخرین نرخ خرید (${num(last.y)})` });
    }
  }
  const purchaseSeries: ChartSeries = {
    key: 'purchase',
    label: 'خرید',
    color: COLORS.purchase,
    mode: 'line',
    points: buyPoints,
  };
  const saleSeries: ChartSeries = {
    key: 'sale',
    label: 'فروش',
    color: COLORS.sale,
    mode: 'line',
    points: p.sales.map((s) => ({ t: tehranDay(s.date), y: s.avgPerKg * k, note: `${weight(s.kg)} در ${num(s.count)} ردیف` })),
    band: p.sales.map((s) => ({ t: tehranDay(s.date), lo: s.minPerKg * k, hi: s.maxPerKg * k })),
  };
  const listSeries: ChartSeries = {
    key: 'list',
    label: 'قیمت لیست',
    color: COLORS.list,
    mode: 'step',
    points: [
      ...p.list.filter((l) => l.perKg).map((l) => ({ t: ts(l.date), y: (l.perKg as number) * k, note: l.by ? `تغییر توسط ${l.by}` : undefined })),
      ...(p.current.retailPerKg ? [{ t: Date.now(), y: p.current.retailPerKg * k }] : []),
    ],
  };
  const changePoints = [...(p.changes || [])]
    .sort((a, b) => ts(a.date) - ts(b.date))
    .map((c) => ({
      t: ts(c.date),
      y: unit === 'unit' ? c.unitPrice : c.pricePerKg,
      note: `${c.invoiceNumber} · قیمت این بازه`,
    }));
  if (changePoints.length > 0 && Date.now() - changePoints[changePoints.length - 1].t > 3600000) {
    const last = changePoints[changePoints.length - 1];
    changePoints.push({ t: Date.now(), y: last.y, note: 'قیمت فعلی' });
  }
  const changeSeries: ChartSeries = {
    key: 'changes',
    label: 'تغییر قیمت خرید',
    color: COLORS.change,
    mode: 'step',
    points: changePoints,
  };
  if (view === 'changes') return [changeSeries];
  if (view === 'purchase') return [purchaseSeries];
  if (view === 'sale') return [saleSeries, listSeries];
  if (view === 'compare') return [saleSeries, purchaseSeries];
  return [saleSeries, purchaseSeries, listSeries];
}

export { COLORS as PRICE_CHART_COLORS, tehranDay, ts };
