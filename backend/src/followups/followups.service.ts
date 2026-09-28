import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { Invoice, InvoiceDocument } from '../invoices/schemas/invoice.schema';
import { FollowUp, FollowUpDocument, FollowUpResult } from './schemas/follow-up.schema';
import { LogFollowUpDto } from './dto/log-follow-up.dto';

export type DueReason = 'promise' | 'scheduled' | 'debt' | 'inactive';

const DAY = 24 * 60 * 60 * 1000;

/** Automatic rules for who should be called. */
const RULES = {
  debtRecontactDays: 7, // debtor not contacted in this many days
  inactiveDays: 30, // no purchase in this many days
  inactiveRecontactDays: 14,
};

/** Default next follow-up (in days) per call result; null = none. */
const NEXT_BY_RESULT: Record<FollowUpResult, (balance: number) => number | null> = {
  no_answer: () => 1,
  busy: () => 1,
  promised: () => 3,
  answered: (balance) => (balance > 0 ? 7 : 30),
  ordered: () => 14,
  wrong_number: () => null,
};

const PRIORITY: Record<DueReason, number> = { promise: 0, scheduled: 1, debt: 2, inactive: 3 };

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

@Injectable()
export class FollowUpsService {
  constructor(
    @InjectModel(FollowUp.name) private followUpModel: Model<FollowUpDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
  ) {}

  async getDue() {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = new Date(todayStart.getTime() + DAY);

    const [customers, lastPurchases, todayCalls] = await Promise.all([
      this.customerModel
        .find({ isActive: true })
        .select('name phoneNumber balance customerType nextFollowUpAt lastContactAt lastContactResult lastContactNote')
        .lean(),
      this.invoiceModel.aggregate<{ _id: Types.ObjectId; last: Date }>([
        { $match: { type: 'sale', customerId: { $ne: null } } },
        { $group: { _id: '$customerId', last: { $max: '$invoiceDate' } } },
      ]),
      this.followUpModel.countDocuments({ createdAt: { $gte: todayStart } }),
    ]);

    const lastPurchaseMap = new Map(lastPurchases.map((p) => [String(p._id), p.last]));
    const daysSince = (d?: Date | null) => (d ? Math.floor((now.getTime() - new Date(d).getTime()) / DAY) : null);

    const items: any[] = [];
    for (const c of customers) {
      const lastPurchaseAt = lastPurchaseMap.get(String(c._id)) ?? null;
      const contactAge = daysSince(c.lastContactAt);
      let reason: DueReason | null = null;

      if (c.nextFollowUpAt) {
        if (new Date(c.nextFollowUpAt) >= todayEnd) continue;
        reason = c.lastContactResult === 'promised' ? 'promise' : 'scheduled';
      } else if (c.balance > 0 && (contactAge === null || contactAge >= RULES.debtRecontactDays)) {
        reason = 'debt';
      } else if (
        c.phoneNumber &&
        lastPurchaseAt &&
        daysSince(lastPurchaseAt)! >= RULES.inactiveDays &&
        (contactAge === null || contactAge >= RULES.inactiveRecontactDays)
      ) {
        reason = 'inactive';
      }
      if (!reason) continue;

      items.push({
        customer: { _id: c._id, name: c.name, phoneNumber: c.phoneNumber, balance: c.balance, customerType: c.customerType },
        reason,
        dueSince: c.nextFollowUpAt ?? null,
        overdueDays: c.nextFollowUpAt ? Math.max(0, daysSince(c.nextFollowUpAt)!) : 0,
        lastContactAt: c.lastContactAt ?? null,
        lastContactResult: c.lastContactResult ?? null,
        lastContactNote: c.lastContactNote ?? null,
        lastPurchaseAt,
        daysSincePurchase: daysSince(lastPurchaseAt),
      });
    }

    items.sort(
      (a, b) =>
        PRIORITY[a.reason as DueReason] - PRIORITY[b.reason as DueReason] ||
        b.overdueDays - a.overdueDays ||
        b.customer.balance - a.customer.balance ||
        (b.daysSincePurchase ?? 0) - (a.daysSincePurchase ?? 0),
    );

    const counts = { total: items.length, promise: 0, scheduled: 0, debt: 0, inactive: 0 };
    items.forEach((i) => counts[i.reason as DueReason]++);

    return { items, counts, todayCalls, rules: RULES };
  }

  async log(customerId: string, dto: LogFollowUpDto, byName: string) {
    const customer = await this.customerModel.findById(customerId);
    if (!customer) throw new NotFoundException('مشتری یافت نشد');

    let next: Date | null;
    if (dto.nextFollowUpAt === '') next = null;
    else if (dto.nextFollowUpAt) next = startOfDay(new Date(dto.nextFollowUpAt));
    else {
      const days = NEXT_BY_RESULT[dto.result](customer.balance);
      next = days === null ? null : startOfDay(new Date(Date.now() + days * DAY));
    }

    const log = await this.followUpModel.create({
      customer: customer._id,
      result: dto.result,
      reason: dto.reason,
      note: dto.note?.trim() || undefined,
      promisedAmount: dto.promisedAmount || 0,
      nextFollowUpAt: next ?? undefined,
      createdByName: byName,
    });

    await this.customerModel.updateOne(
      { _id: customer._id },
      next
        ? {
            $set: {
              lastContactAt: new Date(),
              lastContactResult: dto.result,
              lastContactNote: dto.note?.trim() || '',
              nextFollowUpAt: next,
            },
          }
        : {
            $set: { lastContactAt: new Date(), lastContactResult: dto.result, lastContactNote: dto.note?.trim() || '' },
            $unset: { nextFollowUpAt: 1 },
          },
    );

    return log;
  }

  history(customerId: string) {
    return this.followUpModel
      .find({ customer: new Types.ObjectId(customerId) })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
  }

  recent(limit = 50) {
    return this.followUpModel
      .find()
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 200))
      .populate('customer', 'name phoneNumber balance')
      .lean();
  }
}
