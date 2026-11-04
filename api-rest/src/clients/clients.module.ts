import { Module } from '@nestjs/common';
import { UsersRepository } from 'src/users/users.repository';
import {
  ClientContactsController,
  ClientContactsRepository,
} from './client-contacts.controller';
import { ClientsController } from './clients.controller';
import { ClientsRepository } from './clients.repository';
import { ClientsService } from './clients.service';
import { RazonesSocialesController } from './razones-sociales/razones-sociales.controller';
import { RazonesSocialesRepository } from './razones-sociales/razones-sociales.repository';
import { RazonesSocialesService } from './razones-sociales/razones-sociales.service';

@Module({
  controllers: [
    ClientsController,
    ClientContactsController,
    RazonesSocialesController,
  ],
  providers: [
    ClientsService,
    ClientsRepository,
    UsersRepository,
    ClientContactsRepository,
    RazonesSocialesService,
    RazonesSocialesRepository,
  ],
  // ClientContactsRepository también sale: el embudo de consultas
  // asegura al consultante como persona de contacto al convertir.
  // RazonesSocialesService sale para la facturación (doc 19, paso 2).
  exports: [ClientsService, ClientContactsRepository, RazonesSocialesService],
})
export class ClientsModule {}
