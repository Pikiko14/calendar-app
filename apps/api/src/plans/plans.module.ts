import { Global, Module, forwardRef } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { SubscriptionGuard } from '../common/guards/subscription.guard';

@Global()
@Module({
  imports: [forwardRef(() => PaymentsModule)],
  controllers: [PlansController],
  providers: [PlansService, SubscriptionGuard],
  exports: [PlansService, SubscriptionGuard],
})
export class PlansModule {}
