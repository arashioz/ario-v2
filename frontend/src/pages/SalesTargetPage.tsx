import React, { useEffect, useMemo, useState } from 'react';
import { IonContent, IonPage, IonRefresher, IonRefresherContent } from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/react';
import { Target } from 'lucide-react';
import { accountingService } from '../services/accounting.service';
import type { SalesProgress } from '../services/accounting.service';
import { PeriodPicker, periodPresets, periodQuery } from '../components/ui/PeriodPicker';
import type { Period } from '../components/ui/PeriodPicker';
import { ReportHeader } from '../components/reports/ReportUI';
import { TargetProgressCard } from '../components/target/TargetProgressCard';
import { TargetFields } from '../components/target/TargetFields';
import { settingsService, useSettings } from '../services/settings.service';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { apiErrorMessage } from '../services/invoices.service';
import { formatToman, weight } from '../lib/format';
import { usersService } from '../services/users.service';

export const SalesTargetPage: React.FC = () => {
  const { user, patchUser } = useAuth();
  const settings = useSettings();
  const { showNotification } = useNotification();
  const month = useMemo(() => periodPresets().find((p) => p.from && p.to && p.label.startsWith('ماه')) || periodPresets()[4], []);
  const [period, setPeriod] = useState<Period>(month);
  const [board, setBoard] = useState<SalesProgress | null>(null);
  const [shopTarget, setShopTarget] = useState({ amount: settings.salesTarget?.amount || 0, kg: settings.salesTarget?.kg || 0 });
  const [mine, setMine] = useState({ amount: user?.salesTargetAmount || 0, kg: user?.salesTargetKg || 0 });
  const [saving, setSaving] = useState('');

  const load = async (next = period) => {
    setBoard(await accountingService.salesProgress(periodQuery(next)));
  };

  useEffect(() => {
    setShopTarget({ amount: settings.salesTarget?.amount || 0, kg: settings.salesTarget?.kg || 0 });
  }, [settings.salesTarget]);

  useEffect(() => {
    load(period).catch(() => setBoard(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const mineRow = board?.sellers.find((row) => row.userId === user?.id || row.name === user?.fullName);

  const saveShop = async () => {
    setSaving('shop');
    try {
      await settingsService.update({ salesTarget: shopTarget });
      showNotification({ title: 'ذخیره شد', message: 'تارگت کل آریو به‌روز شد.', type: 'success' });
      await load();
    } catch (err) {
      showNotification({ title: 'ذخیره نشد', message: apiErrorMessage(err, 'تارگت فروشگاه ذخیره نشد'), type: 'error' });
    } finally {
      setSaving('');
    }
  };

  const saveMine = async () => {
    setSaving('mine');
    try {
      const saved = await api.patch('/auth/target', { salesTargetAmount: mine.amount, salesTargetKg: mine.kg });
      patchUser({ salesTargetAmount: saved.data.salesTargetAmount, salesTargetKg: saved.data.salesTargetKg });
      showNotification({ title: 'ذخیره شد', message: 'تارگت شخصی شما ثبت شد.', type: 'success' });
      await load();
    } catch (err) {
      showNotification({ title: 'ذخیره نشد', message: apiErrorMessage(err, 'تارگت شخصی ذخیره نشد'), type: 'error' });
    } finally {
      setSaving('');
    }
  };

  const saveSeller = async (userId: string, amount: number, kg: number) => {
    if (!userId) return;
    setSaving(userId);
    try {
      await usersService.update(userId, { salesTargetAmount: amount, salesTargetKg: kg });
      showNotification({ title: 'ذخیره شد', message: 'تارگت همکار به‌روز شد.', type: 'success' });
      await load();
    } catch (err) {
      showNotification({ title: 'ذخیره نشد', message: apiErrorMessage(err, 'تارگت همکار ذخیره نشد'), type: 'error' });
    } finally {
      setSaving('');
    }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <IonPage>
      <ReportHeader title="تارگت فروش" subtitle="هدف ماه، پیشرفت فروشگاه و هر فروشنده" />
      <IonContent fullscreen className="bg-slate-50">
        <IonRefresher slot="fixed" onIonRefresh={async (e: CustomEvent<RefresherEventDetail>) => { await load(); e.detail.complete(); }}>
          <IonRefresherContent />
        </IonRefresher>
        <div className="p-3 space-y-3 max-w-lg mx-auto pb-10">
          <PeriodPicker value={period} onChange={setPeriod} />

          {board && (
            <TargetProgressCard
              title="فروش آریو در این دوره"
              amount={board.shop.amount}
              kg={board.shop.kg}
              targetAmount={board.shop.targetAmount}
              targetKg={board.shop.targetKg}
              invoices={board.shop.invoices}
              href=""
            />
          )}

          {isAdmin && (
            <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5 space-y-3">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-sky-600" />
                <h2 className="text-[13px] font-bold text-slate-800">تعریف تارگت فروشگاه</h2>
              </div>
              <TargetFields value={shopTarget} onChange={setShopTarget} />
              <button type="button" disabled={saving === 'shop'} onClick={() => void saveShop()} className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-50">
                {saving === 'shop' ? 'در حال ذخیره…' : 'ذخیره تارگت آریو'}
              </button>
            </section>
          )}

          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5 space-y-3">
            <h2 className="text-[13px] font-bold text-slate-800">تارگت من</h2>
            {mineRow && (
              <p className="text-[11px] text-slate-400 font-mono">
                فروش شما: {formatToman(mineRow.amount)} · {weight(mineRow.kg)}
              </p>
            )}
            <TargetFields value={mine} onChange={setMine} />
            <button type="button" disabled={saving === 'mine'} onClick={() => void saveMine()} className="w-full py-2.5 rounded-xl bg-sky-600 text-white text-xs font-bold disabled:opacity-50">
              {saving === 'mine' ? 'در حال ذخیره…' : 'ذخیره تارگت من'}
            </button>
          </section>

          <section className="space-y-2">
            <h2 className="text-[12px] font-bold text-slate-500 px-1">پیشرفت همکاران</h2>
            {(board?.sellers || []).map((row) => (
              <SellerTargetRow key={row.userId || row.name} row={row} canEdit={isAdmin && !!row.userId} saving={saving === row.userId} onSave={saveSeller} />
            ))}
          </section>
        </div>
      </IonContent>
    </IonPage>
  );
};

const SellerTargetRow: React.FC<{
  row: SalesProgress['sellers'][number];
  canEdit: boolean;
  saving: boolean;
  onSave: (userId: string, amount: number, kg: number) => void;
}> = ({ row, canEdit, saving, onSave }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ amount: row.targetAmount, kg: row.targetKg });
  useEffect(() => { setDraft({ amount: row.targetAmount, kg: row.targetKg }); }, [row.targetAmount, row.targetKg]);
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <button type="button" onClick={() => canEdit && setOpen((v) => !v)} className="w-full p-3.5 text-right">
        <TargetProgressCard
          title={row.name}
          amount={row.amount}
          kg={row.kg}
          targetAmount={row.targetAmount}
          targetKg={row.targetKg}
          invoices={row.invoices}
          href=""
          framed={false}
        />
      </button>
      {open && canEdit && (
        <div className="px-3.5 pb-3.5 space-y-2 border-t border-slate-100 pt-3">
          <TargetFields value={draft} onChange={setDraft} />
          <button type="button" disabled={saving} onClick={() => onSave(row.userId, draft.amount, draft.kg)} className="w-full py-2 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-50">
            {saving ? 'در حال ذخیره…' : `ذخیره تارگت ${row.name}`}
          </button>
        </div>
      )}
    </div>
  );
};
