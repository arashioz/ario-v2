import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IonPage, IonHeader, IonToolbar, IonContent, useIonViewWillEnter } from '@ionic/react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ClipboardList, FileCheck2, Minus, Plus, ShoppingCart, Trash2, Wand2 } from 'lucide-react';
import { productsService, type Product } from '../../services/products.service';
import { customersService, type Customer } from '../../services/customers.service';
import { apiErrorMessage, invoicesService, type Invoice } from '../../services/invoices.service';
import { proformasService, type Proforma } from '../../services/proformas.service';
import { SALE_TYPE_LABELS, saleTypeForKg, useSettings, type SaleType } from '../../services/settings.service';
import { useNotification } from '../../context/NotificationContext';
import { LoadingOverlay } from '../../components/LoadingOverlay';
import { InvoiceDateModal } from '../../components/pos/InvoiceDateModal';
import { InvoiceDetailModal } from '../../components/invoices/InvoiceDetailModal';
import { ProductBrowser } from '../../components/pos/ProductBrowser';
import { QuantitySheet } from '../../components/pos/QuantitySheet';
import { CheckoutSheet, type CheckoutResult } from '../../components/pos/CheckoutSheet';
import { ProformaSheet } from '../../components/proformas/ProformaSheet';
import { termsFinal, termsPayload } from '../../components/pos/PaymentTermsForm';
import { kgPerUnit, lineKg, lineTotal, r3, tierPrice, toInvoiceItem, type CartLine } from '../../components/pos/cart';
import { formatJalali, todayYmd } from '../../lib/jalali';
import { formatToman, num, weight } from '../../lib/format';

const TIERS: SaleType[] = ['retail', 'supermarket', 'wholesale'];

