import { api } from './api';

export interface ExpenseItem {
  _id: string;
  type: 'withdrawal' | 'shipping' | 'salary' | 'utilities' | 'rent' | 'other';
  categoryId?: string;
  categoryName: string;
  amount: number;
  description: string;
  date: string;
  isPersonalWithdrawal: boolean;
  paymentMethod: string;
  recordedByName?: string;
  createdAt?: string;
}

export interface ProfitLossReport {
  period: {
    startDate: string | null;
    endDate: string | null;
  };
  salesSummary: {
    totalSales: number;
    totalCostOfGoods: number;
    grossProfit: number;
    grossProfitMarginPercent: number;
    salesCount: number;
    totalSalesWeightKg: number;
    profitPerKg: number;
    markupPercent: number;
  };
  expensesSummary: {
    operatingExpenses: number;
    managerWithdrawals: number;
    totalAllOutflows: number;
    byType: Record<string, { count: number; total: number; label: string }>;
  };
  profitAnalysis: {
    netStoreProfit: number; // سود واقعی مغازه (قبل از برداشت مدیر)
    netProfitMarginPercent: number;
    managerWithdrawals: number; // مجموع برداشت‌های شخصی مدیر
    retainedProfit: number; // سود پس از کسر برداشت‌های شخصی
  };
  recentWithdrawals: ExpenseItem[];
  recentStoreExpenses: ExpenseItem[];
}

export const expensesService = {
  async getAll(params?: {
    type?: string;
    isPersonalWithdrawal?: boolean;
    search?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<ExpenseItem[]> {
    const res = await api.get('/expenses', { params });
    return res.data;
  },

  async getProfitLoss(params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<ProfitLossReport> {
    const res = await api.get('/expenses/profit-loss', { params });
    return res.data;
  },

  async getCategories() {
    const res = await api.get('/expenses/categories');
    return res.data;
  },

  async create(data: Partial<ExpenseItem>): Promise<ExpenseItem> {
    const res = await api.post('/expenses', data);
    return res.data;
  },

  async update(id: string, data: Partial<ExpenseItem>): Promise<ExpenseItem> {
    const res = await api.put(`/expenses/${id}`, data);
    return res.data;
  },

  async delete(id: string): Promise<{ success: boolean; message: string }> {
    const res = await api.delete(`/expenses/${id}`);
    return res.data;
  },
};
