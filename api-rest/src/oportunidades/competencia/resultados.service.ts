import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import {
  MercadoPublicoClient,
  MercadoPublicoError,
} from '../mercado-publico/mercado-publico.client';
import { OferenteRepository } from '../oferente/oferente.repository';
import { CompetenciaRepository } from './competencia.repository';
import {
  resultadoParaLaEmpresa,
  resultadoPublicoDeCompraAgil,
} from './resultado-compra-agil';
import { ResultadosRepository } from './resultados.repository';

// EL RESULTADO DE LAS COMPRAS ÁGILES POSTULADAS (decisión 92 del doc 17,
// 27-10). En cada pasada del radar, media hora después, se vuelve a pedir
// el detalle de cada compra ágil que la empresa postuló y ya cerró. Cuando
// el comprador elige, el detalle trae todas las ofertas: si eligió a la
// empresa queda «ganada»; si eligió a otro, «perdida», con quién ganó, por
// cuánto y en qué lugar quedó la empresa por precio, que es como la ley
// manda comparar (decisión 93). Felipe: "la perdí y no me avisó el sistema".
// Las que la empresa marcó a mano no cambian de estado, pero igual se anota
// a quién eligieron, para que «Mis licitaciones» lo diga.

@Injectable()
export class ResultadosDeComprasAgilesService {
  constructor(
    private readonly resultados: ResultadosRepository,
    private readonly competencia: CompetenciaRepository,
    private readonly oferente: OferenteRepository,
    private readonly mp: MercadoPublicoClient,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ResultadosDeComprasAgilesService.name);
  }

  /** Devuelve cuántas quedaron resueltas. */
  async revisar(companyId: number, hasta: number): Promise<number> {
    const pendientes =
      await this.resultados.comprasAgilesPorResolver(companyId);
    if (pendientes.length === 0) return 0;
    const rut = (await this.oferente.oferente(companyId))?.rut ?? null;
    let resueltas = 0;
    for (const p of pendientes) {
      if (Date.now() > hasta) break;
      try {
        const detalle = (await this.mp.detalleCompraAgil(p.codigo)) as Record<
          string,
          unknown
        > | null;
        if (!detalle) continue;
        await this.competencia.guardarCotizantes(p.codigo, {
          proveedores_cotizando: detalle.proveedores_cotizando ?? null,
          id_orden_compra: detalle.id_orden_compra ?? null,
          estado: detalle.estado ?? null,
        });
        const publico = resultadoPublicoDeCompraAgil(detalle);
        if (!publico) continue;
        if (!p.anotada) {
          await this.resultados.registrarResultado(p.codigo, publico);
        }
        const resultado = resultadoParaLaEmpresa(publico, rut);
        const marcada =
          p.estado === 'postulada' &&
          resultado !== null &&
          (await this.resultados.marcarResultado(
            companyId,
            p.id,
            resultado.estado,
          ));
        if (marcada || !p.anotada) {
          resueltas += 1;
          this.logger.info(
            `compra ágil ${p.codigo}: ${marcada && resultado ? resultado.estado : 'anotada'}`,
          );
        }
      } catch (error) {
        this.logger.warn(`compra ágil ${p.codigo}: ${mensajeDe(error)}`);
        if (error instanceof MercadoPublicoError && error.sinCupo) break;
      }
    }
    return resueltas;
  }
}
