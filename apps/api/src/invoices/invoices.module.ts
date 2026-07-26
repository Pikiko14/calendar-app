import { Module, forwardRef } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [forwardRef(() => WhatsappModule)],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
