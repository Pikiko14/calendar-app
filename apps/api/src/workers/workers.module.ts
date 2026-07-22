import { Module } from '@nestjs/common';
import { BranchesModule } from '../branches/branches.module';
import { SpecialtiesModule } from '../specialties/specialties.module';
import { WorkersController } from './workers.controller';
import { WorkersService } from './workers.service';

@Module({
  imports: [BranchesModule, SpecialtiesModule],
  controllers: [WorkersController],
  providers: [WorkersService],
})
export class WorkersModule {}
