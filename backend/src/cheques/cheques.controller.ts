import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ChequesService } from './cheques.service';
import { CreateChequeDto, UpdateChequeStatusDto } from './dto/create-cheque.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('cheques')
@UseGuards(JwtAuthGuard)
export class ChequesController {
  constructor(private readonly chequesService: ChequesService) {}

  @Post()
  create(@Body() createDto: CreateChequeDto, @Request() req: any) {
    const recordedByName = req.user?.name || req.user?.username || 'مدیر سیستم';
    return this.chequesService.create(createDto, recordedByName);
  }

  @Get('stats')
  getStats() {
    return this.chequesService.getStats();
  }

  @Get()
  findAll(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('dueSoon') dueSoon?: string,
    @Query('search') search?: string,
  ) {
    return this.chequesService.findAll({ type, status, dueSoon, search });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.chequesService.findById(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() updateDto: UpdateChequeStatusDto,
  ) {
    return this.chequesService.updateStatus(id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.chequesService.delete(id);
  }
}
