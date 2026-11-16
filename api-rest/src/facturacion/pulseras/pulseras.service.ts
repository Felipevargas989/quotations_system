import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { User } from 'src/users/entities/user.entity';
import { textoLimpio } from '../archivo/texto';
// Import de verdad (no `import type`): Nest inyecta por la clase.
import { CajaRepository } from '../caja/caja.repository';
import {
  contarPulseras,
  pulserasDe,
  type CuentaDePulseras,
  type VentaConPulseras,
} from './cuenta';
import type { EntregarPulserasDto } from './pulseras.dto';
import { PulserasRepository } from './pulseras.repository';

/** Lo de un cierre que ve quien revisa (y el correo del cierre). */
export interface PulserasDelCierre {
  deberian: number;
  contadas: number;
  diferencia: number;
}

/**
 * LAS PULSERAS DE RECEPCIÓN (doc 19 §9.49). Felipe, 16-11-2026: *"paso 100
 * u otra cantidad de pulseras a recepción y llevar un control de stock para
 * saber que lo que se ha vendido es lo que se ha cobrado"*.
 *
 * Operaciones o el administrador las entregan; recepción las cuenta a
 * ciegas al cerrar la caja (`CajaService.cerrar`); la cuenta (pura) vive en
 * `cuenta.ts`. Una empresa sin ítems con «Usa pulsera» no nota nada.
 */
@Injectable()
export class PulserasService {
  constructor(
    private readonly repo: PulserasRepository,
    private readonly caja: CajaRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PulserasService.name);
  }

  /** Si el cierre de la caja pide contar las pulseras: la empresa tiene
   *  ítems con «Usa pulsera» y ya entregó alguna (el control parte ahí). */
  async pideAlCerrar(companyId: number): Promise<boolean> {
    const [conPulsera, hay] = await Promise.all([
      this.repo.conPulsera(companyId),
      this.repo.hayEntregas(companyId),
    ]);
    return conPulsera.size > 0 && hay;
  }

  private async cuenta(companyId: number) {
    const [conPulsera, entregas] = await Promise.all([
      this.repo.conPulsera(companyId),
      this.repo.entregas(companyId),
    ]);
    if (!entregas.length || !conPulsera.size)
      return { conPulsera, entregas, cuenta: contarPulseras(entregas, [], []) };
    const desde = entregas[0].created_at;
    const [turnos, solicitudes, directas] = await Promise.all([
      this.repo.turnosDesde(companyId, desde),
      this.repo.solicitudesDesde(companyId, desde),
      this.repo.directasDesde(companyId, desde),
    ]);
    // Sin contar doble: el documento que nació de una solicitud cuenta por
    // ella (además, ese lleva turno y no llega acá); lo traído de
    // facturacion.cl no se vendió en Eventia.
    const deSolicitud = new Set(
      solicitudes
        .map((x) => x.documento_id)
        .filter((id): id is number => id != null),
    );
    const sinTraidas = directas.filter(
      (d) => d.traida !== true && !deSolicitud.has(d.id),
    );
    const anulados = await this.caja.anulados(
      companyId,
      sinTraidas.map((d) => d.id),
    );
    const ventas: VentaConPulseras[] = [
      ...solicitudes.map(
        (s): VentaConPulseras => ({
          origen: 'solicitud',
          turno_de_caja_id: s.turno_de_caja_id,
          created_at: s.created_at,
          pulseras: pulserasDe(s.detalle, conPulsera),
        }),
      ),
      ...sinTraidas
        .filter((d) => !anulados.has(d.id))
        .map(
          (d): VentaConPulseras => ({
            origen: 'directa',
            turno_de_caja_id: null,
            created_at: d.emitido_en ?? d.created_at,
            pulseras: pulserasDe(d.detalle, conPulsera),
          }),
        ),
    ].filter((v) => v.pulseras > 0);
    return {
      conPulsera,
      entregas,
      cuenta: contarPulseras(entregas, turnos, ventas),
    };
  }

  /** La pestaña «Pulseras»: las cuatro cifras, las entregas y los turnos. */
  async resumen(user: User): Promise<
    CuentaDePulseras & {
      usa_pulsera: boolean;
      entregas: {
        id: number;
        cantidad: number;
        creada_en: string;
        por: string;
      }[];
    }
  > {
    const { conPulsera, entregas, cuenta } = await this.cuenta(user.company_id);
    return {
      ...cuenta,
      usa_pulsera: conPulsera.size > 0,
      entregas: [...entregas].reverse().map((e) => ({
        id: e.id,
        cantidad: e.cantidad,
        creada_en: e.created_at,
        por: e.entregada_por_nombre,
      })),
    };
  }

  async entregar(user: User, dto: EntregarPulserasDto) {
    await this.repo.entregar({
      company_id: user.company_id,
      cantidad: dto.cantidad,
      entregada_por: user.id ?? null,
      entregada_por_nombre: (textoLimpio(user.full_name) || 'Sin nombre').slice(
        0,
        60,
      ),
    });
    this.logger.info(
      `${dto.cantidad} pulseras a recepción (empresa ${user.company_id})`,
    );
    return this.resumen(user);
  }

  /** Lo de un cierre: deberían quedar, contadas y la diferencia. Nulo si
   *  ese cierre no contó (nulo no es cero). */
  async delCierre(
    companyId: number,
    turnoId: number,
  ): Promise<PulserasDelCierre | null> {
    const { cuenta } = await this.cuenta(companyId);
    const t = cuenta.turnos.find((x) => x.id === turnoId);
    if (!t || t.deberian == null || t.contadas == null || t.diferencia == null)
      return null;
    return {
      deberian: t.deberian,
      contadas: t.contadas,
      diferencia: t.diferencia,
    };
  }
}
