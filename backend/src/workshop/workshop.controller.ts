import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateWorkshopDto } from './workshop.dto';
import { WorkshopService } from './workshop.service';

@UseGuards(JwtAuthGuard)
@Controller('workshop')
export class WorkshopController {
  constructor(private readonly workshop: WorkshopService) {}
  @Get() list() {
    return this.workshop.list();
  }
  @Post() create(@Body() dto: CreateWorkshopDto, @Request() req: any) {
    return this.workshop.create(
      dto,
      req.user?.fullName || req.user?.username || 'کاربر سیستم',
    );
  }
}
