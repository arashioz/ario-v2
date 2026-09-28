import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { suppliersService, type SupplierBankAccount, type SupplierCompany } from '../../services/suppliers.service';
import { apiErrorMessage } from '../../services/invoices.service';
import { useNotification } from '../../context/NotificationContext';
import { toEnDigits } from '../../lib/format';

interface Props {
  open: boolean;
  /** null → new company */
  company: SupplierCompany | null;
  onClose: () => void;
  onSaved: (c: SupplierCompany) => void;
  onRemoved?: () => void;
  lockName?: boolean;
}

const emptyAccount = (): SupplierBankAccount => ({ holder: '', bank: '', cardNumber: '', iban: '', accountNumber: '' });
const digits = (s: string) => toEnDigits(s).replace(/[^\d]/g, '');
const iban = (s: string) => {
  const d = toEnDigits(s).toUpperCase().replace(/[^\dIR]/g, '');
  return d && !d.startsWith('IR') ? `IR${d.replace(/IR/g, '')}` : d;
};

const input = 'w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs focus:outline-none focus:border-sky-500 bg-white';

export const CompanySheet: React.FC<Props> = ({ open, company, onClose, onSaved, onRemoved, lockName }) => {
  const { showNotification } = useNotification();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [contactName, setContactName] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [accounts, setAccounts] = useState<SupplierBankAccount[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(company?.name ?? '');
    setPhone(company?.phone ?? '');
    setContactName(company?.contactName ?? '');
    setAddress(company?.address ?? '');
    setNotes(company?.notes ?? '');
    setAccounts(company?.accounts?.length ? company.accounts.map((a) => ({ ...emptyAccount(), ...a })) : [emptyAccount()]);
    setConfirmDelete(false);
  }, [open, company]);

  const patchAccount = (i: number, patch: Partial<SupplierBankAccount>) =>
    setAccounts((prev) => prev.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  const save = async () => {
    const body = {
      name: name.trim(),
      phone: digits(phone),
      contactName: contactName.trim(),
      address: address.trim(),
      notes: notes.trim(),
      accounts: accounts.filter((a) => a.holder.trim() || a.cardNumber || a.iban || a.accountNumber),
    };
    if (!body.name) {
      showNotification({ title: 'نام شرکت', message: 'نام شرکت را وارد کنید.', type: 'error' });
      return;
    }
    try {
      setSaving(true);
      const saved = company?._id
        ? await suppliersService.updateCompany(company._id, body)
        : await suppliersService.createCompany(body);
      showNotification({ title: 'ذخیره شد', message: `اطلاعات «${saved.name}» ذخیره شد.`, type: 'success' });
      onSaved(saved);
    } catch (err) {
      showNotification({ title: 'خطا', message: apiErrorMessage(err, 'ذخیره انجام نشد'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!company?._id) return;
    try {
      setSaving(true);
      await suppliersService.removeCompany(company._id);
      showNotification({ title: 'حذف شد', message: `«${company.name}» حذف شد.`, type: 'info' });
      onRemoved?.();
    } catch (err) {
      showNotification({ title: 'حذف ممکن نیست', message: apiErrorMessage(err, 'حذف انجام نشد'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={company?._id ? 'ویرایش شرکت' : 'شرکت تأمین‌کننده جدید'}
      subtitle="اطلاعات تماس و حساب‌های بانکی شرکت"
      footer={
        <div className="space-y-2">
          <button onClick={save} disabled={saving} className="w-full py-3 rounded-2xl bg-sky-600 text-white text-sm font-bold disabled:opacity-40 active:scale-[0.98]">
            {saving ? 'در حال ذخیره…' : 'ذخیره'}
          </button>
          {company?._id && onRemoved && (
            <button
              onClick={() => (confirmDelete ? remove() : setConfirmDelete(true))}
              disabled={saving}
              className={`w-full py-2.5 rounded-2xl text-xs font-bold ${confirmDelete ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-600'}`}
            >
              {confirmDelete ? 'بله، حذف شود' : 'حذف شرکت'}
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="نام شرکت *"
          disabled={lockName}
          className={`${input} disabled:bg-slate-50 disabled:text-slate-500`}
        />
        {company?._id && name.trim() !== company.name && (
          <p className="text-[10px] text-amber-700">با تغییر نام، فاکتورهای خرید، پرداخت‌ها و محصولات این شرکت هم به نام جدید منتقل می‌شوند.</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="نام رابط" className={input} />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="تلفن" inputMode="tel" dir="ltr" className={`${input} text-left`} />
        </div>
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="آدرس" className={input} />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="یادداشت" className={input} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700">حساب‌های بانکی</span>
          <button onClick={() => setAccounts((p) => [...p, emptyAccount()])} className="text-[11px] font-bold text-sky-600 flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> حساب جدید
          </button>
        </div>
        {accounts.map((a, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <input value={a.holder} onChange={(e) => patchAccount(i, { holder: e.target.value })} placeholder="صاحب حساب" className={input} />
              <input value={a.bank} onChange={(e) => patchAccount(i, { bank: e.target.value })} placeholder="بانک" className={`${input} max-w-[110px]`} />
              <button onClick={() => setAccounts((p) => p.filter((_, j) => j !== i))} className="p-2 rounded-xl text-rose-500 bg-white border border-rose-100 shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <input
              value={a.cardNumber}
              onChange={(e) => patchAccount(i, { cardNumber: digits(e.target.value).slice(0, 16) })}
              placeholder="شماره کارت"
              inputMode="numeric"
              dir="ltr"
              className={`${input} font-mono text-left`}
            />
            <input
              value={a.iban}
              onChange={(e) => patchAccount(i, { iban: iban(e.target.value).slice(0, 26) })}
              placeholder="شبا IR…"
              dir="ltr"
              className={`${input} font-mono text-left`}
            />
            <input
              value={a.accountNumber}
              onChange={(e) => patchAccount(i, { accountNumber: toEnDigits(e.target.value) })}
              placeholder="شماره حساب"
              dir="ltr"
              className={`${input} font-mono text-left`}
            />
          </div>
        ))}
      </div>
    </Sheet>
  );
};
