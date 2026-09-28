import { Controller, Delete, Get, Param, Post, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { SettingsService } from '../settings/settings.service';
import { BackupService } from './backup.service';

@Controller('backup')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class BackupController {
  constructor(
    private readonly backup: BackupService,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  async status() {
    const [files, s] = await Promise.all([this.backup.list(), this.settings.get()]);
    return { settings: s.backup, files, lastError: this.backup.lastError };
  }

  @Post('run')
  run() {
    return this.backup.run();
  }

  @Get('export')
  async exportDay(@Query('date') date: string | undefined, @Res({ passthrough: true }) res: Response) {
    const day = this.backup.parseDay(date);
    const csv = await this.backup.dailyCsv(day);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ario-invoices-${this.backup.dayKey(day)}.csv"`,
    });
    return csv;
  }

  @Get('files/:name')
  async download(@Param('name') name: string, @Res({ passthrough: true }) res: Response) {
    const { stream, size } = await this.backup.open(name);
    res.set({
      'Content-Type': name.endsWith('.csv') ? 'text/csv; charset=utf-8' : 'application/gzip',
      'Content-Length': String(size),
      'Content-Disposition': `attachment; filename="${name}"`,
    });
    return new StreamableFile(stream);
  }

  @Delete('files/:name')
  async remove(@Param('name') name: string) {
    await this.backup.remove(name);
    return { ok: true };
  }
}
