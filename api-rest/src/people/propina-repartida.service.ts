import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { ReabrirLiquidacionDto, UpdatePoolDto } from './dto/etapas.dto';
import { PeopleRepository } from './people.repository';
import { PropinaRepartidaRepository } from './propina-repartida.repository';
import {
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

  /** PATCH /people/pools/:id. Si el pozo queda en $0, lo repartido se
   *  borra antes y el pozo vuelve a «sin repartir». */
  async cambiarPozo(id: number, dto: UpdatePoolDto, companyId: number) {
    const pozo = await this.people.findPool(id, companyId);
    const total = totalTrasCambio(pozo, dto);
    if (total === null || total > 0) {
      return this.people.updatePool(id, { ...dto }, companyId);
    }
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
}
