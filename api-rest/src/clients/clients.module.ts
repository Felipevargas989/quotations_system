import { Module } from '@nestjs/common';
import { CompaniesModule } from 'src/companies/companies.module';
import { StorageModule } from 'src/storage/storage.module';
import { UsersRepository } from 'src/users/users.repository';
import { AlcanceDeRecepcion } from './alcance-de-recepcion';
import {
  ClientContactsController,
  ClientContactsRepository,
} from './client-contacts.controller';
import { ClientsController } from './clients.controller';
import { ClientsRepository } from './clients.repository';
import { ClientsService } from './clients.service';
import { ConvenioPublicoController } from './convenios/convenio-publico.controller';
import {
  CorreosDeConvenios,
  ImpresoraDeConvenios,
} from './convenios/convenio-salidas';
import { ConveniosController } from './convenios/convenios.controller';
import { ConveniosRepository } from './convenios/convenios.repository';
import { ConveniosService } from './convenios/convenios.service';
import { RazonesSocialesController } from './razones-sociales/razones-sociales.controller';
import { RazonesSocialesRepository } from './razones-sociales/razones-sociales.repository';
import { RazonesSocialesService } from './razones-sociales/razones-sociales.service';

@Module({
  // El convenio del cliente (doc 24): la marca de la empresa y el balde.
  imports: [CompaniesModule, StorageModule],
  controllers: [
    ClientsController,
    ClientContactsController,
    RazonesSocialesController,
    ConveniosController,
    ConvenioPublicoController,
  ],
  providers: [
    ClientsService,
    ClientsRepository,
    // Lo que ve recepción de las cotizaciones (doc 21).
    AlcanceDeRecepcion,
    UsersRepository,
    ClientContactsRepository,
    RazonesSocialesService,
    RazonesSocialesRepository,
    ConveniosService,
    ConveniosRepository,
    ImpresoraDeConvenios,
    CorreosDeConvenios,
  ],
  // ClientContactsRepository también sale: el embudo de consultas
  // asegura al consultante como persona de contacto al convertir.
  // RazonesSocialesService sale para la facturación (doc 19, paso 2).
  exports: [
    ClientsService,
    ClientContactsRepository,
    RazonesSocialesService,
    AlcanceDeRecepcion,
  ],
})
export class ClientsModule {}
