import { Injectable, NotFoundException } from '@nestjs/common';
import { ResultadosRepository } from '../competencia/resultados.repository';
import { GeneracionRepository } from '../generacion/generacion.repository';
import type { ActaDeAdjudicacion } from '../historia/acta';
import { OferenteRepository } from '../oferente/oferente.repository';
import { OportunidadesRepository } from '../oportunidades.repository';
import {
  conLineas,
  type LecturaDeUnaOferta,
  type LineaComparada,
} from './comparacion';
import {
  adjudicadosFrenteALaEmpresa,
  diaDeLaAdjudicacion,
  DIAS_PARA_EL_TRIBUNAL,
  DIAS_PARA_RECLAMAR,
  diasHabilesDespues,
  MAX_DEL_RECLAMO,
  type ReclamoArmado,
  reclamosDe,
} from './reclamo';

// LOS RECLAMOS DE UNA PERDIDA (decisión 128 del doc 17, 11-11). Felipe: "el
// reclamo creo que debe ser post resolución, si gano no reclamo, si pierdo
// sí, y debería ser una sección abajo para generar reclamos". La sección
// «Reclamos» de «Comparación de ofertas» pregunta aquí: si la oportunidad
// quedó perdida, a quién se adjudicó, hasta cuándo se puede reclamar y el
// texto contra la oferta adjudicada, con lo que encontró la última
// comparación. Sin IA y sin guardar nada: se arma cada vez que se pide, con
// lo que Mercado Público dice ese día.

export type ReclamosDeLaOportunidad = {
  /** Solo se reclama lo que se perdió: ganada o sin resolver, false. */
  corresponde: boolean;
  /** Terminó sin adjudicar: no hay oferta adjudicada a la que reclamarle. */
  sin_adjudicar: 'desierta' | 'revocada' | null;
  /** Hay una comparación lista, que es de donde sale el reclamo. */
  comparada: boolean;
  /** El día en que se publicó la adjudicación (AAAA-MM-DD). */
  adjudicada_el: string | null;
  /** Hasta cuándo reclamar en Mercado Público (5 días hábiles) y demandar
   *  ante el Tribunal de Contratación Pública (10): la fecha más temprana
   *  posible, sin descontar feriados. */
  reclamo_hasta: string | null;
  tribunal_hasta: string | null;
  /** Lo que acepta el formulario de reclamos. */
  maximo: number;
  reclamos: ReclamoArmado[];
};

const SIN_NADA: ReclamosDeLaOportunidad = {
  corresponde: false,
  sin_adjudicar: null,
  comparada: false,
  adjudicada_el: null,
  reclamo_hasta: null,
  tribunal_hasta: null,
  maximo: MAX_DEL_RECLAMO,
  reclamos: [],
};

@Injectable()
export class ReclamosService {
  constructor(
    private readonly oportunidades: OportunidadesRepository,
    private readonly generacion: GeneracionRepository,
    private readonly oferente: OferenteRepository,
    private readonly resultados: ResultadosRepository,
  ) {}

  async de(
    companyId: number,
    oportunidadId: number,
  ): Promise<ReclamosDeLaOportunidad> {
    const ficha = await this.oportunidades.ficha(companyId, oportunidadId);
    if (!ficha) throw new NotFoundException('No encontramos esa oportunidad.');
    if (ficha.estado !== 'perdida') return SIN_NADA;
    const [comparacion, empresa, publicos] = await Promise.all([
      this.generacion.ultimoDeTipo(
        companyId,
        oportunidadId,
        'comparacion',
        'listo',
      ),
      this.oferente.oferente(companyId),
      this.resultados.resultadosDe([ficha.codigo]),
    ]);
    const publico = publicos.get(ficha.codigo) ?? null;
    const resultado = conLineas(comparacion?.resultado ?? null) as {
      lineas?: LineaComparada[];
      lectura?: LecturaDeUnaOferta[];
    } | null;
    const desde = diaDeLaAdjudicacion(ficha.proceso);
    const sinAdjudicar =
      publico?.sin_adjudicar && !publico.elegidos?.length
        ? publico.sin_adjudicar
        : null;
    return {
      corresponde: true,
      sin_adjudicar: sinAdjudicar,
      comparada: Boolean(resultado),
      adjudicada_el: desde,
      reclamo_hasta: desde
        ? diasHabilesDespues(desde, DIAS_PARA_RECLAMAR)
        : null,
      tribunal_hasta: desde
        ? diasHabilesDespues(desde, DIAS_PARA_EL_TRIBUNAL, true)
        : null,
      maximo: MAX_DEL_RECLAMO,
      reclamos: sinAdjudicar
        ? []
        : reclamosDe(
            resultado?.lineas ?? [],
            resultado?.lectura,
            {
              codigo: ficha.codigo,
              nombre: ficha.proceso.nombre ?? '',
              organismo: ficha.proceso.organismo ?? null,
              empresa,
              esCompraAgil: ficha.proceso.tipo === 'compra_agil',
            },
            adjudicadosFrenteALaEmpresa(
              ficha.proceso.acta as unknown as ActaDeAdjudicacion | null,
              publico,
              empresa?.rut,
            ),
          ),
    };
  }
}
