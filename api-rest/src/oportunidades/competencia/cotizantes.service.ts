import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import {
  MercadoPublicoClient,
  MercadoPublicoError,
} from '../mercado-publico/mercado-publico.client';
import { CompetenciaRepository } from './competencia.repository';
import { camposDeLosCotizantes, cotizantesDeCompraAgil } from './cotizantes';

// LAS COMPRAS ÁGILES CERRADAS DE LA EMPRESA (decisión 71 del doc 17, 23-10):
// una vez al día, hasta 45 días después del cierre, se vuelve a pedir su
// detalle a Mercado Público (con el ticket del radar) y se guarda quién
// cotizó (`mp_procesos.cotizantes`, aparte de `detalle`, que el radar
// reescribe). Es la medición acordada con Felipe: si la lista se llena al
// cerrar, esos son competidores reales y entran a mp_ofertas como una
// licitación más. Solo las de la empresa: pocas consultas al día.

@Injectable()
export class CotizantesService {
  private camposAnotados = false;

  constructor(
    private readonly repo: CompetenciaRepository,
    private readonly mp: MercadoPublicoClient,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CotizantesService.name);
  }

  /** Revisa las compras ágiles cerradas de la empresa hasta la hora dada.
   *  Devuelve en cuántas apareció quién cotizó. */
  async revisar(companyId: number, hasta: number): Promise<number> {
    let conCotizantes = 0;
    for (const p of await this.repo.comprasAgilesPorRevisar(companyId)) {
      if (Date.now() > hasta) break;
      try {
        const detalle = (await this.mp.detalleCompraAgil(p.codigo)) as Record<
          string,
          unknown
        > | null;
        if (!detalle) continue;
        const campos = camposDeLosCotizantes(detalle);
        if (campos.length > 0 && !this.camposAnotados) {
          this.camposAnotados = true;
          this.logger.info(
            `compra ágil ${p.codigo}: quien cotiza trae los campos ${campos.join(', ')}`,
          );
        }
        await this.repo.guardarCotizantes(p.codigo, {
          proveedores_cotizando: detalle.proveedores_cotizando ?? null,
          id_orden_compra: detalle.id_orden_compra ?? null,
          estado: detalle.estado ?? null,
        });
        const ofertas = cotizantesDeCompraAgil(detalle, p);
        if (ofertas.length > 0) {
          await this.repo.guardarOfertas(p.codigo, ofertas);
          conCotizantes += 1;
        }
      } catch (error) {
        this.logger.warn(`compra ágil ${p.codigo}: ${mensajeDe(error)}`);
        if (error instanceof MercadoPublicoError && error.sinCupo) break;
      }
    }
    return conCotizantes;
  }
}
