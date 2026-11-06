import { Module } from '@nestjs/common';
import { ClientsModule } from 'src/clients/clients.module';
import { RefundsController } from './refunds.controller';
import { RefundsRepository } from './refunds.repository';
import { RefundsService } from './refunds.service';

// ClientsModule: lo que ve cada cargo según el tipo de cliente (doc 22 §9).
@Module({
  imports: [ClientsModule],
  controllers: [RefundsController],
  providers: [RefundsService, RefundsRepository],
  exports: [RefundsService],
})
export class RefundsModule {}
