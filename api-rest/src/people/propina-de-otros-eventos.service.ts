import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { EventStaffConPersona } from './entities/person.entity';
import { PeopleRepository } from './people.repository';
import { PeopleService } from './people.service';
import { PropinaDeOtrosEventosRepository } from './propina-de-otros-eventos.repository';
import {
  conOrigenDelEvento,
  esJornadaRealDeEvento,
  esTraidaSoloPropina,
  huerfanas,
  indiceDeOrigenes,
  traidasDeOtrosEventos,
  traidasSinOrigenTrasSacar,
  type FilaDelDia,
} from './utils/propina-de-otros-eventos';

/**
 * LA PROPINA DE LOS OTROS EVENTOS DEL DÍA (Felipe, 19-11-2026; doc 10,
 * «La gente de los otros eventos del día»). Las decisiones están en
 * `utils/propina-de-otros-eventos.ts`; aquí, el orden de las lecturas y
 * escrituras. Vive aparte porque `people.service.ts` está congelado por
 * el portero.
 */
@Injectable()
export class PropinaDeOtrosEventosService {
  constructor(
    private readonly people: PeopleService,
    private readonly peopleRepo: PeopleRepository,
    private readonly repo: PropinaDeOtrosEventosRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PropinaDeOtrosEventosService.name);
  }

  /**
   * ABRIR LA FICHA: primero la planta y los citados como staff, como
   * siempre (`traerPlantaAlEvento`, que revisa que el evento sea de la
   * empresa); después la gente anotada en los otros eventos esos días, y
   * se limpian las traídas que quedaron sin origen. Idempotente.
   */
  async traerAlEvento(quotationId: string, companyId: number) {
    // LO CERRADO NO SE TOCA: la pantalla no llama con la ficha cerrada, y
    // el motor tampoco escribe ni borra si alguien llama igual.
    const cerradas = await this.peopleRepo.fichasCerradas(companyId, [
      quotationId,
    ]);
    if (cerradas.has(quotationId)) return { traidos: 0, de_otros_eventos: 0 };
    const { traidos } = await this.people.traerPlantaAlEvento(
      quotationId,
      companyId,
    );
    const dias = await this.peopleRepo.diasDeEvento(companyId, quotationId);
    if (dias.length === 0) return { traidos };
    const [delDia, delEvento] = await Promise.all([
      this.repo.filasDeLosDias(companyId, dias),
      this.peopleRepo.findStaff(companyId, quotationId),
    ]);
    const filasDelEvento = delEvento as unknown as FilaDelDia[];
    const indice = indiceDeOrigenes(delDia);
    const sobran = huerfanas({ quotationId, dias, indice, filasDelEvento });
    const nuevas = traidasDeOtrosEventos({
      companyId,
      quotationId,
      dias,
      indice,
      yaEnEvento: filasDelEvento,
    });
    await this.peopleRepo.removeStaffEnLote(sobran, companyId);
    const deOtros = await this.peopleRepo.addStaffEnLote(nuevas);
    this.logger.info(
      `traerAlEvento ${quotationId}: +${deOtros} de otros eventos, -${sobran.length} sin origen`,
    );
    return { traidos: traidos + deOtros, de_otros_eventos: deOtros };
  }

  /**
   * EL STAFF DE UN EVENTO, con `origen_evento` en cada traída: el número
   * del otro evento donde se paga su jornada («evento 522» en la caja del
   * monto). Sin columna nueva: se deriva al leer. Del otro evento solo
   * sale el número.
   */
  async conOrigen(
    companyId: number,
    quotationId: string,
    filas: EventStaffConPersona[],
  ) {
    const traidas = filas.filter((f) => esTraidaSoloPropina(f));
    if (traidas.length === 0) {
      return filas.map((f) => ({ ...f, origen_evento: null }));
    }
    const dias = [...new Set(traidas.map((f) => String(f.day).slice(0, 10)))];
    const personas = [...new Set(traidas.map((f) => f.person_id))];
    const delDia = await this.repo.filasDeLosDias(companyId, dias, personas);
    return conOrigenDelEvento(quotationId, filas, indiceDeOrigenes(delDia));
  }

  /**
   * SACAR A ALGUIEN (`removeStaff` de siempre) y, si era su jornada de
   * evento o de staff, llevarse sus traídas de ese día en los otros
   * eventos que quedaron sin origen y que nadie tocó.
   */
  async sacar(id: number, companyId: number, liberar: boolean) {
    const fila = await this.peopleRepo.findStaffRow(id, companyId);
    const r = await this.people.removeStaff(id, companyId, liberar);
    const eraOrigen =
      fila != null &&
      fila.person_id != null &&
      (fila.quotation_id == null
        ? !fila.solo_propina
        : esJornadaRealDeEvento(fila));
    if (!eraOrigen) return r;
    const day = String(fila.day).slice(0, 10);
    const filasDeLaPersona = await this.repo.filasDeLosDias(
      companyId,
      [day],
      [fila.person_id],
    );
    const eventos = [
      ...new Set(
        filasDeLaPersona
          .filter(esTraidaSoloPropina)
          .map((f) => f.quotation_id as string),
      ),
    ];
    if (eventos.length === 0) return r;
    const cerradas = await this.peopleRepo.fichasCerradas(companyId, eventos);
    const ids = traidasSinOrigenTrasSacar({ filasDeLaPersona, cerradas });
    await this.peopleRepo.removeStaffEnLote(ids, companyId);
    if (ids.length > 0) {
      this.logger.info(
        `sacar ${id}: fuera también ${ids.length} traídas de otros eventos`,
      );
    }
    return r;
  }
}
