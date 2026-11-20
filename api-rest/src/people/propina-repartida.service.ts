import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type {
  ReabrirLiquidacionDto,
  SeleccionPayrollDto,
  UpdatePoolDto,
} from './dto/etapas.dto';
import { PeopleRepository } from './people.repository';
import { estaLiquidado } from './people.service';
import {
  type PozoConNombre,
  PropinaRepartidaRepository,
} from './propina-repartida.repository';
import {
  descalceDelPozo,
  NADA_REPARTIDO,
  type Repartido,
  resumirRepartido,
  textoDelRepartido,
  totalTrasCambio,
  YA_EN_NOMINA,
} from './utils/propina-repartida';

/**
 * LA PROPINA NO SE DESHACE A MEDIAS (doc 10 §14, 19-11-2026).
 *
 * Tres reglas, en el motor y no solo en la pantalla:
 * 1. Bajar el pozo a $0 borra primero lo repartido (y el pozo vuelve a
 *    «sin repartir»). Nunca queda reparto guardado con pozo $0.
 * 2. «Sin propina» borra primero lo repartido. Nunca queda reparto
 *    guardado en un pozo «sin propina».
 * 3. Reabrir con propina repartida adentro avisa cuánto hay y entre
 *    cuántas personas, y pide confirmar (409 hasta que llegue
 *    `confirmado`). Reabrir no borra nada (doc 10, 18-08).
 * Lo que ya entró a una nómina no se borra nunca: se rechaza.
 * 4. EL SEGUNDO CANDADO (Felipe: «me preocupa el error de fondo»): la
 *    nómina no deja pagar una propina cuyo reparto no calza con su pozo
 *    (`descalceDelPozo`, la regla única que usan también 1 y 2).
 *
 * Usa la misma pieza que «eliminar un pozo» (`repo.clearTips`), pero
 * mirando antes el sello de la nómina, que `clearTips` no mira.
 */
