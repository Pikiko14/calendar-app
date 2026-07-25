import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_SUBSCRIPTION_KEY } from '../decorators/skip-subscription.decorator';
import { PlansService } from '../../plans/plans.service';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly plans: PlansService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_SUBSCRIPTION_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (skip) return true;

    const user = ctx.switchToHttp().getRequest().user as
      | { tenantId?: string; role?: UserRole }
      | undefined;

    if (!user) return true; // JwtAuthGuard ya bloqueó o es ruta pública
    if (user.role === UserRole.SUPER_ADMIN) return true;
    if (!user.tenantId) return true;

    const active = await this.plans.hasActiveSubscription(user.tenantId);
    if (!active) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'SUBSCRIPTION_REQUIRED',
        message:
          'Necesitas una suscripción activa para usar la app. Elige un plan en Ajustes → Planes.',
      });
    }
    return true;
  }
}
