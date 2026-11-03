import React, { useEffect, useState } from 'react';
import { productsService } from '../../services/products.service';
import { settingsService, useSettings } from '../../services/settings.service';
import { useNotification } from '../../context/NotificationContext';

/** Which company warehouses appear on the home card. */
export const HomeWarehouseSettings: React.FC = () => {
  const settings = useSettings();
  const { showNotification } = useNotification();
  const [companies, setCompanies] = useState<string[]>([]);

  useEffect(() => {
    productsService.getProducts().then((goods) => {
      const names = new Set<string>();
      for (const product of goods) names.add((product.supplierName || '').trim() || 'بدون شرکت');
      setCompanies([...names].sort((a, b) => a.localeCompare(b, 'fa')));
    }).catch(() => setCompanies([]));
  }, []);

  const picked = new Set(settings.homeWarehouses || []);

  const toggle = async (name: string) => {
    const next = picked.has(name) ? [...picked].filter((item) => item !== name) : [...picked, name];
    try {
      await settingsService.update({ homeWarehouses: next });
    } catch {
      showNotification({ title: 'ذخیره نشد', message: 'انتخاب انبار صفحه اول ذخیره نشد.', type: 'error' });
    }
  };

  return (
    <section className="rounded-2xl bg-white border border-slate-200 p-3 space-y-2">
      <div>
        <h2 className="text-sm font-bold text-slate-800">انبار صفحه اول</h2>
        <p className="text-[11px] text-slate-500 mt-0.5">فقط شرکت‌های انتخاب‌شده روی کارت مینیمال خانه دیده می‌شوند. بقیه داخل خود انبار هستند.</p>
      </div>
      {companies.length === 0 ? (
        <p className="text-[11px] text-slate-400">شرکتی روی کالاها ثبت نشده</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {companies.map((name) => {
            const on = picked.has(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => void toggle(name)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${on ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};
