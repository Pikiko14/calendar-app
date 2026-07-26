import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller('reports')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('overview')
  overview(
    @TenantId() tenantId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.reports.overview(tenantId, from, to);
  }

  @Get('revenue')
  revenue(
    @TenantId() tenantId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.reports.paidSales(tenantId, from, to);
  }

  @Get('revenue.csv')
  async csv(
    @TenantId() tenantId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    const body = await this.reports.csv(tenantId, from, to);
    res.type('text/csv').send(body);
  }
}
