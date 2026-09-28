import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FollowUpsService } from './followups.service';
import { LogFollowUpDto } from './dto/log-follow-up.dto';

@UseGuards(JwtAuthGuard)
@Controller('follow-ups')
export class FollowUpsController {
  constructor(private readonly followUpsService: FollowUpsService) {}

  @Get('due')
  getDue() {
    return this.followUpsService.getDue();
  }

  @Get('recent')
  recent(@Query('limit') limit?: string) {
    return this.followUpsService.recent(limit ? parseInt(limit, 10) || 50 : 50);
  }

  @Get('customer/:id')
  history(@Param('id') id: string) {
    return this.followUpsService.history(id);
  }

  @Post('customer/:id')
  log(@Param('id') id: string, @Body() dto: LogFollowUpDto, @Request() req: any) {
    const byName = req.user?.fullName || req.user?.username || 'کاربر سیستم';
    return this.followUpsService.log(id, dto, byName);
  }
}
