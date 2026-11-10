import { Module } from '@nestjs/common';
import { ClientsModule } from 'src/clients/clients.module';
import { PeopleController } from './people.controller';
import { PeopleRepository } from './people.repository';
import { PeopleService } from './people.service';

// ClientsModule: lo que ve cada cargo según el tipo de cliente (doc 22 §9).
@Module({
  imports: [ClientsModule],
  controllers: [PeopleController],
  providers: [PeopleService, PeopleRepository],
  exports: [PeopleService],
})
export class PeopleModule {}
