import { Injectable, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { ZONA_DEL_RADAR } from '../oportunidades-cron.service';
import { OportunidadesRepository } from '../oportunidades.repository';
import { ActasDeLaZonaService } from './actas.service';
import { CotizantesService } from './cotizantes.service';
import { ResultadosDeComprasAgilesService } from './resultados.service';
import { RubroService } from './rubro.service';

// LA COMPETENCIA, DE NOCHE (decisiones 70 y 71 del doc 17). Dos vueltas entre
// las pasadas del radar (23:07, 02:07 y 05:07, de unos 15 minutos): de 23:30
// a 01:55 y de 02:30 a 04:55. En cada una, por empresa con el módulo: las
// compras ágiles cerradas (pocas consultas), la IA del rubro y las actas de
// la zona. La primera noche alcanza para las ~6.000 actas de 3 años; las
// siguientes, solo lo nuevo. Como todos los relojes, solo con
// NODE_ENV=production.
export const PRIMERA_VUELTA = '30 23 * * *';
export const SEGUNDA_VUELTA = '30 2 * * *';
export const DURACION_DE_UNA_VUELTA_MS = 145 * 60_000;
// El resultado de las compras ágiles postuladas (decisión 92): media hora
// después de cada pasada del radar, unos minutos.
export const RESULTADOS = '37 2,5,9,12,15,18,23 * * *';
export const DURACION_DE_LOS_RESULTADOS_MS = 10 * 60_000;

@Injectable()
export class CompetenciaCronService {
  constructor(
    private readonly oportunidades: OportunidadesRepository,
    private readonly actas: ActasDeLaZonaService,
    private readonly rubro: RubroService,
    private readonly cotizantes: CotizantesService,
    private readonly logger: PinoLogger,
    /** El resultado de las compras ágiles postuladas (decisión 92).
     *  Opcional: las pruebas de antes no lo traen. */
    @Optional() private readonly resultados?: ResultadosDeComprasAgilesService,
  ) {
    this.logger.setContext(CompetenciaCronService.name);
  }

  @Cron(PRIMERA_VUELTA, { timeZone: ZONA_DEL_RADAR })
  primeraVuelta() {
    return this.deNoche(Date.now() + DURACION_DE_UNA_VUELTA_MS);
  }

  @Cron(SEGUNDA_VUELTA, { timeZone: ZONA_DEL_RADAR })
  segundaVuelta() {
    return this.deNoche(Date.now() + DURACION_DE_UNA_VUELTA_MS);
  }

  @Cron(RESULTADOS, { timeZone: ZONA_DEL_RADAR })
  async resultadosDeLasPostuladas(): Promise<void> {
    const resultados = this.resultados;
    if (!resultados) return;
    const hasta = Date.now() + DURACION_DE_LOS_RESULTADOS_MS;
    try {
      for (const { id } of await this.oportunidades.empresasConModulo()) {
        if (Date.now() > hasta) return;
        await this.paso('resultados', () => resultados.revisar(id, hasta));
      }
    } catch (error) {
      this.logger.error(
        `el resultado de las compras ágiles falló: ${mensajeDe(error)}`,
      );
    }
  }

  async deNoche(hasta: number): Promise<void> {
    try {
      for (const { id } of await this.oportunidades.empresasConModulo()) {
        if (Date.now() > hasta) return;
        await this.paso('compras ágiles', () =>
          this.cotizantes.revisar(id, hasta),
        );
        await this.paso('rubro', () => this.rubro.clasificar(id, hasta));
        await this.paso('actas', () => this.actas.leer(id, hasta));
      }
    } catch (error) {
      this.logger.error(`la competencia de noche falló: ${mensajeDe(error)}`);
    }
  }

  /** Un paso que falla no frena los demás. */
  private async paso(que: string, hacer: () => Promise<number>) {
    try {
      await hacer();
    } catch (error) {
      this.logger.warn(`competencia de noche, ${que}: ${mensajeDe(error)}`);
    }
  }
}
