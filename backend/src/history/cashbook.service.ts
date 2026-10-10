import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Invoice, InvoiceDocument } from '../invoices/schemas/invoice.schema';
import { CustomerTransaction, CustomerTransactionDocument } from '../customers/schemas/customer-transaction.schema';
import { Expense, ExpenseDocument } from '../expenses/schemas/expense.schema';
import { SupplierPayment, SupplierPaymentDocument } from '../suppliers/schemas/supplier-payment.schema';
import { CashTransaction, CashTransactionDocument } from './schemas/cash-transaction.schema';
import { CashboxAdjustment, CashboxAdjustmentDocument } from './schemas/cashbox-adjustment.schema';
import { SettingsService } from '../settings/settings.service';
import { isParentSupplier, purchaseEntersShop } from '../suppliers/supplier-names';

type Channel = 'cash' | 'bank' | 'cheque';
type Kind = 'sale' | 'debt_payment' | 'walkin_payment' | 'expense' | 'withdrawal' | 'manager_deposit' | 'supplier_payment' | 'purchase_spot' | 'pos_settlement';

export interface CashEntry {
  date: Date;
  direction: 'in' | 'out';
  kind: Kind;
  channel: Channel;
  method: string;
  amount: number;
  title: string;
  ref?: string;
  /** Shop bank account (settings.bankCards[].id) for card payments, when recorded. */
  accountId?: string;
}

const KIND_LABELS: Record<Kind, string> = {
  sale: 'دریافت نقدی/کارتی فروش',
  debt_payment: 'وصول بدهی مشتری',
  walkin_payment: 'وصول نسیه مشتری حضوری',
  expense: 'هزینه فروشگاه',
  withdrawal: 'برداشت شخصی',
  manager_deposit: 'واریز مدیر',
  supplier_payment: 'پرداخت به شرکت',
  purchase_spot: 'پرداخت نقدی خرید',
  pos_settlement: 'تسویه روزانه پوز به حساب اصلی',
};

const LEGACY_LABELS: Record<string, string> = {
  sale_card: 'فروش کارتی',
  sale_cash: 'فروش نقدی',
  debt_payment: 'وصول بدهی',
  expense: 'هزینه',
  purchase: 'پرداخت خرید',
};

const channelOf = (method?: string): Channel =>
  method === 'cash' ? 'cash' : method === 'cheque' ? 'cheque' : 'bank';

/** Shop drawers: cash, card-to-card (including bank transfer), and the POS machine. */
const drawerOf = (method?: string): 'cash' | 'pos' | 'transfer' | 'cheque' => {
  const m = (method || 'cash').toLowerCase();
  if (m === 'cheque') return 'cheque';
  if (m === 'pos' || m === 'card') return 'pos';
  if (m === 'transfer' || m === 'card_to_card' || m === 'paya') return 'transfer';
  return 'cash';
};

const dayStart = (ymd?: string) => (ymd ? new Date(`${ymd.slice(0, 10)}T00:00:00+03:30`) : null);
const dayEnd = (ymd?: string) => (ymd ? new Date(`${ymd.slice(0, 10)}T23:59:59.999+03:30`) : null);
const tehranDay = (d: Date) => new Date(+new Date(d) + 3.5 * 3600000).toISOString().slice(0, 10);

