import { Global, Module } from '@nestjs/common';
import { DemoBootstrapService } from '../common/demo-bootstrap.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, DemoBootstrapService],
  exports: [PrismaService],
})
export class PrismaModule {}
