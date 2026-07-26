import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { SkipSubscription } from '../common/decorators/skip-subscription.decorator';
import { TenantId } from '../common/decorators/tenant.decorator';
import { PlansService } from './plans.service';
import { EpaycoService } from '../payments/epayco.service';

class SelectPlanDto {
  @IsString()
  @MinLength(3)
  planId!: string;
}

class ConfirmPaymentDto {
  @IsString()
  @MinLength(5)
  paymentId!: string;
}

class SyncEpaycoDto {
  @IsString()
  @MinLength(3)
  refPayco!: string;
}

@ApiTags('plans')
@Controller('plans')
@SkipSubscription()
export class PlansController {
  constructor(
    private readonly plans: PlansService,
    private readonly epayco: EpaycoService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Listar planes disponibles (público)' })
  list() {
    return this.plans.list();
  }

  @Get('billing-config')
  @Roles(
    UserRole.ADMIN,
    UserRole.RECEPTIONIST,
    UserRole.SUPER_ADMIN,
    UserRole.WORKER,
  )
  @ApiOperation({ summary: 'Estado de la pasarela de cobro' })
  billingConfig() {
    const configured = this.epayco.isConfigured();
    return {
      provider: 'EPAYCO',
      configured,
      publicKey: configured ? this.epayco.publicKey() : null,
      test: this.epayco.isTestMode(),
      demoMode: !configured,
      confirmationUrl: this.epayco.confirmationUrl(),
    };
  }

  @Get('current')
  @Roles(
    UserRole.ADMIN,
    UserRole.RECEPTIONIST,
    UserRole.SUPER_ADMIN,
    UserRole.WORKER,
  )
  @ApiOperation({ summary: 'Plan / suscripción actual y uso' })
  current(@TenantId() tenantId: string) {
    return this.plans.getUsage(tenantId);
  }

  @Post('select')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Iniciar checkout de plan (ePayco)' })
  select(@TenantId() tenantId: string, @Body() body: SelectPlanDto) {
    return this.plans.selectPlan(tenantId, body.planId);
  }

  @Post('checkout')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Checkout ePayco de suscripción' })
  checkout(@TenantId() tenantId: string, @Body() body: SelectPlanDto) {
    return this.plans.checkout(tenantId, body.planId);
  }

  @Post('confirm-payment')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Confirmar pago demo (solo sin llaves ePayco)',
  })
  confirm(
    @TenantId() tenantId: string,
    @Body() body: ConfirmPaymentDto,
  ) {
    return this.plans.confirmCheckout(tenantId, body.paymentId);
  }

  @Post('epayco/sync')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Sincronizar pago ePayco tras response URL (ref_payco)',
  })
  syncEpayco(
    @TenantId() tenantId: string,
    @Body() body: SyncEpaycoDto,
  ) {
    return this.plans.syncEpaycoRef(tenantId, body.refPayco);
  }

  @Public()
  @Get(':code')
  @ApiOperation({ summary: 'Detalle de un plan por código' })
  async byCode(@Param('code') code: string) {
    const plans = await this.plans.list();
    return (
      plans.find((p) => p.code.toLowerCase() === code.toLowerCase()) ?? null
    );
  }
}
