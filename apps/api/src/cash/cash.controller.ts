import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CashService } from './cash.service';

class OpenCashDto {
  @IsOptional() @IsNumber() @Min(0) openingFloat?: number;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() notes?: string;
}

class CloseCashDto {
  @IsNumber() @Min(0) closingCash!: number;
  @IsOptional() @IsString() notes?: string;
}

class ExpenseDto {
  @IsString() category!: string;
  @IsNumber() @Min(0) amount!: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() date?: string;
}

@ApiTags('cash')
@Controller('cash')
@Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
export class CashController {
  constructor(private readonly cash: CashService) {}

  @Get('current')
  current(@TenantId() tenantId: string) {
    return this.cash.current(tenantId);
  }

  @Get('expenses')
  expenses(@TenantId() tenantId: string) {
    return this.cash.listExpenses(tenantId);
  }

  @Get()
  list(@TenantId() tenantId: string) {
    return this.cash.list(tenantId);
  }

  @Post('open')
  open(
    @TenantId() tenantId: string,
    @Body() dto: OpenCashDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.cash.open(tenantId, { ...dto, openedById: userId });
  }

  @Post('expenses')
  createExpense(@TenantId() tenantId: string, @Body() dto: ExpenseDto) {
    return this.cash.createExpense(tenantId, dto);
  }

  @Post(':id/close')
  close(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CloseCashDto,
  ) {
    return this.cash.close(tenantId, id, dto);
  }
}
