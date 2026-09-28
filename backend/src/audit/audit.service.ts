import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog, AuditLogDocument, AUDIT_ACTIONS } from './schemas/audit-log.schema';
import type { AuditAction } from './schemas/audit-log.schema';

export type AuditEntry = Partial<Omit<AuditLog, 'createdAt'>> & { action: AuditAction };

export interface AuditQuery {
  action?: string;
  entity?: string;
  userId?: string;
  entityId?: string;
  search?: string;
  from?: string;
  to?: string;
  failed?: string;
  page?: string;
  limit?: string;
}

const SECRET_KEY = /pass(word)?|access_token|secret/i;
const MAX_SNAPSHOT_CHARS = 200_000;
const IGNORED_DIFF_KEYS = new Set(['updatedAt', 'createdAt', '__v']);
const MAX_CHANGES = 200;

/** JSON-safe deep copy with secrets stripped; oversize snapshots are cut to a preview. */
export function sanitize(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  let json: string;
  try {
    json = JSON.stringify(value, (key, v) => {
      if (key && SECRET_KEY.test(key)) return undefined;
      if (v && typeof v === 'object' && v.type === 'Buffer' && Array.isArray(v.data)) return '[binary]';
      return v;
    });
  } catch {
    return '[unserializable]';
  }
  if (json === undefined) return undefined;
  if (json.length > MAX_SNAPSHOT_CHARS) return { truncated: true, preview: json.slice(0, 2000) };
  return JSON.parse(json);
}

function flatten(obj: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    if (prefix) out[prefix] = obj;
    return out;
  }
  const entries = Array.isArray(obj) ? obj.map((v, i) => [String(i), v] as const) : Object.entries(obj as object);
  if (!entries.length && prefix) out[prefix] = Array.isArray(obj) ? [] : {};
  for (const [k, v] of entries) {
    if (!prefix && IGNORED_DIFF_KEYS.has(k)) continue;
    flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

export function diff(before: unknown, after: unknown) {
  const a = flatten(before);
  const b = flatten(after);
  const changes: { path: string; from?: unknown; to?: unknown }[] = [];
  for (const path of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[path]) === JSON.stringify(b[path])) continue;
    const secret = path.split('.').some((seg) => SECRET_KEY.test(seg));
    changes.push(secret ? { path, from: '••••', to: '••••' } : { path, from: a[path], to: b[path] });
    if (changes.length >= MAX_CHANGES) break;
  }
  return changes;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** YYYY-MM-DD on the Tehran calendar → UTC instant of its start (Tehran is UTC+3:30). */
const tehranDayStart = (ymd: string) => new Date(`${ymd.slice(0, 10)}T00:00:00+03:30`);

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@InjectModel(AuditLog.name) private logModel: Model<AuditLogDocument>) {}

  /** Never throws: a failed audit write must not break the request that caused it. */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.logModel.create({
        ...entry,
        before: sanitize(entry.before),
        after: sanitize(entry.after),
        body: sanitize(entry.body),
      });
    } catch (err) {
      this.logger.error(`Audit write failed: ${(err as Error).message}`);
    }
  }

  private filter(q: AuditQuery) {
    const f: Record<string, any> = {};
    if (q.action) {
      const actions = q.action.split(',').filter((a) => (AUDIT_ACTIONS as readonly string[]).includes(a));
      if (actions.length) f.action = { $in: actions };
    }
    if (q.entity) f.entity = q.entity;
    if (q.entityId) f.entityId = q.entityId;
    if (q.userId) f.userId = q.userId;
    if (q.failed === 'true') f.success = false;
    if (q.from || q.to) {
      f.createdAt = {};
      if (q.from) f.createdAt.$gte = tehranDayStart(q.from);
      if (q.to) f.createdAt.$lt = new Date(tehranDayStart(q.to).getTime() + 86400000);
    }
    if (q.search?.trim()) {
      const rx = new RegExp(escapeRegex(q.search.trim()), 'i');
      f.$or = [{ title: rx }, { userFullName: rx }, { username: rx }, { entityId: rx }, { path: rx }];
    }
    return f;
  }

  async list(q: AuditQuery) {
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));
    const page = Math.max(1, Number(q.page) || 1);
    const f = this.filter(q);
    const [items, total] = await Promise.all([
      this.logModel
        .find(f)
        .select('-before -after -body')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.logModel.countDocuments(f),
    ]);
    return {
      items: items.map((i: any) => ({ ...i, changesCount: i.changes?.length ?? 0, changes: undefined })),
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('رویداد یافت نشد');
    const log = await this.logModel.findById(id).lean();
    if (!log) throw new NotFoundException('رویداد یافت نشد');
    return log;
  }

  async stats() {
    const since = new Date(Date.now() - 86400000);
    const [today, total, users, entities] = await Promise.all([
      this.logModel.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: { action: '$action', success: '$success' }, n: { $sum: 1 } } },
      ]),
      this.logModel.countDocuments(),
      this.logModel.aggregate([
        { $match: { userId: { $ne: '' } } },
        { $group: { _id: '$userId', name: { $last: '$userFullName' }, username: { $last: '$username' }, n: { $sum: 1 } } },
        { $sort: { n: -1 } },
      ]),
      this.logModel.aggregate([
        { $match: { entity: { $ne: '' } } },
        { $group: { _id: '$entity', label: { $last: '$entityLabel' }, n: { $sum: 1 } } },
        { $sort: { n: -1 } },
      ]),
    ]);
    const count = (action: string, success?: boolean) =>
      today.filter((t) => t._id.action === action && (success === undefined || t._id.success === success)).reduce((s, t) => s + t.n, 0);
    return {
      total,
      last24h: {
        create: count('create', true),
        update: count('update', true) + count('action', true),
        delete: count('delete', true),
        failed: today.filter((t) => t._id.success === false).reduce((s, t) => s + t.n, 0),
        loginFailed: count('login_failed'),
        alerts: count('alert'),
      },
      users: users.map((u) => ({ userId: u._id, name: u.name || u.username, username: u.username, count: u.n })),
      entities: entities.map((e) => ({ entity: e._id, label: e.label, count: e.n })),
    };
  }

  /** Sell price changes made through the general product edit (they are not in product.priceHistory). */
  async productPriceEdits(): Promise<{ productId: string; date: Date; price: number; by: string }[]> {
    const logs = await this.logModel
      .find({ entity: 'product', action: 'update', success: true, 'changes.path': { $in: ['priceRetail', 'sellPrice'] } })
      .select('entityId createdAt changes userFullName path')
      .sort({ createdAt: 1 })
      .lean();
    const out: { productId: string; date: Date; price: number; by: string }[] = [];
    for (const l of logs as any[]) {
      if (/\/price$/.test(l.path)) continue; // already in priceHistory
      const c = l.changes.find((x: any) => x.path === 'priceRetail') ?? l.changes.find((x: any) => x.path === 'sellPrice');
      if (typeof c?.to === 'number' && c.to > 0) out.push({ productId: l.entityId, date: l.createdAt, price: c.to, by: l.userFullName });
    }
    return out;
  }
}
