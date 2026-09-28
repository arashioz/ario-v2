import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('expenses')
@UseGuards(JwtAuthGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get('categories')
  getCategories() {
    return this.expensesService.getCategories();
  }

  @Get('profit-loss')
  getProfitLossReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.expensesService.getProfitLossReport({ startDate, endDate });
  }

  @Get()
  findAll(
    @Query('type') type?: string,
    @Query('isPersonalWithdrawal') isPersonalWithdrawal?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
  ) {
    return this.expensesService.findAll({
      type,
      isPersonalWithdrawal,
      startDate,
      endDate,
      search,
    });
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.expensesService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateExpenseDto, @Request() req: any) {
    const recordedByName = req.user?.fullName || req.user?.username || 'مدیر سیستم';
    return this.expensesService.create(dto, recordedByName);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateExpenseDto>) {
    return this.expensesService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.expensesService.delete(id);
  }
}
