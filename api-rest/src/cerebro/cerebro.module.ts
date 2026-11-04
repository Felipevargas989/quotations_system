import { Module } from '@nestjs/common';
import { LeccionesRepository } from './lecciones.repository';
import { LeccionesService } from './lecciones.service';

// Lo que aprendió BelIA (doc 20 §17, mejora 5): las lecciones de cada
// empresa, que `cerebroPara` suma a lo que lee toda la IA de Eventia.
@Module({
  providers: [LeccionesRepository, LeccionesService],
  exports: [LeccionesService],
})
export class CerebroModule {}
