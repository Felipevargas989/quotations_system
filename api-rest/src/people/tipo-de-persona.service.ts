import { BadRequestException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { User } from 'src/users/entities/user.entity';
import type { CambioDeTipoDto } from './dto/cambio-de-tipo.dto';
import { PeopleRepository } from './people.repository';
import { PeopleService } from './people.service';
import { TipoDePersonaRepository } from './tipo-de-persona.repository';
import { planDelCambioDeTipo } from './utils/cambio-de-tipo';
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
    const { plan, resultado, hoy, historialNuevo } = await this.armar(
      companyId,
      personId,
      dto,
    );

    // Primero los días y después el historial: si algo se corta a medio
    // camino, volver a registrar el mismo cambio termina el trabajo (los
    // días ya cambiados no se vuelven a tocar).
    for (const grupo of plan.cambios) {
      await this.repo.cambiarDias(companyId, grupo.ids, grupo.datos);
    }
    await this.people.removeStaffEnLote(plan.quitar, companyId);

    const cambio = await this.repo.registrar({
      company_id: companyId,
      person_id: personId,
      kind: dto.kind,
      anterior: resultado.anterior,
      desde: dto.desde,
      registrado_por: user.id ?? null,
      registrado_por_nombre:
        (user.full_name || user.email || '').trim().slice(0, 120) || null,
    });

    // La ficha guarda el tipo de HOY: con una fecha pasada (o hoy) cambia
    // ya; con una futura, sigue como estaba hasta que llegue.
    const deHoy = tipoALaFecha({ historial_tipo: historialNuevo }, hoy);
    await this.repo.guardarTipo(companyId, personId, deHoy);

    // La planta de hoy en adelante: la proyección de siempre, que ahora
    // lee el tipo de cada día.
    await this.peopleService.proyectarPlanta(companyId, personId);

    this.logger.info(
      `tipo persona ${personId}: ${resultado.anterior} → ${dto.kind} desde ${dto.desde} (` +
        `+planta ${plan.aPlanta}, +freelance ${plan.aFreelance}, -${plan.quitar.length}, sin tocar ${plan.sinTocar})`,
    );
    return { ...resultado, cambio };
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
    const fecha = new Date(`${dto.desde}T00:00:00Z`);
    if (
      Number.isNaN(fecha.getTime()) ||
      fecha.toISOString().slice(0, 10) !== dto.desde
    ) {
      throw new BadRequestException('Esa fecha no existe');
    }
    const hoy = hoyEnChile();
    const persona = await this.people.findOne(personId, companyId);
    const anterior = tipoALaFecha(persona, dto.desde);
    if (anterior === dto.kind) {
      throw new BadRequestException(
        `Ya es ${ETIQUETA[dto.kind]} el ${aChile(dto.desde)}`,
      );
    }

    const historialNuevo: CambioDeTipo[] = [
      ...(persona.historial_tipo ?? []),
      {
        kind: dto.kind,
        anterior,
        desde: dto.desde,
        // Registrado ahora: con el mismo «desde», manda sobre los de antes.
        registrado_en: new Date().toISOString(),
        id: Number.MAX_SAFE_INTEGER,
      },
    ];
    const filas = await this.repo.diasDeStaffDesde(
      companyId,
      personId,
      dto.desde,
    );
    const liquidados = await this.people.diasLiquidados(companyId, [
      ...new Set(filas.map((f) => String(f.day).slice(0, 10))),
    ]);
    const plan = planDelCambioDeTipo({
      filas,
      persona: { historial_tipo: historialNuevo },
      desde: dto.desde,
      hoy,
      liquidados,
    });
    const resultado: ResultadoDelCambio = {
      kind: dto.kind,
      anterior,
      desde: dto.desde,
      futuro: dto.desde > hoy,
      aPlanta: plan.aPlanta,
      aFreelance: plan.aFreelance,
      quitan: plan.quitar.length,
      sinTocar: plan.sinTocar,
    };
    return { plan, resultado, hoy, historialNuevo };
  }
}
