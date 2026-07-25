import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant.decorator';
import { PlansService } from './plans.service';

class SelectPlanDto {
  @IsString()
  @MinLength(3)
  planId!: string;
}

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  @Roles(
    UserRole.ADMIN,
    UserRole.RECEPTIONIST,
    UserRole.SUPER_ADMIN,
    UserRole.WORKER,
  )
  @ApiOperation({ summary: 'Listar planes disponibles' })
  list() {
    return this.plans.list();
  }

  @Get('current')
  @Roles(
    UserRole.ADMIN,
    UserRole.RECEPTIONIST,
    UserRole.SUPER_ADMIN,
    UserRole.WORKER,
  )
  @ApiOperation({ summary: 'Plan actual y uso del negocio' })
  current(@TenantId() tenantId: string) {
    return this.plans.getUsage(tenantId);
  }

  @Post('select')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Cambiar plan del negocio' })
  select(@TenantId() tenantId: string, @Body() body: SelectPlanDto) {
    return this.plans.selectPlan(tenantId, body.planId);
  }

  @Get(':code')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.RECEPTIONIST)
  @ApiOperation({ summary: 'Detalle de un plan por código' })
  async byCode(@Param('code') code: string) {
    const plans = await this.plans.list();
    return plans.find((p) => p.code.toLowerCase() === code.toLowerCase()) ?? null;
  }
}
