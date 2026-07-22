import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { BranchesService } from './branches.service';
import {
  BranchDto,
  ScheduleDto,
  WeeklyBranchScheduleDto,
} from './dto/branches.dto';

@Controller('branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.branches.list(tenantId);
  }

  @Get('main')
  main(@TenantId() tenantId: string) {
    return this.branches.getWeeklySchedule(tenantId);
  }

  @Get('main/schedules')
  mainSchedules(@TenantId() tenantId: string) {
    return this.branches.getWeeklySchedule(tenantId);
  }

  @Put('main/schedules/week')
  setMainWeekly(
    @TenantId() tenantId: string,
    @Body() dto: WeeklyBranchScheduleDto,
  ) {
    return this.branches.setWeeklySchedule(tenantId, dto);
  }

  @Post('main/schedules/apply-to-workers')
  applyToWorkers(@TenantId() tenantId: string) {
    return this.branches.applyToWorkers(tenantId);
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: BranchDto) {
    return this.branches.create(tenantId, dto);
  }

  @Patch(':id')
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: Partial<BranchDto>,
  ) {
    return this.branches.update(tenantId, id, dto);
  }

  @Delete(':id')
  delete(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.branches.remove(tenantId, id);
  }

  @Post(':id/schedules')
  schedule(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ScheduleDto,
  ) {
    return this.branches.setDaySchedule(tenantId, id, dto);
  }
}
