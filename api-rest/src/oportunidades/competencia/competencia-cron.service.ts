import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { ZONA_DEL_RADAR } from '../oportunidades-cron.service';
import { CompetenciaService } from './competencia.service';

// LAS ACTAS DE LA COMPETENCIA, DE NOCHE (decisión 70 del doc 17). Las actas
// públicas se leen entre dos pasadas del radar (02:07 y 05:07), 25 minutos
// como mucho: son páginas de Mercado Público, no su API, y no gastan cupo.
// Como todos los relojes, solo corre con NODE_ENV=production.
export const HORARIO_DE_LAS_ACTAS = '40 3 * * *';
const PRESUPUESTO_MS = 25 * 60_000;

@Injectable()
export class CompetenciaCronService {
  constructor(
    private readonly competencia: CompetenciaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CompetenciaCronService.name);
  }

  @Cron(HORARIO_DE_LAS_ACTAS, { timeZone: ZONA_DEL_RADAR })
  async actasDeNoche() {
    try {
      await this.competencia.leerDeNoche(Date.now() + PRESUPUESTO_MS);
    } catch (error) {
      this.logger.error(`las actas de noche fallaron: ${mensajeDe(error)}`);
    }
  }
}
