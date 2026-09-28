import { CallHandler, ExecutionContext, ForbiddenException, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Observable, from, throwError } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { AuditService, diff } from './audit.service';
import { UsersService } from '../users/users.service';
import { resolveRoute, recordAmount, recordLabel } from './audit-routes';
import type { ResolvedRoute } from './audit-routes';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export const CONFIRM_PASSWORD_HEADER = 'x-confirm-password';

/**
 * Records every create/update/delete (with before/after snapshots and who did it) and requires
 * the acting user's password for every deletion.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditService,
    private readonly users: UsersService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    if (!MUTATING.has(req.method)) return next.handle();
    const route = resolveRoute(req.method, req.route?.path ?? req.path, req.params ?? {});
    if (!route) return next.handle();

    const started = Date.now();
    // Errors thrown by prepare() (the delete password gate) are logged inside it.
    return from(this.prepare(req, route)).pipe(
      mergeMap((before) =>
        next.handle().pipe(
          catchError((err) => {
            this.fail(req, route, before, err, started);
            return throwError(() => err);
          }),
          mergeMap((data) => from(this.finish(req, route, before, data, started)).pipe(map(() => data))),
        ),
      ),
    );
  }

  private actor(req: any) {
    const u = req.user || {};
    return {
      userId: u.id ? String(u.id) : '',
      username: u.username || '',
      userFullName: u.fullName || u.username || '',
      userRole: u.role || '',
    };
  }

  private meta(req: any) {
    const fwd = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    return {
      method: req.method,
      path: req.originalUrl?.split('?')[0] || req.path,
      ip: fwd || req.ip || '',
      userAgent: String(req.headers?.['user-agent'] || '').slice(0, 300),
    };
  }

  /** Plain JSON (ObjectIds and Dates as strings) so snapshots diff cleanly. */
  private async snapshot(route: ResolvedRoute): Promise<unknown> {
    const { model: name, key, singleton } = route.def;
    const model = name ? this.connection.models[name] : undefined;
    if (!model) return undefined;
    try {
      let doc: unknown;
      if (singleton) doc = await model.findOne().lean();
      else if (route.bulkFilter) doc = await model.find(route.bulkFilter).lean();
      else if (!route.id) return undefined;
      else if (key) doc = await model.findOne({ [key]: route.id }).lean();
      else if (!Types.ObjectId.isValid(route.id)) return undefined;
      else doc = await model.findById(route.id).lean();
      return doc ? JSON.parse(JSON.stringify(doc)) : undefined;
    } catch {
      return undefined;
    }
  }

  private async verifyDeletePassword(req: any, route: ResolvedRoute, before: unknown) {
    const header = req.headers?.[CONFIRM_PASSWORD_HEADER];
    let password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password && typeof header === 'string' && header) {
      try {
        password = decodeURIComponent(header);
      } catch {
        password = header;
      }
    }
    const reject = (code: string, message: string) => {
      this.audit.record({
        ...this.base(req, route, before),
        success: false,
        statusCode: 403,
        error: message,
        title: `${this.title(route, before)} — ${message}`,
      });
      throw new ForbiddenException({ statusCode: 403, code, message });
    };
    if (!password) reject('PASSWORD_REQUIRED', 'برای حذف، رمز عبور خود را وارد کنید');
    const account = req.user?.username ? await this.users.findByUsername(req.user.username) : null;
    if (!account || !(await bcrypt.compare(password, account.password))) reject('PASSWORD_INVALID', 'رمز عبور اشتباه است');
  }

  private async prepare(req: any, route: ResolvedRoute): Promise<unknown> {
    const needsBefore = route.action === 'update' || route.action === 'delete' || route.action === 'action';
    const before = needsBefore ? await this.snapshot(route) : undefined;
    if (route.action === 'delete') await this.verifyDeletePassword(req, route, before);
    return before;
  }

  private title(route: ResolvedRoute, doc: unknown, fallback = '') {
    const label = recordLabel(doc) || fallback;
    if (route.action === 'login' || route.action === 'logout' || route.action === 'login_failed') return route.verb;
    return [route.verb, route.def.label, label].filter(Boolean).join(' ');
  }

  private base(req: any, route: ResolvedRoute, before: unknown) {
    return {
      action: route.action,
      entity: route.def.entity,
      entityLabel: route.def.label,
      entityId: route.id || (before as any)?._id?.toString?.() || '',
      ...this.actor(req),
      ...this.meta(req),
      body: req.body && Object.keys(req.body).length ? req.body : undefined,
      before,
    };
  }

  private async finish(req: any, route: ResolvedRoute, before: unknown, data: any, started: number) {
    try {
      await this.record(req, route, before, data, started);
    } catch {
      // Logging must never fail a request that already succeeded.
    }
  }

  private async record(req: any, route: ResolvedRoute, before: unknown, data: any, started: number) {
    const entry: any = {
      ...this.base(req, route, before),
      success: true,
      durationMs: Date.now() - started,
    };

    if (route.action === 'login') {
      const u = data?.user || {};
      Object.assign(entry, { userId: u.id || '', username: u.username || '', userFullName: u.fullName || '', userRole: u.role || '' });
      entry.entityId = u.id || '';
      entry.title = `ورود ${u.fullName || u.username || ''}`.trim();
    } else if (route.action === 'create') {
      const created = data?.user ?? data;
      entry.after = created;
      entry.entityId = created?._id?.toString?.() || created?.id || '';
      entry.title = this.title(route, created);
      entry.amount = recordAmount(created);
    } else if (route.action === 'update' || route.action === 'action') {
      const after = (await this.snapshot(route)) ?? (data && typeof data === 'object' ? JSON.parse(JSON.stringify(data)) : undefined);
      entry.after = after;
      entry.changes = before && after ? diff(before, after) : [];
      entry.title = this.title(route, after ?? before);
      entry.amount = recordAmount(after ?? before);
      if (route.action === 'action' && !entry.entityId) entry.entityId = data?._id?.toString?.() || '';
    } else if (route.action === 'delete') {
      entry.title = this.title(route, before, Array.isArray(before) ? `(${before.length} مورد)` : '');
      entry.amount = recordAmount(before);
      const after = route.bulkFilter ? undefined : await this.snapshot(route);
      // Soft deletes keep the record; store it so the log shows what flipped.
      if (after) {
        entry.after = after;
        entry.changes = diff(before, after);
      }
    } else {
      entry.title = this.title(route, before);
    }
    await this.audit.record(entry);
  }

  private fail(req: any, route: ResolvedRoute, before: unknown, err: any, started: number) {
    const status = err instanceof HttpException ? err.getStatus() : 500;
    const response = err instanceof HttpException ? (err.getResponse() as any) : null;
    const message = Array.isArray(response?.message) ? response.message[0] : response?.message || err?.message || 'خطا';
    const entry: any = {
      ...this.base(req, route, before),
      success: false,
      statusCode: status,
      error: String(message),
      durationMs: Date.now() - started,
    };
    if (route.action === 'login') {
      entry.action = 'login_failed';
      entry.username = String(req.body?.username || '').toLowerCase();
      entry.userFullName = entry.username;
      entry.title = `ورود ناموفق «${entry.username}»`;
    } else {
      entry.title = `${this.title(route, before)} — ناموفق`;
    }
    this.audit.record(entry);
  }
}
