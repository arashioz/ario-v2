import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CompanyPayment, CompanyPaymentDocument } from './schemas/company-payment.schema';
import { SupplierDebt, SupplierDebtDocument } from './schemas/supplier-debt.schema';
import { CashTransaction, CashTransactionDocument } from './schemas/cash-transaction.schema';

@Injectable()
export class HistoryService {
  constructor(
    @InjectModel(CompanyPayment.name)
    private readonly paymentModel: Model<CompanyPaymentDocument>,
    @InjectModel(SupplierDebt.name)
    private readonly debtModel: Model<SupplierDebtDocument>,
    @InjectModel(CashTransaction.name)
    private readonly cashModel: Model<CashTransactionDocument>,
  ) {}

  async getCompanyPayments(): Promise<CompanyPaymentDocument[]> {
    return this.paymentModel.find().sort({ date: -1, createdAt: -1 }).exec();
  }

  async getSupplierDebts(): Promise<SupplierDebtDocument[]> {
    return this.debtModel.find().sort({ date: -1, createdAt: -1 }).exec();
  }

  async getCashTransactions(limit = 100): Promise<CashTransactionDocument[]> {
    return this.cashModel.find().sort({ date: -1, createdAt: -1 }).limit(limit).exec();
  }

  async addCompanyPayment(dto: Partial<CompanyPayment>): Promise<CompanyPaymentDocument> {
    const payment = new this.paymentModel(dto);
    return payment.save();
  }
}
