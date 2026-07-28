import { Module } from '@nestjs/common';
import { UsersRepository } from 'src/users/users.repository';
import {
  ClientContactsController,
  ClientContactsRepository,
} from './client-contacts.controller';
import { ClientsController } from './clients.controller';
import { ClientsRepository } from './clients.repository';
import { ClientsService } from './clients.service';

@Module({
  controllers: [ClientsController, ClientContactsController],
  providers: [
    ClientsService,
    ClientsRepository,
    UsersRepository,
    ClientContactsRepository,
  ],
  exports: [ClientsService],
})
export class ClientsModule {}
