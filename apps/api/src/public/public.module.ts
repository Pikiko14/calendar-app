import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { ClientsModule } from '../clients/clients.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { PublicController } from './public.controller';

@Module({
  imports: [AppointmentsModule, ReviewsModule, ClientsModule],
  controllers: [PublicController],
})
export class PublicModule {}
