import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuditService } from './audit.service';
import type { AuditQuery } from './audit.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query() q: AuditQuery) {
    return this.audit.list(q);
  }

  @Get('stats')
  stats() {
    return this.audit.stats();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.audit.findById(id);
  }
}