@Injectable()
export class PropinaRepartidaService {
  constructor(
    private readonly people: PeopleRepository,
    private readonly repo: PropinaRepartidaRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PropinaRepartidaService.name);
  }

  async repartidoDelPozo(poolId: number, companyId: number) {
    return resumirRepartido(await this.repo.filasDelPozo(companyId, poolId));
  }

  /** Borra lo repartido de un pozo. Rechaza si algo ya está en una
   *  nómina o si es de un evento con la ficha cerrada. */
  private async borrarRepartido(
    pozo: { id: number; quotation_id: string | null },
    companyId: number,
  ): Promise<Repartido> {
    const r = await this.repartidoDelPozo(pozo.id, companyId);
    if (r.filas === 0) return r;
    if (r.enNomina) throw new BadRequestException(YA_EN_NOMINA);
    if (pozo.quotation_id) {
      const ficha = await this.people.findSheetByQuotation(
        companyId,
        pozo.quotation_id,
      );
      if (ficha?.status === 'cerrada') {
        throw new BadRequestException(
          'La ficha ya está cerrada: devuélvela a Liquidación antes de cambiar su propina.',
        );
      }
    }
    await this.people.clearTips(pozo.id, companyId);
    this.logger.info(
      `pozo ${pozo.id}: se borró ${textoDelRepartido(r)} (${r.filas} filas)`,
    );
    return r;
  }

  /** PATCH /people/pools/:id. Si con el monto nuevo lo repartido ya no
   *  calza (pozo en $0 o menor que lo repartido), se borra antes y el
   *  pozo vuelve a «sin repartir». */
  async cambiarPozo(id: number, dto: UpdatePoolDto, companyId: number) {
    const pozo = await this.people.findPool(id, companyId);
    const total = totalTrasCambio(pozo, dto);
    const antes = await this.repartidoDelPozo(id, companyId);
    if (total === null || !descalceDelPozo(total, antes.monto)) {
      return this.people.updatePool(id, { ...dto }, companyId);
    }
    // Con el monto nuevo lo repartido ya no calza ($0, o menos de lo que
    // se repartió): se borra y el pozo vuelve a «sin repartir».
    const r = await this.borrarRepartido(pozo, companyId);
    return this.people.updatePool(
      id,
      r.filas > 0 ? { ...dto, distributed_at: null } : { ...dto },
      companyId,
    );
  }

  /**
   * UN DÍA SIN PROPINA TAMBIÉN SE LIQUIDA (Felipe, 15-08): si no se
   * pudiera marcar, los días flojos quedarían eternamente como
   * pendientes. Solo vale con el pozo en cero — si hay plata, se
   * reparte, no se salta. Y desde el 19-11, lo repartido antes se borra.
   */
  async marcarSinPropina(poolId: number, companyId: number) {
    const pozo = await this.people.findPool(poolId, companyId);
    if (Number(pozo.first_amount) + Number(pozo.second_amount) > 0) {
      throw new BadRequestException(
        'Ese día tiene pozo: repártelo, no lo saltes',
      );
    }
    await this.borrarRepartido(pozo, companyId);
    return this.people.updatePool(
      poolId,
      { distributed_at: new Date().toISOString() },
      companyId,
    );
  }

  /** Cuánto hay repartido en el pozo de ese evento o día. */
  async avisoDeReabrir(
    companyId: number,
    origen: { quotation_id?: string; day?: string },
  ) {
    if (!origen.quotation_id && !origen.day) {
      throw new BadRequestException('Falta el evento o el día a reabrir');
    }
    const pozo = await this.people.findPoolDe(companyId, {
      quotation_id: origen.quotation_id ?? null,
      day: origen.day ?? null,
    });
    const r = pozo
      ? await this.repartidoDelPozo(pozo.id, companyId)
      : NADA_REPARTIDO;
    return { monto: r.monto, personas: r.personas, en_nomina: r.enNomina };
  }

  /** Antes de reabrir: con propina repartida adentro, 409 hasta que la
   *  pantalla confirme. Lo que está en nómina lo rechaza la regla de
   *  fierro de reabrirLiquidacion, con su propio mensaje. */
  async exigirConfirmacionAlReabrir(
    companyId: number,
    dto: ReabrirLiquidacionDto,
  ) {
    if (dto.confirmado) return;
    const aviso = await this.avisoDeReabrir(companyId, dto);
    if (aviso.en_nomina || aviso.monto === 0) return;
    throw new ConflictException({
      message: `Tiene ${textoDelRepartido({ ...NADA_REPARTIDO, ...aviso })}. Al reabrir queda escrita; si después bajas el pozo a $0 o marcas «sin propina», se borra. Confirma para seguir.`,
      monto: aviso.monto,
      personas: aviso.personas,
    });
  }

  // ================= EL SEGUNDO CANDADO: LA NÓMINA =================

  /** id del pozo → por qué no calza, según la regla única. */
  private async descalces(companyId: number, pozos: readonly PozoConNombre[]) {
    const filas = await this.repo.filasDePozos(
      companyId,
      pozos.map((p) => p.id),
    );
    const malos = new Map<number, string>();
    for (const p of pozos) {
      const r = resumirRepartido(filas.filter((f) => f.tip_pool_id === p.id));
      const total = Number(p.first_amount ?? 0) + Number(p.second_amount ?? 0);
      const d = descalceDelPozo(total, r.monto);
      if (d) malos.set(p.id, d);
    }
    return malos;
  }

  /** «Liquidaciones por pagar»: cada línea dice si su propina no calza
   *  con su pozo; la pantalla no la deja marcar. */
  async marcarDescalces<
    T extends { quotation_id: string | null; day: string | null },
  >(companyId: number, lineas: readonly T[]) {
    const pozos = await this.repo.pozosDe(
      companyId,
      lineas.map((l) => l.quotation_id).filter((q): q is string => !!q),
      lineas.filter((l) => !l.quotation_id && l.day).map((l) => l.day!),
    );
    const malos = await this.descalces(companyId, pozos);
    const dePozo = (l: T) =>
      pozos.find((p) =>
        l.quotation_id
          ? p.quotation_id === l.quotation_id
          : !p.quotation_id && String(p.day).slice(0, 10) === l.day,
      );
    return lineas.map((l) => {
      const p = dePozo(l);
      return { ...l, descalce: (p && malos.get(p.id)) ?? null };
    });
  }

  /**
   * «Revisar y generar» y generar la nómina: si algo de lo que entraría
   * al pago trae propina descalzada de su pozo, no pasa. Mira lo mismo
   * que reunirLiquidado: las propinas pendientes de la selección que
   * están liquidadas.
   */
  async exigirSinDescalce(companyId: number, dto: SeleccionPayrollDto) {
    const filtro = {
      hasta: dto.hasta,
      desde: dto.desde,
      quotationIds: dto.quotation_ids,
      dias: dto.dias,
    };
    const mezcla = !!dto.dias?.length && !!dto.quotation_ids?.length;
    const filas = (
      await Promise.all(
        mezcla
          ? [
              this.people.propinasPendientes(companyId, { dias: dto.dias }),
              this.people.propinasPendientes(companyId, {
                quotationIds: dto.quotation_ids,
              }),
            ]
          : [this.people.propinasPendientes(companyId, filtro)],
      )
    ).flat();
    const [cerradas, diasListos] = await Promise.all([
      this.people.fichasCerradas(companyId, [
        ...new Set(
          filas.map((f) => f.quotation_id).filter((q): q is string => !!q),
        ),
      ]),
      this.people.diasLiquidados(companyId, [
        ...new Set(
          filas
            .filter((f) => !f.quotation_id && f.day)
            .map((f) => String(f.day).slice(0, 10)),
        ),
      ]),
    ]);
    const liquidadas = filas.filter((f) =>
      estaLiquidado(f, cerradas, diasListos),
    );
    const ids = [
      ...new Set(
        liquidadas
          .map((f) => f.tip_pool_id)
          .filter((id): id is number => id != null),
      ),
    ];
    const pozos = await this.repo.pozosPorId(companyId, ids);
    const malos = await this.descalces(companyId, pozos);
    // Una propina sin pozo tampoco calza con nada.
    const sinPozo = liquidadas.filter((f) => f.tip_pool_id == null);
    if (malos.size === 0 && sinPozo.length === 0) return;
    const lineas = [
      ...pozos
        .filter((p) => malos.has(p.id))
        .map((p) => `${nombreDelPozo(p)}: ${malos.get(p.id)}`),
      ...(sinPozo.length ? ['hay propinas sin pozo'] : []),
    ];
    throw new BadRequestException(
      `No se puede pagar una propina que no calza con su pozo. ${lineas.join('; ')}. Corrígelo en Liquidación antes de generar la nómina.`,
    );
  }
}

/** «Staff · 14/11/2026» o «N° 478», como lo nombra la pantalla. */
function nombreDelPozo(p: PozoConNombre) {
  if (p.quotation_id) {
    return p.quotations ? `N° ${p.quotations.quotation_number}` : 'Un evento';
  }
  const [a, m, d] = String(p.day).slice(0, 10).split('-');
  return `Staff · ${d}/${m}/${a}`;
}
