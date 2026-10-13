import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IonPage, IonHeader, IonToolbar, IonContent, useIonViewWillEnter } from '@ionic/react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ClipboardList, Factory, FileCheck2, Minus, Plus, ShoppingCart, Sparkles, Trash2 } from 'lucide-react';
import { productsService, type Product } from '../../services/products.service';
import { customersService, type Customer } from '../../services/customers.service';
import { apiErrorMessage, type Invoice } from '../../services/invoices.service';
import { enqueueOrder, sendOrder, ORDERS_SYNCED, reserveQueuedStock, pendingOrders } from '../../services/offlineOrders';
import { proformasService, type Proforma } from '../../services/proformas.service';
import { SALE_TYPE_LABELS, SALE_TYPE_TONE, saleTypeForKg, useSettings, type SaleType } from '../../services/settings.service';
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
import './PosTab.css';

const TIERS: SaleType[] = ['retail', 'supermarket', 'wholesale'];

export const PosTab: React.FC = () => {
  const { showNotification } = useNotification();
  const navigate = useNavigate();
  const settings = useSettings();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [tierMode, setTierMode] = useState<'auto' | 'manual'>('manual');
  const [manualTier, setManualTier] = useState<SaleType | null>(null);
  const hasInvoiceType = manualTier !== null;
  const [invoiceDate, setInvoiceDate] = useState<string>(todayYmd);
  const [dateOpen, setDateOpen] = useState(false);

  const [lines, setLines] = useState<CartLine[]>([]);
  const [shipFrom, setShipFrom] = useState<'shop' | 'factory'>('shop');
  const fromFactory = shipFrom === 'factory' && !!settings.factorySalesEnabled;
  const [editing, setEditing] = useState<Product | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [preparingCheckout, setPreparingCheckout] = useState(false);
  const checkoutRequest = useRef(false);
  const submittingRef = useRef(false);
  const productRequest = useRef<Promise<void> | null>(null);
  const productVersion = useRef(0);
  const pendingRequest = useRef<Promise<void> | null>(null);

  const pickProduct = useCallback((product: Product) => {
    if (hasInvoiceType) setEditing(product);
  }, [hasInvoiceType]);
  // The required first step always stays above the configurable product sections.
  const productLayout = useMemo(() => settings.posSections.filter((section) => section.id !== 'tiers'), [settings.posSections]);

  const [createdInvoice, setCreatedInvoice] = useState<Invoice | null>(null);
  const [createdProforma, setCreatedProforma] = useState<Proforma | null>(null);
  const [pendingProformas, setPendingProformas] = useState(0);

  const loadPending = useCallback(() => {
    if (pendingRequest.current) return pendingRequest.current;
    const request = proformasService.summary().then((s) => setPendingProformas(s.pendingCount))
      .catch(() => undefined).finally(() => { pendingRequest.current = null; });
    pendingRequest.current = request;
    return request;
  }, []);

  // Ionic entry and React mount can fire together. Share only the active request;
  // a later visit always asks the server for fresh prices and stock.
  const loadData = useCallback((force = false) => {
    if (!force && productRequest.current) return productRequest.current;
    const version = ++productVersion.current;
    setLoading(true);
    const request = productsService.getForSale().then((prods) => {
      if (version === productVersion.current) setProducts(reserveQueuedStock(prods));
    }).catch(() => {
      if (version === productVersion.current) showNotification({ title: 'خطا در بارگذاری', message: 'دریافت کالاها انجام نشد؛ دوباره تلاش کنید.', type: 'error' });
    }).finally(() => {
      if (version === productVersion.current) { setLoading(false); productRequest.current = null; }
    });
    productRequest.current = request;
    return request;
  }, [showNotification]);

  useEffect(() => { void loadData(); void loadPending(); }, [loadData, loadPending]);
  useEffect(() => {
    const refresh = () => { void loadData(true); void loadPending(); };
    window.addEventListener(ORDERS_SYNCED, refresh);
    // Keep the customer picker usable on the next offline visit.
    if (navigator.onLine) void customersService.getAll().then(setCustomers).catch(() => undefined);
    return () => window.removeEventListener(ORDERS_SYNCED, refresh);
  }, [loadData, loadPending]);
  useIonViewWillEnter(() => { void loadData(); void loadPending(); });

  const openCheckout = async () => {
    if (!hasInvoiceType || !lines.length || checkoutRequest.current) return;
    checkoutRequest.current = true;
    setPreparingCheckout(true);
    try {
      const list = await customersService.getAll();
      setCustomers(list);
      setCheckoutOpen(true);
    } catch {
      setCheckoutOpen(true);
      showNotification({ title: 'دسترسی محدود به مشتریان', message: 'می‌توانید مشتری ذخیره‌شده یا خرید حضوری را انتخاب کنید.', type: 'warning' });
    } finally {
      checkoutRequest.current = false;
      setPreparingCheckout(false);
    }
  };

  const totalKg = useMemo(() => lines.reduce((s, l) => s + lineKg(l), 0), [lines]);
  const subtotal = useMemo(() => lines.reduce((s, l) => s + lineTotal(l), 0), [lines]);
  const auto = hasInvoiceType && tierMode === 'auto' && settings.autoSaleType;
  const saleType: SaleType = auto ? saleTypeForKg(totalKg, settings) : manualTier ?? 'retail';

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
    if (!hasInvoiceType) return;
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
    if (!fromFactory && q > (l.product.stock ?? 0)) {
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
    if (!hasInvoiceType) return;
    if (auto) {
      setManualTier(saleType);
      setTierMode('manual');
    } else {
      setTierMode('auto');
    }
  };

  const submit = async ({ customer, terms, asProforma, fulfillment, factoryUnitCosts, factorySellPrices, branchName, customerName, customerPhone }: CheckoutResult) => {
    if (!hasInvoiceType || !lines.length || submittingRef.current) return;
    submittingRef.current = true;
    const items = lines.map((l) => {
      const base = toInvoiceItem(l);
      const unitPrice = Math.round(factorySellPrices?.[l.product._id] ?? base.unitPrice);
      return {
        ...base,
        unitPrice,
        totalPrice: Math.round(base.quantity * unitPrice),
        ...(fulfillment === 'factory'
          ? { factoryUnitCost: Math.round(factoryUnitCosts?.[l.product._id] || 0) }
          : {}),
      };
    });
    const goods = items.reduce((s, it) => s + it.totalPrice, 0);
    const final = termsFinal(goods, terms);
    const input = {
      type: 'sale' as const,
      saleType,
      customerId: customer?._id,
      customerName: customer?.name || customerName || 'مشتری حضوری',
      customerPhone: customer?.phoneNumber || customerPhone || undefined,
      invoiceDate,
      items,
      totalAmount: goods,
      finalAmount: final,
      totalWeightKg: Math.round(totalKg * 10) / 10,
      ...termsPayload(final, terms),
      fulfillment,
      branchName,
    };
    try {
      setSubmitting(true);
      const order = enqueueOrder(asProforma ? 'proforma' : 'invoice', input);
      const saved = await sendOrder(order);
      if (!saved) {
        const needsReview = pendingOrders().find((pending) => pending.id === order.id)?.review;
        showNotification({ title: needsReview ? 'سفارش نیاز به بررسی دارد' : 'سفارش روی دستگاه ذخیره شد', message: needsReview ? 'سفارش حذف نشده است؛ خطای ثبت را در صف دستگاه بررسی کنید.' : 'پس از اتصال، ثبت خودکار انجام می‌شود. وضعیت سفارش در صف دستگاه قابل مشاهده است.', type: needsReview ? 'warning' : 'info' });
        void loadData(true);
      } else if (asProforma) {
        const p = saved as Proforma;
        showNotification({
          title: 'پیش‌فاکتور ثبت شد',
          message:
            fulfillment === 'factory'
              ? `${p.number} از کارخانه ثبت شد. با ارسال، از موجودی آریو کم نمی‌شود.`
              : `${p.number} تا زمان ارسال بار در «پیش‌فاکتورها» می‌ماند و از انبار کسر نمی‌شود.`,
          type: 'success',
        });
        setCreatedProforma(p);
        loadPending();
      } else {
        const inv = saved as Invoice;
        const split = inv.splitInto;
        showNotification({
          title: 'فاکتور صادر شد',
          message: split?.length
            ? `${split.length} فاکتور جدا برای شرکت‌ها ثبت شد: ${split.map((s) => `${s.invoiceNumber} (${s.supplierCompany})`).join('، ')}`
            : fulfillment === 'factory'
              ? `فاکتور ${inv.invoiceNumber} ثبت شد. از موجودی آریو کم نشد و خرید شرکت مادر هم ثبت شد.`
              : `فاکتور ${inv.invoiceNumber} به مبلغ ${formatToman(inv.finalAmount)} ثبت شد.`,
          type: 'success',
        });
        setCreatedInvoice(inv);
        void loadData(true);
      }
      setLines([]);
      setCheckoutOpen(false);
      setTierMode('manual');
      setManualTier(null);
    } catch (err) {
      showNotification({ title: 'ثبت انجام نشد', message: apiErrorMessage(err, 'خطا در صدور فاکتور'), type: 'error' });
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  const tiersBlock = (
    <section className="space-y-1.5 mb-3" aria-label="نوع فاکتور">
      {(auto || fromFactory || pendingProformas > 0) && (
        <div className="flex flex-wrap gap-1.5 px-0.5">
          {auto && <span className="text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-lg">خودکار فعال است</span>}
          {fromFactory && <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-lg">کارخانه فعال است</span>}
          {pendingProformas > 0 && <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-lg">پیش‌فاکتور فعال است</span>}
        </div>
      )}
    <div className="bg-white rounded-3xl p-1.5 border border-sky-100 shadow-sm">
      <div className="grid gap-1 grid-cols-3">
        {TIERS.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={hasInvoiceType && saleType === t}
            onClick={() => {
              setManualTier(t);
              setTierMode('manual');
            }}
            className={`py-2 rounded-2xl text-[11px] font-bold transition ${
              hasInvoiceType && saleType === t ? `${SALE_TYPE_TONE[t].solid} shadow` : 'text-slate-500 bg-slate-50'
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
    </section>
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
    <IonPage className="pos-page">
      <IonHeader className="ion-no-border">
        <IonToolbar className="pos-toolbar px-4 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              <div className="flex items-center gap-2"><span className="pos-brand-icon"><ShoppingCart className="w-4 h-4" /></span><h1 className="text-sm font-bold text-white">فروش</h1></div>
              {settings.autoSaleType && (
                <button
                  type="button"
                  onClick={toggleAuto}
                  disabled={!hasInvoiceType}
                  aria-label="خودکار"
                  title="خودکار"
                  className={`w-8 h-8 rounded-xl flex items-center justify-center border active:scale-95 disabled:opacity-40 ${
                    auto ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-500 border-slate-200'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                </button>
              )}
              {settings.factorySalesEnabled && (
                <button
                  type="button"
                  onClick={() => setShipFrom((v) => (v === 'factory' ? 'shop' : 'factory'))}
                  aria-label="کارخانه"
                  title="کارخانه"
                  className={`w-8 h-8 rounded-xl flex items-center justify-center border active:scale-95 ${
                    fromFactory ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-500 border-slate-200'
                  }`}
                >
                  <Factory className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => navigate('/proformas')}
                className={`relative w-9 h-9 rounded-2xl flex items-center justify-center border active:scale-95 ${
                  pendingProformas > 0
                    ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/30'
                    : 'bg-amber-50 text-amber-700 border-amber-200/60'
                }`}
                aria-label="پیش‌فاکتور"
                title="پیش‌فاکتور"
              >
                <ClipboardList className="w-4 h-4" />
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
                <span>{formatJalali(invoiceDate, { year: false })}</span>
              </button>
            </div>
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent className="pos-content">
        <LoadingOverlay isOpen={loading && !products.length} message="در حال دریافت کالاها..." />

        <div className={`pos-workspace p-3 max-w-md mx-auto ${lines.length ? 'pb-24' : 'pb-6'}`}>
          {tiersBlock}
          <p id="pos-product-instruction" role="status" className="mb-3 px-1 text-xs text-blue-100">
            {hasInvoiceType ? 'محصولات سفارش را انتخاب کنید' : 'برای فعال شدن محصولات، ابتدا نوع فاکتور را از بالا انتخاب کنید.'}
          </p>
          {!loading && !products.length && <button onClick={() => void loadData()} className="mb-3 text-xs text-white underline">دریافت دوبارهٔ کالاها</button>}
          <fieldset disabled={!hasInvoiceType} aria-describedby="pos-product-instruction" className={`m-0 min-w-0 border-0 p-0 ${hasInvoiceType ? '' : 'pos-products-locked'}`}>
          <legend className="sr-only">محصولات سفارش</legend>
          <ProductBrowser
            products={products}
            saleType={saleType}
            inCart={inCart}
            onPick={pickProduct}
            view={settings.posView}
            categoryOrder={settings.categoryOrder}
            subcategoryOrder={settings.subcategoryOrder}
            productOrder={settings.productOrder}
            layout={productLayout}
            slots={{ cart: cartBlock }}
            ignoreStock={fromFactory}
          />
          </fieldset>
        </div>

        {lines.length > 0 && (
          <div
            slot="fixed"
            className="absolute inset-x-0 bottom-2 z-20 px-3"
          >
            <button
              onClick={() => void openCheckout()}
              disabled={preparingCheckout}
              className={`max-w-md mx-auto w-full flex items-center justify-between gap-3 rounded-2xl text-white pr-4 pl-2 py-2 shadow-lg active:scale-[0.99] transition ${
                fromFactory ? 'bg-amber-600 shadow-amber-900/25' : 'pos-checkout-button'
              }`}
            >
              <div className="text-right min-w-0">
                <div className={`text-[10px] truncate ${fromFactory ? 'text-amber-100' : 'text-sky-100'}`}>
                  {num(lines.length)} قلم · {weight(totalKg)} · {SALE_TYPE_LABELS[saleType]}
                </div>
                <div className="text-[15px] font-extrabold font-mono">{formatToman(subtotal)}</div>
              </div>
              <span className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white text-sm font-bold ${fromFactory ? 'text-amber-700' : 'text-sky-700'}`}>
                <FileCheck2 className="w-4 h-4" />
                {preparingCheckout ? 'آماده‌سازی…' : 'ثبت فاکتور'}
              </span>
            </button>
          </div>
        )}

        {editing && <QuantitySheet
          product={editing}
          saleType={saleType}
          existing={editingLine}
          onClose={() => setEditing(null)}
          onConfirm={upsert}
          onRemove={remove}
          ignoreStock={fromFactory}
        />}

        {checkoutOpen && <CheckoutSheet
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
          shipFrom={fromFactory ? 'factory' : 'shop'}
          factoryLines={lines.map((l) => ({
            productId: l.product._id,
            name: l.product.name,
            unit: l.product.unit,
            quantity: l.quantity,
            buyPrice: l.product.buyPrice || 0,
            sellPrice: l.unitPrice,
            priceWholesale: l.product.priceWholesale || 0,
            kgPerUnit: kgPerUnit(l.product),
          }))}
        />}

        {createdProforma && <ProformaSheet
          proforma={createdProforma}
          onClose={() => setCreatedProforma(null)}
          onChanged={(p) => {
            setCreatedProforma(p.status === 'pending' ? p : null);
            loadPending();
          }}
          onShipped={(inv) => {
            setCreatedProforma(null);
            setCreatedInvoice(inv);
            void loadData(true);
            loadPending();
          }}
        />}

        {dateOpen && <InvoiceDateModal
          isOpen={dateOpen}
          currentDate={invoiceDate}
          max={todayYmd()}
          onClose={() => setDateOpen(false)}
          onSelectDate={setInvoiceDate}
        />}

        {createdInvoice && <InvoiceDetailModal isOpen invoice={createdInvoice} onClose={() => setCreatedInvoice(null)} />}
      </IonContent>
    </IonPage>
  );
};
