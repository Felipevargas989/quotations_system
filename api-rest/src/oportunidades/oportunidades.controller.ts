import { Controller, Get, Post, Query } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { ListarOportunidadesDto } from './dto/listar-oportunidades.dto';
import { OportunidadesRepository } from './oportunidades.repository';
import { RadarService } from './radar.service';

// Sprint 1 (doc 17): todavía sin pantalla. Estas rutas sirven para probar
// el radar en el laboratorio (ahí los relojes no corren) y para que la
// pantalla del sprint 2 tenga de dónde leer.
//
// Solo administrador, y solo empresas con el derecho `oportunidades`
// (módulo propio de Valle del Sol, migración 122).
@Roles(...ADMIN_ONLY)
@Derecho('oportunidades')
@Controller('oportunidades')
export class OportunidadesController {
  constructor(
    private readonly repo: OportunidadesRepository,
    private readonly radar: RadarService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OportunidadesController.name);
  }

  /** Las oportunidades de la empresa de la sesión, con su proceso. */
  @Get()
  listar(@Query() filtros: ListarOportunidadesDto, @CurrentUser() user: User) {
    return this.repo.listar(user.company_id, filtros);
  }

  /** Corre el radar ahora. Responde al tiro: la corrida sigue sola y queda
   *  en la bitácora (GET radar/corridas). */
  @Post('radar')
  async correrRadar(@CurrentUser() user: User) {
    this.logger.info(`POST /oportunidades/radar (empresa ${user.company_id})`);
    const corrida = await this.radar.iniciar('manual');
    return corrida === null
      ? { iniciada: false, motivo: 'Ya hay una corrida del radar en marcha.' }
      : { iniciada: true, corrida };
  }

  /** Las últimas corridas del radar: cuándo, qué trajo y qué falló. */
  @Get('radar/corridas')
  corridas() {
    return this.repo.ultimasCorridas(10);
  }
}
