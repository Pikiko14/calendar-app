import { Global, Module } from '@nestjs/common';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { SubscriptionGuard } from '../common/guards/subscription.guard';

@Global()
@Module({
  controllers: [PlansController],
  providers: [PlansService, SubscriptionGuard],
  exports: [PlansService, SubscriptionGuard],
})
export class PlansModule {}
