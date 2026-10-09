import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import {
  CustomerTransaction,
  CustomerTransactionDocument,
} from './schemas/customer-transaction.schema';
import { Invoice, InvoiceDocument } from '../invoices/schemas/invoice.schema';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { RecordTransactionDto } from './dto/record-transaction.dto';

@Injectable()
export class CustomersService implements OnModuleInit {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    @InjectModel(Customer.name)
    private customerModel: Model<CustomerDocument>,
    @InjectModel(CustomerTransaction.name)
    private transactionModel: Model<CustomerTransactionDocument>,
    @InjectModel(Invoice.name)
    private invoiceModel: Model<InvoiceDocument>,
  ) {}

  async onModuleInit() {
    await this.seedInitialCustomers();
  }

  private async seedInitialCustomers() {
    try {
      const count = await this.customerModel.countDocuments();
      if (count === 0) {
        this.logger.log('No customers found; run scripts/migrate-static-data.js to import data.');
      }
    } catch (err) {
      this.logger.error('Failed to check customers', err);
    }
  }

  private cleanBranches(list?: string[]) {
    const out: string[] = [];
    for (const raw of list || []) {
      const name = String(raw || '').trim();
      if (!name || out.includes(name) || out.length >= 12) continue;
      out.push(name);
    }
    return out;
  }

  async create(createCustomerDto: CreateCustomerDto, recordedByName?: string): Promise<CustomerDocument> {
    if (createCustomerDto.branches) createCustomerDto.branches = this.cleanBranches(createCustomerDto.branches);
    if (createCustomerDto.kind === 'walkin') return this.createWalkIn(createCustomerDto);
    const initialDebt = createCustomerDto.initialDebt || 0;

    const customer = new this.customerModel({
      ...createCustomerDto,
      balance: initialDebt,
      lastTransactionDate: new Date(),
    });

    const savedCustomer = await customer.save();

    if (initialDebt > 0) {
      await this.transactionModel.create({
        customer: savedCustomer._id,
        type: 'debt',
        amount: initialDebt,
        balanceAfter: initialDebt,
        paymentMethod: 'cash',
        description: 'مانده بدهی اولیه هنگام ثبت مشتری',
        recordedByName: recordedByName || 'کاربر سیستم',
        date: new Date(),
      });
    }

    return savedCustomer;
  }

  /** Walk-in buyers keep only a name and phone; the same phone always maps to the same customer. */
  private async createWalkIn(dto: CreateCustomerDto): Promise<CustomerDocument> {
    const name = dto.name.trim();
    const phoneNumber = (dto.phoneNumber || '').trim();
    if (phoneNumber) {
      const existing = await this.customerModel.findOne({ phoneNumber, isActive: true }).exec();
      if (existing) return existing;
    }
    return this.customerModel.create({
      name,
      phoneNumber,
      kind: 'walkin',
      customerType: 'retail',
      balance: 0,
      lastTransactionDate: new Date(),
    });
  }

  async findAll(query?: {
    search?: string;
    filter?: 'all' | 'debtors' | 'settled' | 'creditors';
    kind?: string;
  }) {
    await this.ensureReconciled();
    const filterObj: any = { isActive: true };
    // Customers created before walk-ins existed have no kind and are shops.
    if (query?.kind === 'walkin') filterObj.kind = 'walkin';
    else if (query?.kind === 'shop') filterObj.kind = { $ne: 'walkin' };

    if (query?.search && query.search.trim()) {
      const s = query.search.trim();
      filterObj.$or = [
        { name: { $regex: s, $options: 'i' } },
        { phoneNumber: { $regex: s, $options: 'i' } },
        { address: { $regex: s, $options: 'i' } },
      ];
    }

    if (query?.filter === 'debtors') {
      filterObj.balance = { $gt: 0 };
    } else if (query?.filter === 'settled') {
      filterObj.balance = 0;
    } else if (query?.filter === 'creditors') {
      filterObj.balance = { $lt: 0 };
    }

    const customers = await this.customerModel.find(filterObj).sort({ balance: -1, updatedAt: -1 }).exec();
    const now = Date.now();
    const open = await this.invoiceModel
      .find({ type: 'sale', remainingDebt: { $gt: 0 }, customerId: { $in: customers.map((c) => c._id) } })
      .select('customerId remainingDebt invoiceDate dueDate dueDays')
      .lean()
      .exec();
    const late = new Map<string, { amount: number; count: number }>();
    for (const inv of open) {
      const days = inv.dueDays || 15;
      const due = inv.dueDate
        ? new Date(inv.dueDate).getTime()
        : new Date(inv.invoiceDate || 0).getTime() + days * 86400000;
      if (due >= now) continue;
      const id = String(inv.customerId);
      const row = late.get(id) || { amount: 0, count: 0 };
      row.amount += inv.remainingDebt || 0;
      row.count += 1;
      late.set(id, row);
    }
    return customers.map((c) => {
      const row = late.get(String(c._id));
      return { ...c.toObject(), overdueAmount: row?.amount || 0, overdueCount: row?.count || 0 };
    });
  }

  async findOne(id: string): Promise<CustomerDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('شناسه مشتری نامعتبر است');
    }
    await this.ensureReconciled();
    const customer = await this.customerModel.findById(id).exec();
    if (!customer || !customer.isActive) {
      throw new NotFoundException('مشتری مورد نظر یافت نشد');
    }
    return customer;
  }

  async update(id: string, updateDto: UpdateCustomerDto): Promise<CustomerDocument> {
    if (updateDto.branches) updateDto.branches = this.cleanBranches(updateDto.branches);
    const previous = await this.findOne(id);
    const customer = await this.customerModel
      .findByIdAndUpdate(id, { $set: updateDto }, { new: true })
      .exec();

    if (!customer) {
      throw new NotFoundException('مشتری یافت نشد');
    }
    if (customer.name !== previous.name || (customer.phoneNumber || '') !== (previous.phoneNumber || '')) {
      await this.invoiceModel
        .updateMany(
          { customerId: customer._id },
          { $set: { customerName: customer.name, customerPhone: customer.phoneNumber || '' } },
        )
        .exec();
    }
    return customer;
  }

  async remove(id: string): Promise<{ message: string }> {
    const customer = await this.customerModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .exec();

    if (!customer) {
      throw new NotFoundException('مشتری یافت نشد');
    }
    return { message: 'مشتری با موفقیت حذف گردید' };
  }

  // ---------------------------------------------------------------------------
  // Ledger
  // ---------------------------------------------------------------------------

  private async changeBalance(customerId: Types.ObjectId | string, delta: number): Promise<number> {
    const updated = await this.customerModel
      .findByIdAndUpdate(
        customerId,
        { $inc: { balance: delta }, $set: { lastTransactionDate: new Date() } },
        { new: true },
      )
      .exec();
    return updated?.balance ?? 0;
  }

  /** Total paid on an invoice after it was issued (sum of payment allocations). */
  async getPaidLater(invoiceId: Types.ObjectId | string): Promise<number> {
    const id = new Types.ObjectId(String(invoiceId));
    const rows = await this.transactionModel
      .aggregate([
        { $match: { type: 'payment', 'allocations.invoiceId': id } },
        { $unwind: '$allocations' },
        { $match: { 'allocations.invoiceId': id } },
        { $group: { _id: null, total: { $sum: '$allocations.amount' } } },
      ])
      .exec();
    return rows[0]?.total || 0;
  }

  /** Recompute paidAmount / remainingDebt / isPaid from this invoice's own credit and its own payments. */
  async syncInvoicePayment(invoice: InvoiceDocument): Promise<InvoiceDocument> {
    const paidLater = await this.getPaidLater(invoice._id as Types.ObjectId);
    const credit = invoice.creditAmount || 0;
    const upfront = Math.max(0, (invoice.finalAmount || 0) - credit);
    invoice.creditApplied = 0;
    invoice.creditSurplus = Math.max(0, paidLater - credit);
    invoice.remainingDebt = Math.max(0, credit - paidLater);
    invoice.paidAmount = Math.min(invoice.finalAmount || 0, upfront + paidLater);
    invoice.isPaid = invoice.remainingDebt <= 0;
    return invoice.save();
  }

  private reconcilePromise: Promise<void> | null = null;

  /**
   * Each invoice keeps its own debt and its own surplus.
   * Credit from another invoice is not applied here and is not folded into a shared balance reduction.
   * Runs once per process, then again for a customer after their ledger changes.
   */
  async ensureReconciled(): Promise<void> {
    if (!this.reconcilePromise) {
      this.reconcilePromise = this.runReconcile().catch((err) => {
        this.reconcilePromise = null;
        throw err;
      });
    }
    await this.reconcilePromise;
  }

  private async runReconcile(): Promise<void> {
    await this.resetRazghandiLedger();
    const customers = await this.customerModel.find({ isActive: true }).select('_id balance').lean().exec();
    const grouped = await this.invoiceModel
      .aggregate([
        { $match: { type: 'sale', creditAmount: { $gt: 0 }, customerId: { $exists: true } } },
        {
          $group: {
            _id: '$customerId',
            sumRem: { $sum: '$remainingDebt' },
            applied: { $sum: '$creditApplied' },
            upfrontGap: {
              $sum: { $cond: [{ $gt: ['$finalAmount', '$creditAmount'] }, 1, 0] },
            },
            missingDue: {
              $sum: {
                $cond: [
                  { $and: [{ $gt: ['$remainingDebt', 0] }, { $eq: [{ $ifNull: ['$dueDate', null] }, null] }] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ])
      .exec();
    const byId = new Map(grouped.map((g) => [String(g._id), g]));
    for (const c of customers) {
      const row = byId.get(String(c._id));
      if (!row) continue;
      if ((row.applied || 0) > 0 || (row.upfrontGap || 0) > 0 || row.missingDue > 0) {
        await this.alignInvoiceDebts(String(c._id));
      }
    }
  }

  /**
   * رازقندی: old payments were never entered on the right invoices, so the ledger
   * mixed them. Wipe it once and leave each invoice with only its own نسیه,
   * so the payments can be recorded one by one.
   */
  private async resetRazghandiLedger(): Promise<void> {
    const customer = await this.customerModel.findOne({ name: 'رازقندی', isActive: true }).exec();
    if (!customer) return;
    const claim = await this.customerModel.collection.updateOne(
      { _id: customer._id, ledgerClearedAt: { $exists: false } },
      { $set: { ledgerClearedAt: new Date() } },
    );
    if (!claim.matchedCount) return;

    try {
    const invoices = await this.invoiceModel
      .find({ customerId: customer._id, type: 'sale' })
      .sort({ invoiceDate: 1, createdAt: 1 })
      .exec();
    await this.transactionModel.deleteMany({ customer: customer._id }).exec();

    let balance = 0;
    for (const inv of invoices) {
      const credit = Math.max(0, inv.creditAmount || 0);
      const upfront = Math.max(0, (inv.finalAmount || 0) - credit);
      inv.creditApplied = 0;
      inv.creditSurplus = 0;
      inv.remainingDebt = credit;
      inv.paidAmount = Math.min(inv.finalAmount || 0, upfront);
      inv.isPaid = credit <= 0;
      await inv.save();
      if (credit <= 0) continue;
      balance += credit;
      await this.transactionModel.create({
        customer: customer._id,
        type: 'debt',
        amount: credit,
        balanceAfter: balance,
        paymentMethod: 'cash',
        description: `نسیه فاکتور ${inv.invoiceNumber}`,
        invoiceId: inv._id,
        invoiceNumber: inv.invoiceNumber,
        recordedByName: 'اصلاح حساب',
        date: inv.invoiceDate || new Date(),
      });
    }
    customer.balance = balance;
    customer.lastTransactionDate = new Date();
    await customer.save();
    } catch (err) {
      await this.customerModel.collection.updateOne({ _id: customer._id }, { $unset: { ledgerClearedAt: '' } });
      throw err;
    }
  }

  /**
   * Remaining debt is this invoice's credit minus payments allocated to it.
   * Any extra payment stays as this invoice's own surplus and is not used to shrink another invoice.
   */
  async alignInvoiceDebts(customerId: string): Promise<void> {
    if (!Types.ObjectId.isValid(customerId)) return;
    const customer = await this.customerModel.findById(customerId).exec();
    if (!customer) return;
    const invoices = await this.invoiceModel
      .find({ customerId: customer._id, type: 'sale', creditAmount: { $gt: 0 } })
      .sort({ invoiceDate: -1, createdAt: -1 })
      .exec();
    const paidRows = invoices.length
      ? await this.transactionModel
          .aggregate([
            { $match: { type: 'payment', 'allocations.invoiceId': { $in: invoices.map((inv) => inv._id) } } },
            { $unwind: '$allocations' },
            { $match: { 'allocations.invoiceId': { $in: invoices.map((inv) => inv._id) } } },
            { $group: { _id: '$allocations.invoiceId', total: { $sum: '$allocations.amount' } } },
          ])
          .exec()
      : [];
    const paidById = new Map(paidRows.map((row) => [String(row._id), row.total || 0]));
    const rows: { inv: InvoiceDocument; paidLater: number; base: number }[] = [];
    for (const inv of invoices) {
      const paidLater = paidById.get(String(inv._id)) || 0;
      const credit = this.debtBase(inv.finalAmount || 0, inv.creditAmount || 0, this.splitPaid(inv.splitDetails), paidLater);
      if (credit !== (inv.creditAmount || 0)) {
        await this.resizeInvoiceDebt(inv, credit);
        inv.creditAmount = credit;
      }
      const base = Math.max(0, credit - paidLater);
      rows.push({ inv, paidLater, base });
    }
    const writes: { updateOne: { filter: { _id: unknown }; update: { $set: Record<string, unknown> } } }[] = [];
    for (const row of rows) {
      const credit = row.inv.creditAmount || 0;
      const surplus = Math.max(0, row.paidLater - credit);
      const remaining = row.base;
      const upfront = Math.max(0, (row.inv.finalAmount || 0) - credit);
      const paidAmount = Math.min(row.inv.finalAmount || 0, upfront + row.paidLater);
      const isPaid = remaining <= 0;
      const days = row.inv.dueDays || 15;
      const needsDue = remaining > 0 && !row.inv.dueDate;
      const dueDate = needsDue
        ? new Date(new Date(row.inv.invoiceDate || Date.now()).getTime() + days * 86400000)
        : row.inv.dueDate;
      const same =
        (row.inv.creditAmount || 0) === credit &&
        (row.inv.creditApplied || 0) === 0 &&
        (row.inv.creditSurplus || 0) === surplus &&
        (row.inv.remainingDebt || 0) === remaining &&
        (row.inv.paidAmount || 0) === paidAmount &&
        !!row.inv.isPaid === isPaid &&
        !needsDue;
      if (same) continue;
      const $set: Record<string, unknown> = {
        creditAmount: credit,
        creditApplied: 0,
        creditSurplus: surplus,
        remainingDebt: remaining,
        paidAmount,
        isPaid,
      };
      if (needsDue && dueDate) {
        $set.dueDate = dueDate;
        $set.dueDays = days;
      }
      writes.push({ updateOne: { filter: { _id: row.inv._id }, update: { $set } } });
    }
    if (writes.length) await this.invoiceModel.bulkWrite(writes);
    await this.rebuildRunningBalance(customerId);
  }

  /** Same-day cash stored on the invoice (کارتخوان/نقد/حواله/چک), not a later ledger payment. */
  private splitPaid(split?: { pos?: number; cash?: number; transfer?: number; cheque?: number }) {
    return (split?.pos || 0) + (split?.cash || 0) + (split?.transfer || 0) + (split?.cheque || 0);
  }

  /**
   * Debt charged for this invoice. A bare gap between final and credit, with no split cash,
   * is the same money as a later payment — counting both turns 22 into 2 instead of 12.
   */
  private debtBase(final: number, credit: number, splitPaid: number, paidLater: number) {
    const gap = Math.max(0, final - (credit || 0));
    if (gap > 0 && splitPaid <= 0 && paidLater + 1 >= gap) return final;
    return credit || 0;
  }

  /** Make the invoice's debt transaction match `desired`, and move the customer balance by the difference. */
  private async resizeInvoiceDebt(invoice: InvoiceDocument, desired: number) {
    const debts = await this.transactionModel
      .find({ type: 'debt', invoiceId: invoice._id })
      .sort({ date: 1, createdAt: 1 })
      .exec();
    const current = debts.reduce((s, d) => s + (d.amount || 0), 0);
    const delta = desired - current;
    if (Math.abs(delta) < 1) return;
    if (debts.length) {
      const last = debts[debts.length - 1];
      last.amount = Math.max(0, (last.amount || 0) + delta);
      await last.save();
    }
    if (invoice.customerId) await this.changeBalance(String(invoice.customerId), delta);
  }

  /**
   * Rewrite each row's مانده so it is the balance after that row.
   * Old imports stamped one number on every row, so a later payment looked negative.
   */
  private async rebuildRunningBalance(customerId: string) {
    if (!Types.ObjectId.isValid(customerId)) return;
    const customer = await this.customerModel.findById(customerId).select('balance').exec();
    if (!customer) return;
    const txs = await this.transactionModel
      .find({ customer: customer._id })
      .sort({ date: 1, createdAt: 1 })
      .exec();
    let running = customer.balance || 0;
    const writes: { updateOne: { filter: { _id: unknown }; update: { $set: { balanceAfter: number } } } }[] = [];
    for (let i = txs.length - 1; i >= 0; i--) {
      const tx = txs[i];
      if (tx.type === 'adjustment') break;
      if ((tx.balanceAfter || 0) !== running) {
        writes.push({ updateOne: { filter: { _id: tx._id }, update: { $set: { balanceAfter: running } } } });
      }
      running += tx.type === 'payment' ? tx.amount || 0 : -(tx.amount || 0);
    }
    if (writes.length) await this.transactionModel.bulkWrite(writes);
  }

  /** Put the credit portion of a sale invoice on the customer's account. */
  async addInvoiceDebt(invoice: InvoiceDocument, recordedByName: string): Promise<number> {
    if (!invoice.customerId || !invoice.creditAmount) return 0;
    const balance = await this.changeBalance(invoice.customerId as any, invoice.creditAmount);
    await this.transactionModel.create({
      customer: invoice.customerId,
      type: 'debt',
      amount: invoice.creditAmount,
      balanceAfter: balance,
      paymentMethod: 'cash',
      description: `نسیه فاکتور ${invoice.invoiceNumber}`,
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      recordedByName,
      date: invoice.invoiceDate || new Date(),
    });
    return balance;
  }

  /**
   * Remove the credit a sale invoice put on the customer's account.
   * With `detachPayments` (invoice deleted), payments that were allocated to it stay on the
   * ledger — the money was really received — and are moved to the customer's other open invoices.
   */
  async removeInvoiceDebt(invoice: InvoiceDocument, detachPayments = false): Promise<void> {
    const invoiceId = invoice._id as Types.ObjectId;
    const debts = await this.transactionModel.find({ type: 'debt', invoiceId }).exec();
    for (const d of debts) {
      await this.changeBalance(d.customer, -d.amount);
    }
    await this.transactionModel.deleteMany({ type: 'debt', invoiceId }).exec();
    if (!detachPayments) return;

    const payments = await this.transactionModel.find({ 'allocations.invoiceId': invoiceId }).exec();
    for (const tx of payments) {
      const freed = tx.allocations
        .filter((a) => String(a.invoiceId) === String(invoiceId))
        .reduce((s, a) => s + a.amount, 0);
      tx.allocations = tx.allocations.filter((a) => String(a.invoiceId) !== String(invoiceId));
      if (String(tx.invoiceId) === String(invoiceId)) tx.invoiceId = undefined;

      const open = await this.invoiceModel
        .find({ customerId: tx.customer, type: 'sale', remainingDebt: { $gt: 0 }, _id: { $ne: invoiceId } })
        .sort({ invoiceDate: 1, createdAt: 1 })
        .exec();
      let left = freed;
      const touched: InvoiceDocument[] = [];
      for (const inv of open) {
        if (left <= 0) break;
        const portion = Math.min(left, inv.remainingDebt);
        tx.allocations.push({ invoiceId: inv._id as Types.ObjectId, invoiceNumber: inv.invoiceNumber, amount: portion });
        left -= portion;
        touched.push(inv);
      }
      tx.markModified('allocations');
      await tx.save();
      for (const inv of touched) await this.syncInvoicePayment(inv);
    }
  }

  async recordTransaction(
    customerId: string,
    dto: RecordTransactionDto,
    recordedByName: string,
  ): Promise<{ customer: CustomerDocument; transaction: CustomerTransactionDocument }> {
    const customer = await this.findOne(customerId);
    const date = dto.date ? new Date(dto.date) : new Date();

    if (dto.type === 'adjustment') {
      const delta = dto.amount - customer.balance;
      const balance = await this.changeBalance(customer._id as any, delta);
      const transaction = await this.transactionModel.create({
        customer: customer._id,
        type: 'adjustment',
        amount: dto.amount,
        balanceAfter: balance,
        description: dto.description || 'اصلاح مانده حساب',
        recordedByName,
        date,
      });
      return { customer: await this.findOne(customerId), transaction };
    }

    if (dto.type === 'debt') {
      const balance = await this.changeBalance(customer._id as any, dto.amount);
      const transaction = await this.transactionModel.create({
        customer: customer._id,
        type: 'debt',
        amount: dto.amount,
        balanceAfter: balance,
        paymentMethod: dto.paymentMethod || 'cash',
        description: dto.description || 'بدهی متفرقه',
        referenceNumber: dto.referenceNumber,
        recordedByName,
        date,
      });
      return { customer: await this.findOne(customerId), transaction };
    }

    // Payment: settle one invoice, or spread over the oldest open invoices.
    let openInvoices: InvoiceDocument[];
    if (dto.invoiceId) {
      const inv = await this.invoiceModel.findById(dto.invoiceId).exec();
      if (!inv || String(inv.customerId) !== String(customer._id)) {
        throw new BadRequestException('فاکتور متعلق به این مشتری نیست');
      }
      if (dto.amount > inv.remainingDebt) {
        throw new BadRequestException(
          `مبلغ بیشتر از مانده فاکتور است (مانده: ${inv.remainingDebt.toLocaleString('fa-IR')} تومان)`,
        );
      }
      openInvoices = [inv];
    } else {
      openInvoices = await this.invoiceModel
        .find({ customerId: customer._id, type: 'sale', remainingDebt: { $gt: 0 } })
        .sort({ invoiceDate: 1, createdAt: 1 })
        .exec();
    }

    let left = dto.amount;
    const allocations: { invoiceId: Types.ObjectId; invoiceNumber: string; amount: number }[] = [];
    for (const inv of openInvoices) {
      if (left <= 0) break;
      const portion = Math.min(left, inv.remainingDebt);
      if (portion <= 0) continue;
      allocations.push({
        invoiceId: inv._id as Types.ObjectId,
        invoiceNumber: inv.invoiceNumber,
        amount: portion,
      });
      left -= portion;
    }

    const balance = await this.changeBalance(customer._id as any, -dto.amount);
    const transaction = await this.transactionModel.create({
      customer: customer._id,
      type: 'payment',
      amount: dto.amount,
      balanceAfter: balance,
      paymentMethod: dto.paymentMethod || 'cash',
      description:
        dto.description ||
        (allocations.length === 1 && dto.invoiceId
          ? `پرداخت فاکتور ${allocations[0].invoiceNumber}`
          : 'دریافت وجه'),
      referenceNumber: dto.referenceNumber,
      accountId: ['pos', 'transfer'].includes(dto.paymentMethod || '') ? dto.accountId || '' : '',
      invoiceId: dto.invoiceId ? new Types.ObjectId(dto.invoiceId) : undefined,
      invoiceNumber: dto.invoiceId ? allocations[0]?.invoiceNumber : undefined,
      allocations,
      recordedByName,
      date,
    });

    for (const inv of openInvoices) {
      if (allocations.some((a) => String(a.invoiceId) === String(inv._id))) {
        await this.syncInvoicePayment(inv);
      }
    }
    await this.alignInvoiceDebts(customerId);

    return { customer: await this.findOne(customerId), transaction };
  }

  async deleteTransaction(txId: string): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(txId)) throw new BadRequestException('شناسه نامعتبر است');
    const tx = await this.transactionModel.findById(txId).exec();
    if (!tx) throw new NotFoundException('تراکنش یافت نشد');

    if (tx.type === 'debt' && tx.invoiceId) {
      throw new BadRequestException('این بدهی مربوط به فاکتور است؛ برای حذف، فاکتور را ویرایش یا حذف کنید.');
    }
    if (tx.type === 'adjustment') {
      throw new BadRequestException('اصلاحیه مانده قابل حذف نیست؛ یک اصلاحیه جدید ثبت کنید.');
    }

    const delta = tx.type === 'payment' ? tx.amount : -tx.amount;
    await this.changeBalance(tx.customer, delta);
    const allocations = tx.allocations || [];
    await tx.deleteOne();

    for (const a of allocations) {
      const inv = await this.invoiceModel.findById(a.invoiceId).exec();
      if (inv) await this.syncInvoicePayment(inv);
    }
    await this.alignInvoiceDebts(String(tx.customer));
    return { message: 'تراکنش حذف شد' };
  }

  async getTransactions(customerId: string): Promise<CustomerTransactionDocument[]> {
    return this.transactionModel
      .find({ customer: new Types.ObjectId(customerId) })
      .sort({ date: -1, createdAt: -1 })
      .limit(300)
      .exec();
  }

  /** Receipts across all customers (لیست دریافت‌ها). */
  async listPayments(query?: { from?: string; to?: string; search?: string }) {
    const match: any = { type: 'payment' };
    if (query?.from || query?.to) {
      match.date = {};
      if (query.from) match.date.$gte = new Date(query.from);
      if (query.to) {
        const end = new Date(query.to);
        end.setHours(23, 59, 59, 999);
        match.date.$lte = end;
      }
    }
    if (query?.search?.trim()) {
      const ids = await this.customerModel
        .find({ name: { $regex: query.search.trim(), $options: 'i' } }, { _id: 1 })
        .exec();
      match.customer = { $in: ids.map((c) => c._id) };
    }

    const rows = await this.transactionModel
      .find(match)
      .sort({ date: -1, createdAt: -1 })
      .limit(500)
      .populate('customer', 'name phoneNumber')
      .lean()
      .exec();

    const total = rows.reduce((s, r) => s + (r.amount || 0), 0);
    return { total, count: rows.length, items: rows };
  }

  async getStats(): Promise<{
    totalCustomers: number;
    debtorsCount: number;
    totalDebt: number;
    settledCount: number;
    creditorsCount: number;
    totalCredit: number;
    shopsCount: number;
    walkInCount: number;
  }> {
    const customers = await this.customerModel.find({ isActive: true }).exec();

    let debtorsCount = 0;
    let totalDebt = 0;
    let settledCount = 0;
    let creditorsCount = 0;
    let totalCredit = 0;
    let walkInCount = 0;

    for (const c of customers) {
      if (c.kind === 'walkin') walkInCount++;
      if (c.balance > 0) {
        debtorsCount++;
        totalDebt += c.balance;
      } else if (c.balance === 0) {
        settledCount++;
      } else {
        creditorsCount++;
        totalCredit += Math.abs(c.balance);
      }
    }

    return {
      totalCustomers: customers.length,
      debtorsCount,
      totalDebt,
      settledCount,
      creditorsCount,
      totalCredit,
      shopsCount: customers.length - walkInCount,
      walkInCount,
    };
  }

  async sendDebtReminderSms(customerId: string): Promise<{
    success: boolean;
    recipientName: string;
    phoneNumber: string;
    amount: number;
    messageText: string;
    sentAt: Date;
  }> {
    const customer = await this.findOne(customerId);

    const formattedAmount = customer.balance.toLocaleString('fa-IR');
    const messageText = `مشتری گرامی ${customer.name}، مانده حساب شما در فروشگاه آریو مبلغ ${formattedAmount} تومان می‌باشد. جهت تسویه حساب اقدام فرمایید. با سپاس، فروشگاه آریو`;

    this.logger.log(
      `[SMS GATEWAY] Sent SMS to ${customer.phoneNumber}: "${messageText}"`,
    );

    return {
      success: true,
      recipientName: customer.name,
      phoneNumber: customer.phoneNumber || '',
      amount: customer.balance,
      messageText,
      sentAt: new Date(),
    };
  }
}
