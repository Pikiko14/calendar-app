import { Module } from '@nestjs/common';
import { PlansModule } from '../plans/plans.module';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

@Module({
  imports: [PlansModule],
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
