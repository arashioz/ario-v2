import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Expense, ExpenseDocument } from './schemas/expense.schema';
import { ExpenseCategory, ExpenseCategoryDocument } from './schemas/expense-category.schema';
import { Invoice, InvoiceDocument } from '../invoices/schemas/invoice.schema';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { AccountingService } from '../accounting/accounting.service';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectModel(Expense.name)
    private readonly expenseModel: Model<ExpenseDocument>,
    @InjectModel(ExpenseCategory.name)
    private readonly categoryModel: Model<ExpenseCategoryDocument>,
    @InjectModel(Invoice.name)
    private readonly invoiceModel: Model<InvoiceDocument>,
    private readonly accounting: AccountingService,
  ) {}

  async findAll(query?: {
    type?: string;
    isPersonalWithdrawal?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }): Promise<ExpenseDocument[]> {
    const filter: any = {};

    if (query?.type) {
      filter.type = query.type;
    }
    if (query?.isPersonalWithdrawal !== undefined) {
      filter.isPersonalWithdrawal = query.isPersonalWithdrawal === 'true';
    }
    if (query?.startDate || query?.endDate) {
      filter.date = {};
      if (query.startDate) {
        filter.date.$gte = new Date(`${query.startDate.slice(0, 10)}T00:00:00+03:30`);
      }
      if (query.endDate) {
        filter.date.$lte = new Date(`${query.endDate.slice(0, 10)}T23:59:59.999+03:30`);
      }
    }
    if (query?.search && query.search.trim()) {
      filter.description = { $regex: query.search.trim(), $options: 'i' };
    }

    return this.expenseModel.find(filter).sort({ date: -1, createdAt: -1 }).exec();
  }

  async findById(id: string): Promise<ExpenseDocument> {
    const expense = await this.expenseModel.findById(id).exec();
    if (!expense) {
      throw new NotFoundException('هزینه مورد نظر یافت نشد');
    }
    return expense;
  }

  async create(dto: CreateExpenseDto, recordedByName = 'مدیر سیستم'): Promise<ExpenseDocument> {
    const isDeposit = dto.type === 'deposit';
    const isWithdrawal =
      !isDeposit &&
      (dto.isPersonalWithdrawal !== undefined
        ? dto.isPersonalWithdrawal
        : dto.type === 'withdrawal' || (dto.description && dto.description.includes('برداشت')));

    let categoryName = dto.categoryName;
    if (!categoryName) {
      switch (dto.type) {
        case 'withdrawal':
          categoryName = 'برداشت شخصی مدیر';
          break;
        case 'deposit':
          categoryName = 'واریز به حساب مدیر';
          break;
        case 'shipping':
          categoryName = 'ارسال بار و کرایه';
          break;
        case 'salary':
          categoryName = 'حقوق و دستمزد';
          break;
        case 'utilities':
          categoryName = 'قبوض و نرم‌افزار';
          break;
        case 'rent':
          categoryName = 'اجاره محل';
          break;
        default:
          categoryName = 'سایر هزینه‌های فروشگاه';
      }
    }

    const expense = new this.expenseModel({
      type: dto.type,
      categoryId: dto.categoryId,
      categoryName,
      amount: dto.amount,
      description: dto.description || '',
      date: dto.date ? new Date(dto.date) : new Date(),
      isPersonalWithdrawal: isWithdrawal,
      paymentMethod: dto.paymentMethod || 'card',
      recordedByName,
    });

    return expense.save();
  }

  async update(id: string, dto: Partial<CreateExpenseDto>): Promise<ExpenseDocument> {
    const updateData: any = { ...dto };
    if (dto.type === 'withdrawal') updateData.isPersonalWithdrawal = true;
    if (dto.type === 'deposit') updateData.isPersonalWithdrawal = false;
    if (dto.date) {
      updateData.date = new Date(dto.date);
    }

    const updated = await this.expenseModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException('هزینه مورد نظر یافت نشد');
    }
    return updated;
  }

  async delete(id: string): Promise<{ success: boolean; message: string }> {
    const deleted = await this.expenseModel.findByIdAndDelete(id).exec();
    if (!deleted) {
      throw new NotFoundException('هزینه مورد نظر یافت نشد');
    }
    return { success: true, message: 'هزینه با موفقیت حذف شد' };
  }

  async getCategories(): Promise<ExpenseCategoryDocument[]> {
    return this.categoryModel.find({ active: true }).sort({ sortOrder: 1 }).exec();
  }

  /**
   * گزارش سود و زیان (P&L) هوشمند با تفکیک سود خالص مغازه و برداشت شخصی مدیر
   */
  async getProfitLossReport(query?: { startDate?: string; endDate?: string }) {
    const invoiceFilter: any = { type: 'sale' };
    const expenseFilter: any = {};

    if (query?.startDate || query?.endDate) {
      invoiceFilter.invoiceDate = {};
      expenseFilter.date = {};

      // Whole days on the Tehran calendar, matching AccountingService.
      if (query.startDate) {
        const start = new Date(`${query.startDate.slice(0, 10)}T00:00:00+03:30`);
        invoiceFilter.invoiceDate.$gte = start;
        expenseFilter.date.$gte = start;
      }
      if (query.endDate) {
        const end = new Date(`${query.endDate.slice(0, 10)}T23:59:59.999+03:30`);
        invoiceFilter.invoiceDate.$lte = end;
        expenseFilter.date.$lte = end;
      }
    }

    // Cost of goods sold from the FIFO engine (actual purchase price of the goods that left).
    const [sales, salesCount] = await Promise.all([
      this.accounting.periodSales({ from: query?.startDate, to: query?.endDate }),
      this.invoiceModel.countDocuments(invoiceFilter),
    ]);
    const totalSales = sales.revenue;
    const totalCostOfGoods = sales.cost;
    const totalSalesWeightKg = sales.kg;
    const grossProfit = sales.profit;

    // 2. دریافت هزینه‌ها و برداشت‌های مدیر
    const allExpenses = await this.expenseModel.find(expenseFilter).sort({ date: -1 }).exec();

    let operatingExpenses = 0; // هزینه‌های جاری مغازه
    let managerWithdrawals = 0; // برداشت‌های شخصی مدیر
    let managerDeposits = 0; // واریز مدیر و درآمدهای دیگر
    let capitalizedFreight = 0; // کرایه حمل خرید که در بهای تمام‌شده کالا آمده
    const expensesByType: Record<string, { count: number; total: number; label: string }> = {
      withdrawal: { count: 0, total: 0, label: 'برداشت شخصی مدیر' },
      deposit: { count: 0, total: 0, label: 'واریز مدیر' },
      shipping: { count: 0, total: 0, label: 'ارسال بار و کرایه' },
      salary: { count: 0, total: 0, label: 'حقوق و دستمزد' },
      utilities: { count: 0, total: 0, label: 'قبوض و انرژی' },
      rent: { count: 0, total: 0, label: 'اجاره' },
      other: { count: 0, total: 0, label: 'سایر هزینه‌های فروشگاه' },
    };

    const withdrawalsList: any[] = [];
    const storeExpensesList: any[] = [];

    for (const exp of allExpenses) {
      if (exp.capitalized) {
        capitalizedFreight += exp.amount || 0;
        continue;
      }
      const typeKey = exp.type || 'other';
      if (!expensesByType[typeKey]) {
        expensesByType[typeKey] = { count: 0, total: 0, label: exp.categoryName || typeKey };
      }
      expensesByType[typeKey].count++;
      expensesByType[typeKey].total += exp.amount || 0;

      if (exp.type === 'deposit') {
        managerDeposits += exp.amount || 0;
        withdrawalsList.push(exp);
      } else if (exp.isPersonalWithdrawal || exp.type === 'withdrawal') {
        managerWithdrawals += exp.amount || 0;
        withdrawalsList.push(exp);
      } else {
        operatingExpenses += exp.amount || 0;
        storeExpensesList.push(exp);
      }
    }

    // سود خالص مغازه قبل از برداشت مدیر
    const netStoreProfit = grossProfit - operatingExpenses;
    // بدهی مدیر = برداشت‌ها منهای واریزها (درآمد دیگر یا بازگشت پول)
    const managerDebt = managerWithdrawals - managerDeposits;

    // سود نهایی پس از کسر مانده برداشت مدیر
    const retainedProfit = netStoreProfit - managerDebt;

    const fifo = await this.accounting.fifo();
    const recentSales = fifo.invoices
      .filter((inv) => inv.type === 'sale')
      .filter((inv) => {
        const day = inv.invoiceDate;
        if (query?.startDate && day < new Date(`${query.startDate.slice(0, 10)}T00:00:00+03:30`)) return false;
        if (query?.endDate && day > new Date(`${query.endDate.slice(0, 10)}T23:59:59.999+03:30`)) return false;
        return true;
      })
      .sort((a, b) => +new Date(b.invoiceDate) - +new Date(a.invoiceDate))
      .slice(0, 20);

    return {
      period: {
        startDate: query?.startDate || null,
        endDate: query?.endDate || null,
      },
      salesSummary: {
        totalSales,
        totalCostOfGoods,
        grossProfit,
        grossProfitMarginPercent: totalSales > 0 ? Math.round((grossProfit / totalSales) * 1000) / 10 : 0,
        salesCount,
        totalSalesWeightKg: Math.round(totalSalesWeightKg * 10) / 10,
        profitPerKg: sales.profitPerKg,
        markupPercent: sales.markupPercent,
      },
      expensesSummary: {
        operatingExpenses, // هزینه‌های عملیاتی مغازه
        managerWithdrawals, // مجموع برداشت‌های شخصی مدیر
        managerDeposits,
        managerDebt,
        totalAllOutflows: operatingExpenses + managerWithdrawals,
        capitalizedFreight,
        byType: expensesByType,
      },
      profitAnalysis: {
        // ۱. سود واقعی مغازه (بدون کم کردن برداشت‌های شخصی مدیر)
        netStoreProfit,
        netProfitMarginPercent: totalSales > 0 ? Math.round((netStoreProfit / totalSales) * 1000) / 10 : 0,

        // ۲. چقدر مدیر برداشته و چقدر واریز کرده
        managerWithdrawals,
        managerDeposits,
        managerDebt,

        // ۳. سود پس از کسر مانده برداشت شخصی مدیر
        retainedProfit,
      },
      recentSales: recentSales.map((inv) => ({
        id: String(inv._id),
        invoiceNumber: inv.invoiceNumber,
        date: inv.invoiceDate,
        customerName: inv.customerName,
        sellAmount: inv.finalAmount || 0,
        profit: Math.round(fifo.invoiceProfit.get(String(inv._id))?.profit || 0),
      })),
      recentWithdrawals: withdrawalsList.slice(0, 20),
      recentStoreExpenses: storeExpensesList.slice(0, 20),
    };
  }
}
