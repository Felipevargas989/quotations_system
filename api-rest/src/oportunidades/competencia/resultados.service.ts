import { Injectable, Optional } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import {
  MercadoPublicoClient,
  MercadoPublicoError,
} from '../mercado-publico/mercado-publico.client';
import { OferenteRepository } from '../oferente/oferente.repository';
import { AceptarLaGanadaService } from '../postulacion/aceptar-la-ganada.service';
import { CompetenciaRepository } from './competencia.repository';
import {
  type ResultadoPublico,
  resultadoParaLaEmpresa,
  resultadoPublicoDeCompraAgil,
  resultadoPublicoDeLicitacion,
} from './resultado-compra-agil';
import {
  type PorResolver,
  ResultadosRepository,
} from './resultados.repository';

// EL RESULTADO DE LO POSTULADO (decisión 92 del doc 17, 27-10). Felipe:
// "la perdí y no me avisó el sistema", y "la licitación igual debe marcarse
// sola". En cada pasada del radar, media hora después:
// - una licitación postulada ya trae su adjudicación (el radar la revisa
//   una vez al día, como las seguidas): si adjudicaron a la empresa queda
//   «ganada»; si no, «perdida», con a quién y por cuánto;
// - de una compra ágil se vuelve a pedir el detalle: cuando el comprador
//   elige, trae todas las ofertas, y además del resultado queda en qué
//   lugar quedó la empresa por precio, que es como la ley manda comparar
//   (decisión 93).
// Lo que la empresa marcó a mano no cambia de estado, pero igual se anota a
// quién eligieron, para que «Mis licitaciones» lo diga.

@Injectable()
export class ResultadosDePostuladasService {
  constructor(
    private readonly resultados: ResultadosRepository,
    private readonly competencia: CompetenciaRepository,
    private readonly oferente: OferenteRepository,
    private readonly mp: MercadoPublicoClient,
    private readonly logger: PinoLogger,
    /** Decisión 104: al salir ganada, su cotización vinculada queda
     *  aceptada. Opcional: las pruebas de antes no la traen. */
    @Optional() private readonly ganada?: AceptarLaGanadaService,
  ) {
    this.logger.setContext(ResultadosDePostuladasService.name);
  }

  /** Devuelve cuántas quedaron resueltas. */
  async revisar(companyId: number, hasta: number): Promise<number> {
    const pendientes = await this.resultados.porResolver(companyId);
    if (pendientes.length === 0) return 0;
    const rut = (await this.oferente.oferente(companyId))?.rut ?? null;
    let resueltas = 0;
    // Las licitaciones primero: ya están en la base, no gastan cupo.
    for (const p of pendientes.filter((x) => x.tipo === 'licitacion')) {
      const publico = resultadoPublicoDeLicitacion(p.proceso);
      if (publico && (await this.anotar(companyId, p, publico, rut))) {
        resueltas += 1;
      }
    }
    for (const p of pendientes.filter((x) => x.tipo === 'compra_agil')) {
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
        if (publico && (await this.anotar(companyId, p, publico, rut))) {
          resueltas += 1;
        }
      } catch (error) {
        this.logger.warn(`compra ágil ${p.codigo}: ${mensajeDe(error)}`);
        if (error instanceof MercadoPublicoError && error.sinCupo) break;
      }
    }
    return resueltas;
  }

  /** Anota lo público una sola vez por código y, si seguía en
   *  «postulada», la deja ganada o perdida. true si algo cambió. */
  private async anotar(
    companyId: number,
    p: PorResolver,
    publico: ResultadoPublico,
    rut: string | null,
  ): Promise<boolean> {
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
    if (!marcada && p.anotada) return false;
    // Decisión 104 (28-10): Felipe, "si esta ganada la licitación la
    // cotización debe quedar como aceptada con un plan de pagos a 30 dias
    // post realización del evento".
    if (marcada && resultado?.estado === 'ganada' && p.quotation_id) {
      await this.ganada?.aceptar(companyId, p.quotation_id, p.codigo);
    }
    this.logger.info(
      `${p.tipo === 'licitacion' ? 'licitación' : 'compra ágil'} ${p.codigo}: ${marcada && resultado ? resultado.estado : 'anotada'}`,
    );
    return true;
  }
}
