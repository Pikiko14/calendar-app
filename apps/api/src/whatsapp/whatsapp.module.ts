import { Module, forwardRef } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AiModule } from '../ai/ai.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { WhatsappBaileysService } from './whatsapp-baileys.service';

@Module({
  imports: [forwardRef(() => AppointmentsModule), AiModule, ReviewsModule],
  controllers: [WhatsappController],
  providers: [WhatsappService, WhatsappBaileysService],
  exports: [WhatsappService, WhatsappBaileysService],
})
export class WhatsappModule {}