/** Money in and out of the shop, rebuilt from invoices, payments and expenses. */
@Injectable()
export class CashbookService {
  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(CustomerTransaction.name) private txModel: Model<CustomerTransactionDocument>,
    @InjectModel(Expense.name) private expenseModel: Model<ExpenseDocument>,
    @InjectModel(SupplierPayment.name) private supplierPaymentModel: Model<SupplierPaymentDocument>,
    @InjectModel(CashTransaction.name) private legacyModel: Model<CashTransactionDocument>,
    @InjectModel(CashboxAdjustment.name) private adjustmentModel: Model<CashboxAdjustmentDocument>,
    private settings: SettingsService,
  ) {}

  async cashbook(query: { from?: string; to?: string }) {
    const from = dayStart(query.from);
    const to = dayEnd(query.to);
    const range = (field: string) => {
      const r: any = {};
      if (from) r.$gte = from;
      if (to) r.$lte = to;
      return Object.keys(r).length ? { [field]: r } : {};
    };
    const inRange = (d: Date) => (!from || +new Date(d) >= +from) && (!to || +new Date(d) <= +to);

    const [invoices, walkins, txs, expenses, supplierPayments, companyPurchases] = await Promise.all([
      this.invoiceModel
        .find({ ...range('invoiceDate') })
        .select('invoiceNumber type invoiceDate customerName fulfillment finalAmount creditAmount paymentMethod splitDetails depositAccounts shippingPayer')
        .lean(),
      this.invoiceModel.find({ type: 'sale', 'legacyPayments.0': { $exists: true } }).select('invoiceNumber customerName legacyPayments').lean(),
      this.txModel.find({ type: 'payment', ...range('date') }).populate('customer', 'name').lean(),
      this.expenseModel.find({ ...range('date') }).lean(),
      this.supplierPaymentModel.find({ ...range('date') }).lean(),
      this.invoiceModel.find({ type: 'purchase' }).select('_id customerName fulfillment').lean(),
    ]);
    const companyInvoiceIds = new Set(
      companyPurchases.filter((inv) => !purchaseEntersShop(inv) && inv.fulfillment !== 'factory').map((inv) => String(inv._id)),
    );

    const entries: CashEntry[] = [];
    for (const inv of invoices) {
      if (inv.type === 'purchase' && !purchaseEntersShop(inv)) continue;
      const upfront = Math.max(0, (inv.finalAmount || 0) - (inv.creditAmount || 0));
      if (upfront <= 0) continue;
      const direction = inv.type === 'sale' ? 'in' : 'out';
      const kind: Kind = inv.type === 'sale' ? 'sale' : 'purchase_spot';
      const title = `${inv.type === 'sale' ? 'فاکتور فروش' : 'فاکتور خرید'} ${inv.invoiceNumber}`;
      const accountOf = (m: string) => (m === 'transfer' ? (inv.depositAccounts as any)?.transfer || undefined : undefined);
      if (inv.paymentMethod === 'split' && inv.splitDetails) {
        for (const m of ['pos', 'cash', 'transfer', 'cheque'] as const) {
          const amount = (inv.splitDetails as any)[m] || 0;
          if (amount > 0) {
            const method = drawerOf(m);
            entries.push({ date: inv.invoiceDate, direction, kind, channel: channelOf(method), method, amount, title, ref: inv.customerName, accountId: accountOf(m) });
          }
        }
      } else {
        const method = drawerOf(inv.paymentMethod === 'credit' ? 'cash' : inv.paymentMethod);
        entries.push({ date: inv.invoiceDate, direction, kind, channel: channelOf(method), method, amount: upfront, title, ref: inv.customerName, accountId: accountOf(method) });
      }
    }
    for (const inv of walkins) {
      for (const p of inv.legacyPayments || []) {
        if (!inRange(p.date)) continue;
        const method = drawerOf(p.method);
        entries.push({ date: p.date, direction: 'in', kind: 'walkin_payment', channel: channelOf(method), method, amount: p.amount, title: `وصول فاکتور ${inv.invoiceNumber}`, ref: inv.customerName, accountId: p.accountId || undefined });
      }
    }
    for (const t of txs) {
      entries.push({
        date: t.date,
        direction: 'in',
        kind: 'debt_payment',
        channel: channelOf(t.paymentMethod),
        method: drawerOf(t.paymentMethod),
        amount: t.amount,
        title: t.description || 'دریافت از مشتری',
        ref: (t.customer as any)?.name,
        accountId: t.accountId || undefined,
      });
    }
    for (const e of expenses) {
      if (e.invoiceId && companyInvoiceIds.has(String(e.invoiceId))) continue;
      const deposit = e.type === 'deposit';
      const withdrawal = !deposit && (e.isPersonalWithdrawal || e.type === 'withdrawal');
      entries.push({
        date: e.date,
        direction: deposit ? 'in' : 'out',
        kind: deposit ? 'manager_deposit' : withdrawal ? 'withdrawal' : 'expense',
        channel: channelOf(e.paymentMethod),
        method: drawerOf(e.paymentMethod),
        amount: e.amount,
        title: e.description || e.categoryName,
        ref: e.categoryName,
      });
    }
    for (const p of supplierPayments) {
      if (!isParentSupplier(p.supplier)) continue;
      entries.push({
        date: p.date,
        direction: 'out',
        kind: 'supplier_payment',
        channel: channelOf(p.method),
        method: drawerOf(p.method),
        amount: p.amount,
        title: `پرداخت به ${p.supplier}`,
        ref: p.destination || 'نامشخص',
      });
    }
    entries.sort((a, b) => +new Date(b.date) - +new Date(a.date));

    let totalIn = entries.filter((e) => e.direction === 'in').reduce((s, e) => s + e.amount, 0);
    let totalOut = entries.filter((e) => e.direction === 'out').reduce((s, e) => s + e.amount, 0);

    const byKind = (Object.keys(KIND_LABELS) as Kind[])
      .map((k) => {
        const list = entries.filter((e) => e.kind === k);
        return { kind: k, label: KIND_LABELS[k], direction: list[0]?.direction ?? (['sale', 'debt_payment', 'walkin_payment'].includes(k) ? 'in' : 'out'), amount: list.reduce((s, e) => s + e.amount, 0), count: list.length };
      })
      .filter((k) => k.count > 0);

    const byChannel = (['cash', 'bank', 'cheque'] as Channel[]).map((c) => {
      const list = entries.filter((e) => e.channel === c);
      const inflow = list.filter((e) => e.direction === 'in').reduce((s, e) => s + e.amount, 0);
      const outflow = list.filter((e) => e.direction === 'out').reduce((s, e) => s + e.amount, 0);
      return { channel: c, in: inflow, out: outflow, net: inflow - outflow };
    });

    const byMethod = (['pos', 'cash', 'transfer', 'cheque'] as const).map((m) => {
      const list = entries.filter((e) => e.method === m);
      const inflow = list.filter((e) => e.direction === 'in').reduce((s, e) => s + e.amount, 0);
      const outflow = list.filter((e) => e.direction === 'out').reduce((s, e) => s + e.amount, 0);
      return { method: m, in: inflow, out: outflow, net: inflow - outflow };
    });

    const today = tehranDay(new Date());
    const posDays = new Map<string, { in: number; out: number }>();
    for (const e of entries) {
      if (e.method !== 'pos') continue;
      const d = tehranDay(e.date);
      const row = posDays.get(d) ?? { in: 0, out: 0 };
      row[e.direction] += e.amount;
      posDays.set(d, row);
    }
    const todayRow = posDays.get(today) ?? { in: 0, out: 0 };
    const shopSettings = await this.settings.get();
    const mainCard = (shopSettings.bankCards || []).find((c) => c.isDefault) || shopSettings.bankCards?.[0];
    const mainAccountId = mainCard?.id || '';
    const posSettlements: { date: string; amount: number }[] = [];
    const posRow = byMethod.find((m) => m.method === 'pos');
    const transferRow = byMethod.find((m) => m.method === 'transfer');
    if (posRow && transferRow) {
      for (const [day, row] of posDays) {
        if (day >= today) continue;
        const net = row.in - row.out;
        if (!net) continue;
        const at = dayEnd(day);
        if (!at || !inRange(at)) continue;
        posSettlements.push({ date: day, amount: net });
        if (net > 0) {
          posRow.out += net;
          transferRow.in += net;
        } else {
          posRow.in += -net;
          transferRow.out += -net;
        }
        posRow.net -= net;
        transferRow.net += net;
      }
    }
    posSettlements.sort((a, b) => b.date.localeCompare(a.date));

    const allTime = !query.from && !query.to;
    const saved = await this.adjustmentModel.find().lean();
    const adjustments = saved.map((a) => ({
      method: a.method,
      amount: a.amount || 0,
      note: a.note || '',
    }));
    if (allTime) {
      for (const a of adjustments) {
        const row = byMethod.find((m) => m.method === a.method);
        if (!row || !a.amount) continue;
        if (a.amount > 0) {
          row.in += a.amount;
          totalIn += a.amount;
        } else {
          row.out += -a.amount;
          totalOut += -a.amount;
        }
        row.net += a.amount;
      }
    }

    const accounts = new Map<string, { accountId: string; in: number; count: number }>();
    for (const e of entries) {
      if (e.direction !== 'in' || e.method !== 'transfer') continue;
      const id = e.accountId || '';
      const row = accounts.get(id) ?? { accountId: id, in: 0, count: 0 };
      row.in += e.amount;
      row.count++;
      accounts.set(id, row);
    }
    for (const s of posSettlements) {
      if (s.amount <= 0) continue;
      const row = accounts.get(mainAccountId) ?? { accountId: mainAccountId, in: 0, count: 0 };
      row.in += s.amount;
      row.count++;
      accounts.set(mainAccountId, row);
    }

    const days = new Map<string, { date: string; in: number; out: number }>();
    for (const e of entries) {
      const d = tehranDay(e.date);
      const row = days.get(d) ?? { date: d, in: 0, out: 0 };
      row[e.direction] += e.amount;
      days.set(d, row);
    }

    return {
      period: { from: query.from || null, to: query.to || null },
      summary: { in: totalIn, out: totalOut, net: totalIn - totalOut, count: entries.length },
      byKind,
      byChannel,
      byMethod,
      /** Manual corrections applied to the all-time balance of each drawer. */
      adjustments,
      /** کارت‌به‌کارت received per shop account. کارتخوان is not tied to a card. */
      byAccount: [...accounts.values()].sort((a, b) => b.in - a.in),
      byDay: [...days.values()].sort((a, b) => b.date.localeCompare(a.date)),
      entries: entries.slice(0, 600),
      /** Card-reader total still sitting on the POS. Finished days are already settled. */
      posToday: { in: todayRow.in, out: todayRow.out, net: todayRow.in - todayRow.out },
      /** Each finished day's POS net, moved onto the main bank account. Positive deposits, negative withdraws. */
      posSettlements,
      mainAccountId,
    };
  }

  /** The old Ario app's own cash ledger, exactly as it was imported. */
  async legacyLedger(query: { type?: string; limit?: number }) {
    const filter: any = {};
    if (query.type && query.type !== 'all') filter.type = query.type;
    const [totals, rows] = await Promise.all([
      this.legacyModel.aggregate<{ _id: { type: string; direction: string }; amount: number; count: number; first: Date; last: Date }>([
        { $group: { _id: { type: '$type', direction: '$direction' }, amount: { $sum: '$amount' }, count: { $sum: 1 }, first: { $min: '$date' }, last: { $max: '$date' } } },
      ]),
      this.legacyModel.find(filter).sort({ date: -1, createdAt: -1 }).limit(Math.min(query.limit || 300, 1000)).lean(),
    ]);
    const types = totals
      .map((t) => ({ type: t._id.type, label: LEGACY_LABELS[t._id.type] || t._id.type, direction: t._id.direction, amount: t.amount, count: t.count, first: t.first, last: t.last }))
      .sort((a, b) => b.amount - a.amount);
    const inflow = types.filter((t) => t.direction === 'in').reduce((s, t) => s + t.amount, 0);
    const outflow = types.filter((t) => t.direction === 'out').reduce((s, t) => s + t.amount, 0);
    return {
      summary: { in: inflow, out: outflow, net: inflow - outflow, count: types.reduce((s, t) => s + t.count, 0) },
      types,
      rows: rows.map((r) => ({ _id: String(r._id), date: r.date, type: r.type, label: LEGACY_LABELS[r.type] || r.type, direction: r.direction, amount: r.amount, description: r.description })),
    };
  }

  /** Sets a drawer's all-time balance to the amount actually on hand. */
  async setBalance(method: 'cash' | 'pos' | 'transfer', balance: number, note?: string) {
    const book = await this.cashbook({});
    const current = book.byMethod.find((m) => m.method === method)?.net ?? 0;
    const previous = book.adjustments.find((a) => a.method === method)?.amount ?? 0;
    const amount = Math.round(balance - (current - previous));
    const text = (note || '').trim();
    if (!amount && !text) await this.adjustmentModel.deleteOne({ method });
    else await this.adjustmentModel.updateOne({ method }, { $set: { method, amount, note: text } }, { upsert: true });
    return this.cashbook({});
  }

  async clearBalance(method: 'cash' | 'pos' | 'transfer') {
    await this.adjustmentModel.deleteOne({ method });
    return this.cashbook({});
  }
}
