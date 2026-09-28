import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cheque, ChequeDocument } from './schemas/cheque.schema';
import { CreateChequeDto, UpdateChequeStatusDto } from './dto/create-cheque.dto';

@Injectable()
export class ChequesService {
  constructor(
    @InjectModel(Cheque.name)
    private chequeModel: Model<ChequeDocument>,
  ) {}

  async create(createDto: CreateChequeDto, recordedByName: string): Promise<ChequeDocument> {
    let customerId: Types.ObjectId | undefined;
    if (createDto.customerId && Types.ObjectId.isValid(createDto.customerId)) {
      customerId = new Types.ObjectId(createDto.customerId);
    }

    const cheque = new this.chequeModel({
      ...createDto,
      customerId,
      issueDate: createDto.issueDate ? new Date(createDto.issueDate) : new Date(),
      dueDate: new Date(createDto.dueDate),
      status: createDto.status || 'pending',
      recordedByName,
    });

    return await cheque.save();
  }

  async findAll(query: {
    type?: string;
    status?: string;
    dueSoon?: string;
    search?: string;
  }): Promise<ChequeDocument[]> {
    const filter: any = {};

    if (query.type && (query.type === 'received' || query.type === 'paid')) {
      filter.type = query.type;
    }

    if (query.status && ['pending', 'passed', 'bounced', 'endorsed'].includes(query.status)) {
      filter.status = query.status;
    }

    if (query.dueSoon === 'true') {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const nextWeek = new Date();
      nextWeek.setDate(now.getDate() + 7);
      nextWeek.setHours(23, 59, 59, 999);

      filter.status = 'pending';
      filter.dueDate = { $lte: nextWeek };
    }

    if (query.search && query.search.trim()) {
      const regex = new RegExp(query.search.trim(), 'i');
      filter.$or = [
        { chequeNumber: regex },
        { sayadNumber: regex },
        { partyName: regex },
        { bankName: regex },
        { drawerName: regex },
      ];
    }

    return await this.chequeModel.find(filter).sort({ dueDate: 1 }).exec();
  }

  async findById(id: string): Promise<ChequeDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('شناسه چک نامعتبر است.');
    }
    const cheque = await this.chequeModel.findById(id).exec();
    if (!cheque) {
      throw new NotFoundException('چک مورد نظر یافت نشد.');
    }
    return cheque;
  }

  async updateStatus(
    id: string,
    updateDto: UpdateChequeStatusDto,
  ): Promise<ChequeDocument> {
    const cheque = await this.findById(id);

    cheque.status = updateDto.status;
    cheque.statusDate = updateDto.statusDate ? new Date(updateDto.statusDate) : new Date();
    if (updateDto.statusNotes !== undefined) {
      cheque.statusNotes = updateDto.statusNotes;
    }

    return await cheque.save();
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.chequeModel.findByIdAndDelete(id).exec();
    if (!res) {
      throw new NotFoundException('چک یافت نشد.');
    }
    return true;
  }

  async getStats(): Promise<{
    pendingReceivedAmount: number;
    pendingReceivedCount: number;
    pendingPaidAmount: number;
    pendingPaidCount: number;
    dueSoonCount: number;
    dueSoonAmount: number;
    passedAmount: number;
    bouncedCount: number;
    bouncedAmount: number;
  }> {
    const all = await this.chequeModel.find().exec();

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const in7Days = new Date();
    in7Days.setDate(now.getDate() + 7);
    in7Days.setHours(23, 59, 59, 999);

    let pendingReceivedAmount = 0;
    let pendingReceivedCount = 0;
    let pendingPaidAmount = 0;
    let pendingPaidCount = 0;
    let dueSoonCount = 0;
    let dueSoonAmount = 0;
    let passedAmount = 0;
    let bouncedCount = 0;
    let bouncedAmount = 0;

    for (const c of all) {
      if (c.status === 'pending') {
        if (c.type === 'received') {
          pendingReceivedAmount += c.amount;
          pendingReceivedCount++;
        } else {
          pendingPaidAmount += c.amount;
          pendingPaidCount++;
        }

        if (c.dueDate <= in7Days) {
          dueSoonCount++;
          dueSoonAmount += c.amount;
        }
      } else if (c.status === 'passed') {
        passedAmount += c.amount;
      } else if (c.status === 'bounced') {
        bouncedCount++;
        bouncedAmount += c.amount;
      }
    }

    return {
      pendingReceivedAmount,
      pendingReceivedCount,
      pendingPaidAmount,
      pendingPaidCount,
      dueSoonCount,
      dueSoonAmount,
      passedAmount,
      bouncedCount,
      bouncedAmount,
    };
  }
}
