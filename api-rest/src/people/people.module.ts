import { Module } from '@nestjs/common';
import { ClientsModule } from 'src/clients/clients.module';
import { PeopleController } from './people.controller';
import { PeopleRepository } from './people.repository';
import { PeopleService } from './people.service';
import { PropinaDeOtrosEventosRepository } from './propina-de-otros-eventos.repository';
import { PropinaDeOtrosEventosService } from './propina-de-otros-eventos.service';
import { TipoDePersonaRepository } from './tipo-de-persona.repository';
import { TipoDePersonaService } from './tipo-de-persona.service';

// ClientsModule: lo que ve cada cargo según el tipo de cliente (doc 22 §9).
@Module({
  imports: [ClientsModule],
  controllers: [PeopleController],
  providers: [
    PeopleService,
    PeopleRepository,
    TipoDePersonaService,
    TipoDePersonaRepository,
    PropinaDeOtrosEventosService,
    PropinaDeOtrosEventosRepository,
  ],
  exports: [PeopleService],
})
export class PeopleModule {}
