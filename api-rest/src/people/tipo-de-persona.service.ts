import { BadRequestException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { User } from 'src/users/entities/user.entity';
import type {
  CambioDeTipoDto,
  OrigenDelTipoDto,
} from './dto/cambio-de-tipo.dto';
import { PeopleRepository } from './people.repository';
import { PeopleService } from './people.service';
import { TipoDePersonaRepository } from './tipo-de-persona.repository';
import {
  planDelCambioDeTipo,
  type PlanDelCambio,
} from './utils/cambio-de-tipo';
import {
  hoyEnChile,
  tipoALaFecha,
  type CambioDeTipo,
  type Tipo,
} from './utils/tipo-vigente';

const ETIQUETA: Record<Tipo, string> = {
  planta: 'de planta',
  freelance: 'freelance',
};
const aChile = (dia: string) => dia.split('-').reverse().join('-');
const OTRO: Record<Tipo, Tipo> = { planta: 'freelance', freelance: 'planta' };

/** Lo que la ventana muestra antes de confirmar, y lo que quedó al final. */
export interface ResultadoDelCambio {
  kind: Tipo;
  anterior: Tipo;
  desde: string;
  /** La fecha todavía no llega: sigue como estaba hasta ese día. */
  futuro: boolean;
  aPlanta: number;
  aFreelance: number;
  quitan: number;
  sinTocar: number;
}

/** Anotar desde cuándo (doc 10 §12.1): lo mismo, más cuántos días de staff
 *  tiene ANTES de esa fecha, que quedan como están. */
export interface ResultadoDelOrigen extends ResultadoDelCambio {
  antes: number;
}

/**
 * LA VENTANA «DESDE» AL CAMBIAR DE TIPO (doc 10 §12, 17-11-2026).
 *
 * Felipe: *"la ventana desde desarrollemos en el laboratorio"*. Cambiar a
 * una persona entre planta y freelance ya no rige desde el día en que se
 * guarda: se elige desde qué día. El historial guarda cada cambio; el tipo
 * de un día se deriva de él (utils/tipo-vigente), y la proyección de
 * siempre carga o quita la planta de hoy en adelante.
 */
@Injectable()
export class TipoDePersonaService {
  constructor(
    private readonly repo: TipoDePersonaRepository,
    private readonly people: PeopleRepository,
    private readonly peopleService: PeopleService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TipoDePersonaService.name);
  }

  /** Lo que pasaría, sin tocar nada: la ventana lo muestra al elegir la
   *  fecha (cuántos días cambian y cuántos quedan sin tocar). */
  async previa(
    companyId: number,
    personId: number,
    dto: CambioDeTipoDto,
  ): Promise<ResultadoDelCambio> {
    return (await this.armar(companyId, personId, dto)).resultado;
  }

  async cambiar(
    companyId: number,
    personId: number,
    dto: CambioDeTipoDto,
    user: Pick<User, 'id' | 'full_name' | 'email'>,
  ): Promise<ResultadoDelCambio & { cambio: CambioDeTipo }> {
    const armado = await this.armar(companyId, personId, dto);
    const cambio = await this.aplicar(companyId, personId, armado, user);

    // La ficha guarda el tipo de HOY: con una fecha pasada (o hoy) cambia
    // ya; con una futura, sigue como estaba hasta que llegue.
    const deHoy = tipoALaFecha(
      { historial_tipo: armado.historialNuevo },
      armado.hoy,
    );
    await this.repo.guardarTipo(companyId, personId, deHoy);

    // La planta de hoy en adelante: la proyección de siempre, que ahora
    // lee el tipo de cada día.
    await this.peopleService.proyectarPlanta(companyId, personId);
    return { ...armado.resultado, cambio };
  }

  // ---- Anotar desde cuándo (doc 10 §12.1, 19-11-2026) ----
  // Felipe: "la gente de planta toda está (a excepción de Sofía) desde que
  // empezamos con el sistema". Quien no tiene historial tiene su tipo
  // «desde el inicio»; acá se anota hacia atrás desde qué día lo tiene:
  // kind = su tipo de hoy, anterior = el otro. No es un cambio de tipo,
  // por eso va por su puerta y no afloja el «Ya es de planta» del cambio
  // normal.

  async previaDelOrigen(
    companyId: number,
    personId: number,
    dto: OrigenDelTipoDto,
  ): Promise<ResultadoDelOrigen> {
    return (await this.armarOrigen(companyId, personId, dto)).resultado;
  }

  async anotarOrigen(
    companyId: number,
    personId: number,
    dto: OrigenDelTipoDto,
    user: Pick<User, 'id' | 'full_name' | 'email'>,
  ): Promise<ResultadoDelOrigen & { cambio: CambioDeTipo }> {
    const armado = await this.armarOrigen(companyId, personId, dto);
    const cambio = await this.aplicar(companyId, personId, armado, user);
    // `default_kind` no cambia (ya es su tipo de hoy) y la proyección
    // tampoco: de hoy en adelante su tipo es el mismo de antes.
    return { ...armado.resultado, cambio };
  }

  /** Los días y el historial, igual para los dos caminos. Primero los días
   *  y después el historial: si algo se corta a medio camino, volver a
   *  registrar lo mismo termina el trabajo (los días ya cambiados no se
   *  vuelven a tocar). */
  private async aplicar(
    companyId: number,
    personId: number,
    armado: { plan: PlanDelCambio; resultado: ResultadoDelCambio },
    user: Pick<User, 'id' | 'full_name' | 'email'>,
  ): Promise<CambioDeTipo> {
    const { plan, resultado } = armado;
    for (const grupo of plan.cambios) {
      await this.repo.cambiarDias(companyId, grupo.ids, grupo.datos);
    }
    await this.people.removeStaffEnLote(plan.quitar, companyId);

    const cambio = await this.repo.registrar({
      company_id: companyId,
      person_id: personId,
      kind: resultado.kind,
      anterior: resultado.anterior,
      desde: resultado.desde,
      registrado_por: user.id ?? null,
      registrado_por_nombre:
        (user.full_name || user.email || '').trim().slice(0, 120) || null,
    });
    this.logger.info(
      `tipo persona ${personId}: ${resultado.anterior} → ${resultado.kind} desde ${resultado.desde} (` +
        `+planta ${plan.aPlanta}, +freelance ${plan.aFreelance}, -${plan.quitar.length}, sin tocar ${plan.sinTocar})`,
    );
    return cambio;
  }

  /** El PATCH de la ficha que trae otro tipo (una pantalla vieja o una
   *  llamada directa) también queda en el historial: desde hoy. */
  async cambiarSiEsOtro(
    companyId: number,
    personId: number,
    kind: Tipo,
    user: Pick<User, 'id' | 'full_name' | 'email'>,
  ) {
    const persona = await this.people.findOne(personId, companyId);
    if (persona.default_kind === kind) return null;
    return this.cambiar(
      companyId,
      personId,
      { kind, desde: hoyEnChile() },
      user,
    );
  }

  /** Pone al día el `default_kind` guardado de quien tuvo un cambio a
   *  futuro que ya llegó. No hace falta para el motor —todo lee el tipo
   *  derivado— pero deja la base diciendo la verdad. Corre al abrir la
   *  sábana, junto con la proyección. */
  async ponerAlDia(companyId: number) {
    const [guardados, historial] = await Promise.all([
      this.repo.tiposGuardados(companyId),
      this.people.historialDeTipo(companyId),
    ]);
    if (historial.length === 0) return 0;
    const hoy = hoyEnChile();
    let puestos = 0;
    for (const p of guardados) {
      const suyo = historial.filter((c) => c.person_id === p.id);
      if (suyo.length === 0) continue;
      const deHoy = tipoALaFecha({ historial_tipo: suyo }, hoy);
      if (deHoy !== p.default_kind) {
        await this.repo.guardarTipo(companyId, p.id, deHoy);
        puestos += 1;
      }
    }
    return puestos;
  }

  private async armar(
    companyId: number,
    personId: number,
    dto: CambioDeTipoDto,
  ) {
    revisarFecha(dto.desde);
    const persona = await this.people.findOne(personId, companyId);
    const anterior = tipoALaFecha(persona, dto.desde);
    if (anterior === dto.kind) {
      throw new BadRequestException(
        `Ya es ${ETIQUETA[dto.kind]} el ${aChile(dto.desde)}`,
      );
    }
    return this.planear(companyId, personId, persona, {
      kind: dto.kind,
      anterior,
      desde: dto.desde,
    });
  }

  private async armarOrigen(
    companyId: number,
    personId: number,
    dto: OrigenDelTipoDto,
  ) {
    revisarFecha(dto.desde);
    const hoy = hoyEnChile();
    if (dto.desde > hoy) {
      throw new BadRequestException(
        'Desde cuándo va con una fecha pasada o de hoy',
      );
    }
    const persona = await this.people.findOne(personId, companyId);
    if ((persona.historial_tipo ?? []).length > 0) {
      throw new BadRequestException(
        'Ya tiene historial de tipo: para corregirlo, cambia el tipo con su fecha',
      );
    }
    // Sin historial, su tipo de hoy es el de siempre (`default_kind`).
    const kind = tipoALaFecha(persona, hoy);
    const armado = await this.planear(companyId, personId, persona, {
      kind,
      anterior: OTRO[kind],
      desde: dto.desde,
    });
    const antes = await this.repo.cuantosDiasDeStaffAntes(
      companyId,
      personId,
      dto.desde,
    );
    const resultado: ResultadoDelOrigen = { ...armado.resultado, antes };
    return { ...armado, resultado };
  }

  /** La cuenta de siempre (`planDelCambioDeTipo`) con el historial ya con
   *  el cambio nuevo: sus días de staff desde esa fecha. */
  private async planear(
    companyId: number,
    personId: number,
    persona: Awaited<ReturnType<PeopleRepository['findOne']>>,
    cambio: { kind: Tipo; anterior: Tipo; desde: string },
  ) {
    const hoy = hoyEnChile();
    const historialNuevo: CambioDeTipo[] = [
      ...(persona.historial_tipo ?? []),
      {
        ...cambio,
        // Registrado ahora: con el mismo «desde», manda sobre los de antes.
        registrado_en: new Date().toISOString(),
        id: Number.MAX_SAFE_INTEGER,
      },
    ];
    const filas = await this.repo.diasDeStaffDesde(
      companyId,
      personId,
      cambio.desde,
    );
    const liquidados = await this.people.diasLiquidados(companyId, [
      ...new Set(filas.map((f) => String(f.day).slice(0, 10))),
    ]);
    const plan = planDelCambioDeTipo({
      filas,
      persona: { historial_tipo: historialNuevo, days_off: persona.days_off },
      desde: cambio.desde,
      hoy,
      liquidados,
    });
    const resultado: ResultadoDelCambio = {
      ...cambio,
      futuro: cambio.desde > hoy,
      aPlanta: plan.aPlanta,
      aFreelance: plan.aFreelance,
      quitan: plan.quitar.length,
      sinTocar: plan.sinTocar,
    };
    return { plan, resultado, hoy, historialNuevo };
  }
}

/** Una fecha AAAA-MM-DD que exista de verdad (no el 31-02). */
const revisarFecha = (desde: string) => {
  const fecha = new Date(`${desde}T00:00:00Z`);
  if (
    Number.isNaN(fecha.getTime()) ||
    fecha.toISOString().slice(0, 10) !== desde
  ) {
    throw new BadRequestException('Esa fecha no existe');
  }
};
