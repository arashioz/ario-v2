import { Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { HistoricalRebuildService } from './historical-rebuild.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('accounting/history-rebuild')
export class HistoricalRebuildController {
  constructor(private readonly rebuild: HistoricalRebuildService) {}

  @Get()
  status() {
    return this.rebuild.status();
  }

  @Post('preflight')
  @HttpCode(HttpStatus.OK)
  preflight() {
    return this.rebuild.preflight();
  }

  @Post('prices')
  @HttpCode(HttpStatus.OK)
  prices() {
    return this.rebuild.prices();
  }

  @Post('profits')
  @HttpCode(HttpStatus.OK)
  profits() {
    return this.rebuild.profits();
  }

  @Post('performance')
  @HttpCode(HttpStatus.OK)
  performance() {
    return this.rebuild.performanceStep();
  }

  @Post('rollback')
  @HttpCode(HttpStatus.OK)
  rollback() {
    return this.rebuild.rollback();
  }
}