export const PosTab: React.FC = () => {
  const { showNotification } = useNotification();
  const navigate = useNavigate();
  const settings = useSettings();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [tierMode, setTierMode] = useState<'auto' | 'manual'>('auto');
  const [manualTier, setManualTier] = useState<SaleType>('retail');
  const [invoiceDate, setInvoiceDate] = useState<string>(todayYmd);
  const [dateOpen, setDateOpen] = useState(false);

  const [lines, setLines] = useState<CartLine[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const [createdInvoice, setCreatedInvoice] = useState<Invoice | null>(null);
  const [createdProforma, setCreatedProforma] = useState<Proforma | null>(null);
  const [pendingProformas, setPendingProformas] = useState(0);

  const loadPending = useCallback(() => {
    proformasService.summary().then((s) => setPendingProformas(s.pendingCount)).catch(() => undefined);
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);
  useIonViewWillEnter(loadPending);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [prods, custs] = await Promise.all([productsService.getAll(), customersService.getAll()]);
      setProducts(prods);
      setCustomers(custs);
    } catch {
      showNotification({ title: 'خطا در بارگذاری', message: 'امکان اتصال به سرور وجود ندارد.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalKg = useMemo(() => lines.reduce((s, l) => s + lineKg(l), 0), [lines]);
  const subtotal = useMemo(() => lines.reduce((s, l) => s + lineTotal(l), 0), [lines]);
  const auto = tierMode === 'auto' && settings.autoSaleType;
  const saleType: SaleType = auto ? saleTypeForKg(totalKg, settings) : manualTier;

  // Lines without a hand-typed price follow the active tier.
  useEffect(() => {
    setLines((prev) => {
      let changed = false;
      const next = prev.map((l) => {
        if (l.priceOverride) return l;
        const p = tierPrice(l.product, saleType);
        if (p === l.unitPrice) return l;
        changed = true;
        return { ...l, unitPrice: p };
      });
      return changed ? next : prev;
    });
  }, [saleType]);

  const inCart = useMemo(() => new Map(lines.map((l) => [l.product._id, l.quantity])), [lines]);
  const editingLine = editing ? lines.find((l) => l.product._id === editing._id) : undefined;

  const upsert = (line: CartLine) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.product._id === line.product._id);
      if (i < 0) return [...prev, line];
      const next = [...prev];
      next[i] = line;
      return next;
    });
    setEditing(null);
  };

  const remove = (id: string) => {
    setLines((prev) => prev.filter((l) => l.product._id !== id));
    setEditing(null);
  };

  const step = (l: CartLine, delta: number) => {
    const q = r3(l.quantity + delta);
    if (q <= 0) return remove(l.product._id);
    if (q > (l.product.stock ?? 0)) {
      showNotification({ title: 'موجودی کافی نیست', message: `موجودی ${l.product.name}: ${num(l.product.stock)} ${l.product.unit}`, type: 'error' });
      return;
    }
    upsert({ ...l, quantity: q });
  };

  const nextTierHint = useMemo(() => {
    if (!auto) return '';
    if (saleType === 'retail') return `${num(Math.max(0, settings.supermarketMinKg - totalKg), 1)} کیلو تا قیمت سوپرمارکت`;
    if (saleType === 'supermarket') return `${num(Math.max(0, settings.wholesaleMinKg - totalKg), 1)} کیلو تا قیمت عمده`;
    return 'قیمت عمده فعال است';
  }, [auto, saleType, totalKg, settings]);

  const toggleAuto = () => {
    if (auto) {
      setManualTier(saleType);
      setTierMode('manual');
    } else {
      setTierMode('auto');
    }
  };

  const submit = async ({ customer, terms, asProforma, fulfillment }: CheckoutResult) => {
    const final = termsFinal(subtotal, terms);
    const input = {
      type: 'sale' as const,
      saleType,
      customerId: customer?._id,
      customerName: customer?.name ?? 'مشتری حضوری',
      customerPhone: customer?.phoneNumber || undefined,
      invoiceDate,
      items: lines.map(toInvoiceItem),
      totalAmount: subtotal,
      finalAmount: final,
      totalWeightKg: Math.round(totalKg * 10) / 10,
      ...termsPayload(final, terms),
      fulfillment: asProforma ? 'shop' as const : fulfillment,
    };
    try {
      setSubmitting(true);
      if (asProforma) {
        const p = await proformasService.create(input);
        showNotification({
          title: 'پیش‌فاکتور ثبت شد',
          message: `${p.number} تا زمان ارسال بار در «پیش‌فاکتورها» می‌ماند و از انبار کسر نمی‌شود.`,
          type: 'success',
        });
        setCreatedProforma(p);
        loadPending();
      } else {
        const inv = await invoicesService.create(input);
        showNotification({
          title: 'فاکتور صادر شد',
          message: `فاکتور ${inv.invoiceNumber} به مبلغ ${formatToman(inv.finalAmount)} ثبت شد.`,
          type: 'success',
        });
        setCreatedInvoice(inv);
        loadData();
      }
      setLines([]);
      setCheckoutOpen(false);
      setTierMode('auto');
    } catch (err) {
      showNotification({ title: 'ثبت انجام نشد', message: apiErrorMessage(err, 'خطا در صدور فاکتور'), type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const tiersBlock = (
    <div className="bg-white rounded-3xl p-1.5 border border-sky-100 shadow-sm">
      <div className="grid gap-1 grid-cols-3">
        {TIERS.map((t) => (
          <button
            key={t}
            onClick={() => {
              setManualTier(t);
              setTierMode('manual');
            }}
            className={`py-2 rounded-2xl text-[11px] font-bold transition ${
              saleType === t ? (auto ? 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' : 'bg-sky-600 text-white shadow') : 'text-slate-500'
            }`}
          >
            {SALE_TYPE_LABELS[t]}
          </button>
        ))}
      </div>
      {auto && (
        <p className="text-[10px] text-violet-600 text-center pt-1.5 pb-0.5">
          زیر {num(settings.supermarketMinKg)} کیلو تک · از {num(settings.supermarketMinKg)} سوپرمارکت · از {num(settings.wholesaleMinKg)} عمده
          {lines.length > 0 && <span className="text-slate-400"> — {nextTierHint}</span>}
        </p>
      )}
    </div>
  );

  const cartBlock = lines.length > 0 && (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <ShoppingCart className="w-4 h-4 text-sky-600" /> سبد ({num(lines.length)} قلم)
        </span>
        <button onClick={() => setLines([])} className="text-[11px] text-rose-500 font-bold flex items-center gap-1">
          <Trash2 className="w-3.5 h-3.5" /> خالی کردن
        </button>
      </div>
      <div className="divide-y divide-slate-100">
        {lines.map((l) => {
          const perKg = kgPerUnit(l.product);
          return (
            <div key={l.product._id} className="px-3 py-2.5 flex items-center gap-2">
              <button onClick={() => setEditing(l.product)} className="flex-1 min-w-0 text-right">
                <div className="text-xs font-bold text-slate-800 truncate">{l.product.name}</div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">
                  {formatToman(l.unitPrice)} هر {l.product.unit}
                  {l.priceOverride && <span className="text-amber-600"> (دستی)</span>}
                </div>
                {perKg > 0 && perKg !== 1 && (
                  <div className="text-[10px] text-slate-500 font-mono truncate">
                    {formatToman(Math.round(l.unitPrice / perKg))} هر کیلو · {weight(lineKg(l))}
                  </div>
                )}
                <div className="text-[11px] font-mono font-bold text-sky-700 mt-0.5">{formatToman(lineTotal(l))}</div>
              </button>
              <div className="flex items-center gap-1 bg-slate-50 rounded-2xl p-1 shrink-0">
                <button onClick={() => step(l, 1)} className="w-8 h-8 rounded-xl bg-white shadow-sm flex items-center justify-center text-sky-600 active:scale-90">
                  <Plus className="w-4 h-4" />
                </button>
                <button onClick={() => setEditing(l.product)} className="min-w-[42px] px-1 text-center">
                  <div className="text-xs font-bold font-mono text-slate-800">{num(l.quantity, 3)}</div>
                  <div className="text-[9px] text-slate-400">{l.product.unit}</div>
                </button>
                <button onClick={() => step(l, -1)} className="w-8 h-8 rounded-xl bg-white shadow-sm flex items-center justify-center text-rose-500 active:scale-90">
                  <Minus className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar className="bg-white/95 backdrop-blur-md px-4 py-2 border-b border-sky-100">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              <h1 className="text-sm font-semibold text-slate-800">فروش</h1>
              {settings.autoSaleType && (
                <button
                  role="switch"
                  aria-checked={auto}
                  onClick={toggleAuto}
                  className={`flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full text-[11px] font-bold border transition ${
                    auto ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-slate-50 text-slate-500 border-slate-200'
                  }`}
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  خودکار
                  <span className={`relative w-8 h-[18px] rounded-full transition ${auto ? 'bg-violet-600' : 'bg-slate-300'}`}>
                    <span
                      className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${
                        auto ? 'left-[2px]' : 'left-[16px]'
                      }`}
                    />
                  </span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => navigate('/proformas')}
                className={`relative flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-bold border active:scale-95 ${
                  pendingProformas > 0
                    ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/30'
                    : 'bg-amber-50 text-amber-700 border-amber-200/60'
                }`}
                aria-label="پیش‌فاکتورها"
              >
                <ClipboardList className="w-5 h-5" />
                پیش‌فاکتور
                {pendingProformas > 0 && (
                  <span className="absolute -top-2 -left-2 min-w-[20px] h-5 px-1 rounded-full bg-rose-600 text-white text-[11px] font-bold font-mono flex items-center justify-center ring-2 ring-white animate-pulse">
                    {num(pendingProformas)}
                  </span>
                )}
              </button>
              <button
                onClick={() => setDateOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-sky-50 text-sky-700 text-xs font-medium border border-sky-200/60 active:scale-95"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>{invoiceDate === todayYmd() ? 'امروز' : formatJalali(invoiceDate, { year: false })}</span>
              </button>
            </div>
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="bg-slate-50">
        <LoadingOverlay isOpen={loading && !products.length} message="در حال دریافت کالاها و مشتریان..." />

        <div className={`p-3 max-w-md mx-auto ${lines.length ? 'pb-24' : 'pb-6'}`}>
          <ProductBrowser
            products={products}
            saleType={saleType}
            inCart={inCart}
            onPick={setEditing}
            view={settings.posView}
            categoryOrder={settings.categoryOrder}
            subcategoryOrder={settings.subcategoryOrder}
            productOrder={settings.productOrder}
            layout={settings.posSections}
            slots={{ tiers: tiersBlock, cart: cartBlock }}
          />
        </div>

        {lines.length > 0 && (
          <div
            slot="fixed"
            className="absolute inset-x-0 bottom-2 z-20 px-3"
          >
            <button
              onClick={() => setCheckoutOpen(true)}
              className="max-w-md mx-auto w-full flex items-center justify-between gap-3 rounded-2xl bg-sky-600 text-white pr-4 pl-2 py-2 shadow-lg shadow-sky-900/25 active:scale-[0.99] transition"
            >
              <div className="text-right min-w-0">
                <div className="text-[10px] text-sky-100 truncate">
                  {num(lines.length)} قلم · {weight(totalKg)} · {SALE_TYPE_LABELS[saleType]}
                </div>
                <div className="text-[15px] font-extrabold font-mono">{formatToman(subtotal)}</div>
              </div>
              <span className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white text-sky-700 text-sm font-bold">
                <FileCheck2 className="w-4 h-4" />
                ثبت فاکتور
              </span>
            </button>
          </div>
        )}

        <QuantitySheet
          product={editing}
          saleType={saleType}
          existing={editingLine}
          onClose={() => setEditing(null)}
          onConfirm={upsert}
          onRemove={remove}
        />

        <CheckoutSheet
          open={checkoutOpen}
          onClose={() => !submitting && setCheckoutOpen(false)}
          saleType={saleType}
          subtotal={subtotal}
          totalKg={totalKg}
          itemCount={lines.length}
          customers={customers}
          onCustomerCreated={(c) => setCustomers((prev) => [c, ...prev])}
          settings={settings}
          submitting={submitting}
          onSubmit={submit}
        />

        <ProformaSheet
          proforma={createdProforma}
          onClose={() => setCreatedProforma(null)}
          onChanged={(p) => {
            setCreatedProforma(p.status === 'pending' ? p : null);
            loadPending();
          }}
          onShipped={(inv) => {
            setCreatedProforma(null);
            setCreatedInvoice(inv);
            loadData();
            loadPending();
          }}
        />

        <InvoiceDateModal
          isOpen={dateOpen}
          currentDate={invoiceDate}
          max={todayYmd()}
          onClose={() => setDateOpen(false)}
          onSelectDate={setInvoiceDate}
        />

        <InvoiceDetailModal isOpen={!!createdInvoice} invoice={createdInvoice} onClose={() => setCreatedInvoice(null)} />
      </IonContent>
    </IonPage>
  );
};
