import { useState } from 'react';
import { accountingService } from '../../services/accounting.service';
import type { PriceSuggestion } from '../../services/accounting.service';
import { apiErrorMessage } from '../../services/invoices.service';
import { useNotification } from '../../context/NotificationContext';
import { suggestionReason } from './PriceSuggestion';

/** Applies suggested prices to products and tracks which ones are in flight / done. */
export function usePriceApplier(onApplied?: () => void) {
  const { showNotification } = useNotification();
  const [applying, setApplying] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const mark = (setter: typeof setApplying, id: string, on: boolean) =>
    setter((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const applyOne = async (s: PriceSuggestion) => {
    mark(setApplying, s.productId, true);
    try {
      await accountingService.applySuggestion(s, suggestionReason(s));
      mark(setApplied, s.productId, true);
      return true;
    } catch (err) {
      showNotification({ title: 'خطا', message: apiErrorMessage(err, `قیمت ${s.name} به‌روز نشد`), type: 'error' });
      return false;
    } finally {
      mark(setApplying, s.productId, false);
    }
  };

  const apply = async (list: PriceSuggestion[]) => {
    let ok = 0;
    for (const s of list) if (await applyOne(s)) ok++;
    if (ok) {
      showNotification({
        title: 'قیمت‌ها به‌روز شد',
        message: `قیمت فروش ${ok.toLocaleString('fa-IR')} کالا (تکی، سوپرمارکت و عمده) تغییر کرد.`,
        type: 'success',
      });
      onApplied?.();
    }
  };

  const reset = () => setApplied(new Set());

  return { apply, applying, applied, reset };
}
