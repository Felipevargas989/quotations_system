import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { OportunidadesRepository } from '../oportunidades.repository';
import { CerradasSinPostularRepository } from './cerradas-sin-postular.repository';
import { DecisionesRepository } from './decisiones.repository';

// LAS «ME INTERESA» QUE CERRARON SIN POSTULAR SE DESCARTAN SOLAS (decisión
// 116 del doc 17, 04-11). Felipe: "las que estén cerradas y yo no haya
// postulado, darlas por descartadas automáticamente". Quedan descartadas
// con el porqué «No alcanzo» (decisión 113), para que el semáforo no
// aprenda que no interesaban. Corre al encender el motor y media hora
// después de cada pasada del radar, cuando ya se sabe si el comprador movió
// el cierre. La pantalla no espera: «Mis licitaciones» ya no las muestra
// apenas pasa su hora de cierre.

@Injectable()
export class CerradasSinPostularService {
  constructor(
    private readonly repo: CerradasSinPostularRepository,
    private readonly oportunidades: OportunidadesRepository,
    private readonly decisiones: DecisionesRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CerradasSinPostularService.name);
  }

  /** Devuelve cuántas descartó. Si el porqué no se pudo anotar, el
   *  descarte igual vale. */
  async descartar(companyId: number): Promise<number> {
    const ids = await this.repo.descartarLasQueCerraron(companyId);
    for (const id of ids) {
      await this.decisiones
        .ponerMotivo(companyId, id, 'no_alcanzo')
        .catch((error) =>
          this.logger.warn(
            `cerrada sin postular ${id}: no pude anotar el porqué: ${mensajeDe(error)}`,
          ),
        );
    }
    if (ids.length > 0) {
      this.logger.info(
        `cerradas sin postular: ${ids.length} descartadas (empresa ${companyId})`,
      );
    }
    return ids.length;
  }

  /** En todas las empresas con el módulo: una que falla no frena a las
   *  demás. */
  async enTodas(): Promise<number> {
    let total = 0;
    for (const { id } of await this.oportunidades.empresasConModulo()) {
      try {
        total += await this.descartar(id);
      } catch (error) {
        this.logger.warn(
          `cerradas sin postular, empresa ${id}: ${mensajeDe(error)}`,
        );
      }
    }
    return total;
  }
}
