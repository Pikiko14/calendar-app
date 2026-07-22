import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [ScheduleModule.forRoot(), forwardRef(() => WhatsappModule)],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
