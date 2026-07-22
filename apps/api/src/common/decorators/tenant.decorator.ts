import { createParamDecorator, ExecutionContext } from '@nestjs/common';
export const TenantId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => ctx.switchToHttp().getRequest().user?.tenantId);
