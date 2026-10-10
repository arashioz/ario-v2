import React, { useState } from 'react';
import { Copy, ExternalLink, MessageSquare, Share2 } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { productsService } from '../../services/products.service';
import type { CatalogTier } from '../../services/products.service';
import { useNotification } from '../../context/NotificationContext';
import { catalogLinkSms, openSms, priceListSms } from '../../lib/sms';
import { useSettings } from '../../services/settings.service';

const TIERS: { key: CatalogTier; label: string; hint: string }[] = [
  { key: 'retail', label: 'مصرف‌کننده (تکی)', hint: 'برای مشتری‌های عادی' },
  { key: 'supermarket', label: 'سوپرمارکت', hint: 'برای مغازه‌داران' },
  { key: 'wholesale', label: 'عمده', hint: 'برای بنکداران و خریدهای بزرگ' },
];

export const catalogUrl = (tier: CatalogTier) =>
  `${window.location.origin}/catalog${tier === 'retail' ? '' : `?tier=${tier}`}`;

/** Picks which price tier the public catalog shows, then copies or shares its link. */
export const CatalogShareSheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [tier, setTier] = useState<CatalogTier>('retail');
  const { showNotification } = useNotification();
  const settings = useSettings();
  const url = catalogUrl(tier);

  const copy = async () => {
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    showNotification({ title: 'لینک کپی شد', message: url, type: 'info' });
  };

  const share = async () => {
    if (navigator.share) await navigator.share({ title: 'کاتالوگ محصولات', url }).catch(() => undefined);
    else await copy();
  };

  const smsLink = () => openSms(undefined, catalogLinkSms(settings.shopName, tier, url));

  const smsList = async () => {
    const catalog = await productsService.getCatalog(tier).catch(() => null);
    if (!catalog) {
      showNotification({ title: 'لیست قیمت', message: 'کاتالوگ دریافت نشد.', type: 'error' });
      return;
    }
    await openSms(undefined, priceListSms(catalog.shopName, tier, url, catalog.products));
  };

  return (
    <Sheet open={open} title="کاتالوگ آنلاین" subtitle="لینک عمومی لیست قیمت و عکس محصولات" onClose={onClose}>
      <div className="space-y-2">
        <p className="text-[11px] text-slate-500">کدام قیمت در کاتالوگ نمایش داده شود؟</p>
        {TIERS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTier(t.key)}
            className={`w-full text-right px-4 py-3 rounded-2xl border transition ${
              tier === t.key ? 'border-sky-500 bg-sky-50' : 'border-slate-200'
            }`}
          >
            <span className={`block text-xs font-bold ${tier === t.key ? 'text-sky-700' : 'text-slate-700'}`}>
              {t.label}
            </span>
            <span className="block text-[10px] text-slate-400 mt-0.5">{t.hint}</span>
          </button>
        ))}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2.5 text-[11px] font-mono text-slate-600 break-all" dir="ltr">
        {url}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={smsLink}
          className="flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-emerald-600 text-white text-[11px] font-bold active:scale-95"
        >
          <MessageSquare className="w-4 h-4" />
          پیامک لینک
        </button>
        <button
          type="button"
          onClick={() => void smsList()}
          className="flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-emerald-50 text-emerald-800 text-[11px] font-bold active:scale-95"
        >
          <MessageSquare className="w-4 h-4" />
          پیامک متن قیمت
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={share}
          className="flex flex-col items-center gap-1 py-3 rounded-2xl bg-sky-600 text-white text-[11px] font-bold active:scale-95 transition"
        >
          <Share2 className="w-4 h-4" />
          ارسال
        </button>
        <button
          type="button"
          onClick={copy}
          className="flex flex-col items-center gap-1 py-3 rounded-2xl bg-slate-100 text-slate-700 text-[11px] font-bold active:scale-95 transition"
        >
          <Copy className="w-4 h-4" />
          کپی لینک
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex flex-col items-center gap-1 py-3 rounded-2xl bg-slate-100 text-slate-700 text-[11px] font-bold active:scale-95 transition"
        >
          <ExternalLink className="w-4 h-4" />
          مشاهده
        </a>
      </div>

      <p className="text-[10px] text-slate-400 leading-5">
        هر کسی این لینک را داشته باشد، بدون ورود به برنامه قیمت‌ها و عکس کالاها را می‌بیند. قیمت خرید و مقدار دقیق
        موجودی نمایش داده نمی‌شود؛ فقط «موجود / ناموجود».
      </p>
    </Sheet>
  );
};
