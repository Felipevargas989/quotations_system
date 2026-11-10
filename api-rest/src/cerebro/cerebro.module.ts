import { Module } from '@nestjs/common';
import { GuiaController } from './guia.controller';
import { GuiaRepository } from './guia.repository';
import { GuiaService } from './guia.service';
import { LeccionesRepository } from './lecciones.repository';
import { LeccionesService } from './lecciones.service';

// Lo que aprendió BelIA (doc 20 §17, mejora 5): las lecciones de cada
// empresa, que `cerebroPara` suma a lo que lee toda la IA de Eventia. Y la
// guía de la casa (doc 20 §18), que escribe administración en Mi empresa.
@Module({
  controllers: [GuiaController],
  providers: [
    LeccionesRepository,
    LeccionesService,
    GuiaRepository,
    GuiaService,
  ],
  exports: [LeccionesService, GuiaService],
})
export class CerebroModule {}
