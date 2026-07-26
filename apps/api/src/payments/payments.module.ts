import { Module, forwardRef } from '@nestjs/common';
import { PlansModule } from '../plans/plans.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';
import { EpaycoService } from './epayco.service';
import { EpaycoWebhookController } from './epayco-webhook.controller';

@Module({
  imports: [forwardRef(() => PlansModule)],
  controllers: [PaymentsController, EpaycoWebhookController],
  providers: [PaymentsService, StripeService, EpaycoService],
  exports: [PaymentsService, StripeService, EpaycoService],
})
export class PaymentsModule {}
