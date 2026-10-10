import React, { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Phone } from 'lucide-react';
import { customersService } from '../../services/customers.service';
import type { Customer } from '../../services/customers.service';
import { productsService } from '../../services/products.service';
import type { CatalogTier } from '../../services/products.service';
import { catalogUrl } from '../products/CatalogShareSheet';
import { useSettings } from '../../services/settings.service';
import { useNotification } from '../../context/NotificationContext';
import { Sheet } from '../ui/Sheet';
import { catalogLinkSms, openSms, priceListSms } from '../../lib/sms';
import { formatToman } from '../../lib/format';

type SegmentId = 'supermarket' | 'wholesale' | 'retail' | 'debt' | 'quiet';

const DAY = 86400000;
const QUIET_DAYS = 21;

const tierOf = (c: Customer): CatalogTier =>
  c.customerType === 'supermarket' || c.customerType === 'wholesale' ? c.customerType : 'retail';

const SEGMENTS: { id: SegmentId; title: string; hint: string; tone: string }[] = [
  { id: 'supermarket', title: 'سوپرمارکت', hint: 'لیست قیمت سوپرمارکت', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { id: 'wholesale', title: 'بنکدار', hint: 'لیست قیمت عمده', tone: 'bg-violet-50 text-violet-800 border-violet-200' },
  { id: 'retail', title: 'تک‌فروشی', hint: 'لیست قیمت تکی', tone: 'bg-sky-50 text-sky-800 border-sky-200' },
  { id: 'debt', title: 'بدهکار', hint: 'مانده دارند', tone: 'bg-rose-50 text-rose-800 border-rose-200' },
  { id: 'quiet', title: 'مدتی نیامده', hint: `بیش از ${QUIET_DAYS} روز خرید نکرده`, tone: 'bg-amber-50 text-amber-900 border-amber-200' },
];

const inSegment = (c: Customer, id: SegmentId, now: number) => {
  if (id === 'debt') return c.balance > 0;
  if (id === 'quiet') {
    if (c.kind === 'walkin') return false;
    const last = c.lastTransactionDate ? new Date(c.lastTransactionDate).getTime() : 0;
    return !last || now - last >= QUIET_DAYS * DAY;
  }
  if (c.kind === 'walkin') return false;
  if (id === 'supermarket') return c.customerType === 'supermarket';
  if (id === 'wholesale') return c.customerType === 'wholesale';
  return c.customerType !== 'supermarket' && c.customerType !== 'wholesale';
};

/** Customers grouped so a price list can be sent to the matching tier. */
export const CustomerSegments: React.FC = () => {
  const settings = useSettings();
  const { showNotification } = useNotification();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [segment, setSegment] = useState<SegmentId>('supermarket');
  const [target, setTarget] = useState<Customer | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    customersService.getCustomers().then(setCustomers).catch(() => setCustomers([]));
  }, []);

  const now = Date.now();
  const groups = useMemo(() => {
    const map = {} as Record<SegmentId, Customer[]>;
    for (const s of SEGMENTS) map[s.id] = customers.filter((c) => inSegment(c, s.id, now));
    return map;
  }, [customers, now]);

  const list = groups[segment] || [];
  const meta = SEGMENTS.find((s) => s.id === segment)!;

  const send = async (mode: 'link' | 'text') => {
    if (!target) return;
    const tier = tierOf(target);
    const url = catalogUrl(tier);
    setSending(true);
    try {
      if (mode === 'link') {
        await openSms(target.phoneNumber, catalogLinkSms(settings.shopName, tier, url));
      } else {
        const catalog = await productsService.getCatalog(tier);
        await openSms(target.phoneNumber, priceListSms(catalog.shopName || settings.shopName, tier, url, catalog.products));
      }
      setTarget(null);
    } catch {
      showNotification({ title: 'پیامک', message: 'لیست قیمت آماده نشد.', type: 'error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {SEGMENTS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSegment(s.id)}
            className={`rounded-2xl border px-3 py-2.5 text-right ${segment === s.id ? s.tone : 'bg-white border-slate-100 text-slate-600'}`}
          >
            <div className="text-xs font-bold">{s.title}</div>
            <div className="text-[10px] mt-0.5 opacity-80">
              {groups[s.id].length.toLocaleString('fa-IR')} نفر · {s.hint}
            </div>
          </button>
        ))}
      </div>

      <div className="text-[11px] text-slate-500 px-1">
        {meta.title}: {list.length.toLocaleString('fa-IR')} مشتری
      </div>

      <div className="space-y-2">
        {list.length === 0 && <div className="bg-white rounded-2xl p-4 text-center text-xs text-slate-400">کسی در این دسته نیست.</div>}
        {list.map((c) => (
          <div key={c._id} className="bg-white rounded-2xl border border-slate-100 px-3 py-2.5 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-slate-800 truncate">{c.name}</div>
              <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                <span className="font-mono" dir="ltr">{c.phoneNumber || 'بدون شماره'}</span>
                {c.balance > 0 && <span className="text-rose-600">بدهکار {formatToman(c.balance)}</span>}
              </div>
            </div>
            {c.phoneNumber ? (
              <button
                onClick={() => setTarget(c)}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-600 text-white text-[11px] font-bold"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                قیمت
              </button>
            ) : (
              <Phone className="w-4 h-4 text-slate-300" />
            )}
          </div>
        ))}
      </div>

      <Sheet open={!!target} onClose={() => !sending && setTarget(null)} title={target?.name || ''} subtitle="لیست قیمت برای این مشتری">
        <button
          disabled={sending}
          onClick={() => void send('link')}
          className="w-full py-3 rounded-2xl bg-sky-600 text-white text-sm font-bold"
        >
          پیامک لینک کاتالوگ
        </button>
        <button
          disabled={sending}
          onClick={() => void send('text')}
          className="w-full py-3 rounded-2xl bg-emerald-600 text-white text-sm font-bold"
        >
          {sending ? 'در حال آماده کردن…' : 'پیامک متن لیست قیمت'}
        </button>
      </Sheet>
    </div>
  );
};
