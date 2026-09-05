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
  // ClientContactsRepository también sale: el embudo de consultas
  // asegura al consultante como persona de contacto al convertir.
  exports: [ClientsService, ClientContactsRepository],
})
export class ClientsModule {}
