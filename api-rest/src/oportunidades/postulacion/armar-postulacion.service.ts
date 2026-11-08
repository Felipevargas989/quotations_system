import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import type { User } from 'src/users/entities/user.entity';
import { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import { AnalisisRepository } from '../analisis/analisis.repository';
import { MODELO_HAIKU } from '../analisis/comun';
import {
  type FilaDeGeneracion,
  GeneracionRepository,
} from '../generacion/generacion.repository';
import { GeneracionService } from '../generacion/generacion.service';
import { OferenteRepository } from '../oferente/oferente.repository';
import { ArmarLaOfertaService } from './armar-la-oferta.service';
import { noSiEstaCongelada } from './congelada';
import { CotizacionDeLaPostulacionService } from './cotizacion-de-la-postulacion.service';
import { repartirElPrecio } from './el-reparto';
import { type FormularioDeLasBases, normalizar } from './el-set';
import {
  type DiaDeLaCotizacion,
  diasDeLaCotizacion,
  pidenLaCotizacion,
} from './la-cotizacion-detallada';
import { LaCotizacionDetalladaService } from './la-cotizacion-detallada.service';
import {
  type ExperienciaConfirmada,
  loQueDicenLasBases,
  pidenExperiencia,
  respaldosDeLaExperiencia,
} from './la-experiencia';
import { LaExperienciaService } from './la-experiencia.service';
import type { PreguntaDeLaPostulacion } from './las-preguntas';
import {
  LasPreguntasService,
  type RespuestaDelModal,
} from './las-preguntas.service';
import { PostulacionRepository } from './postulacion.repository';
import { type LaVueltaAnterior, laVueltaAnterior } from './volver-a-armar';

// «ARMAR POSTULACIÓN» (decisión 35 del doc 17, 19-10). Felipe: "un solo
// botón que diga armar postulación y que haga todos los anexos, arme la
// propuesta técnica, arme la propuesta comercial, que solamente me pida el
// precio". Encadena lo que ya existe, sin nada nuevo de IA:
//  1. la oferta (Opus decide UNA vez qué se ofrece, decisión 33);
//  2. cuando queda lista, los anexos con ese precio (la oferta económica la
//     calcula el motor: neto e IVA) y, si las bases no traen un formulario
//     técnico, la propuesta técnica valorizada (decisiones 40 y 42: con
//     formulario, el detalle va en él; sin él, la propuesta lleva el
//     detalle y al final el valor: neto, IVA y total), las dos desde lo
//     postulado;
//  3. la cotización vinculada NO se toca: desde la decisión 69 (22-10) se
//     edita a mano para cuadrar lo que se subcontrata, y se reescribe con
//     lo postulado solo con el botón de «¿Calza el precio?».
// Todo por detrás. La firma sigue aparte, después de revisar (17-10).

/** Lo que anota «Armar postulación» en la fila de la oferta. */
export type PostulacionArmada = {
  /** El precio, con IVA. */
  total: number;
  /** ¿Va propuesta técnica? Si las bases no traen un formulario técnico
   *  (decisión 42). */
  propuesta: boolean;
  /** ¿Van los anexos del comprador? Una compra ágil sin formularios no los
   *  tiene: va solo la propuesta técnica valorizada (decisión 94). Sin el
   *  dato, como antes, sí van. */
  anexos?: boolean;
  /** ¿Estaban firmados todos los anexos? No se rehacen (decisión 49) y la
   *  pantalla dice «ya firmados», no «No alcanzó a partir» (decisión 99). */
  firmados?: boolean;
  /** Lo que no alcanzó a partir después de la oferta, en palabras. */
  problemas?: string[];
};

/** El armado detenido porque a la empresa le faltan respuestas (decisión
 *  119, parte 3): el precio con que se pidió y las preguntas. Va en
 *  `parametros.detenida` de la última fila de la oferta. */
export type ArmadoDetenido = {
  total: number;
  preguntas: PreguntaDeLaPostulacion[];
};

export { pidenExperiencia };

/** El formulario que lleva el detalle técnico (calidad de la oferta,
 *  oferta o propuesta técnica). */
const FORMULARIO_TECNICO = /calidad|oferta tecnica|propuesta tecnica/;

/** ¿Va la propuesta técnica valorizada? Siempre que las bases NO traigan
 *  un formulario técnico (decisión 42; Felipe, 19-10, por las compras
 *  ágiles: "¿qué pasa si no viene ningún formulario a prerrellenar?"). Si
 *  lo traen, el detalle va en ese formulario (decisión 40). */
export const vaLaPropuesta = (
  resultado: Record<string, unknown> | null | undefined,
): boolean => {
  const { formularios, textos } = loQueDicenLasBases(resultado);
  // Un análisis anterior no trae los formularios: el requisito que nombra
  // un formulario o un anexo cuenta como tal.
  const deUnFormulario = [
    ...formularios.filter((t): t is string => typeof t === 'string'),
    ...textos.filter((t) => /\b(formulario|anexo)\b/.test(normalizar(t))),
  ];
  return !deUnFormulario.some((t) => FORMULARIO_TECNICO.test(normalizar(t)));
};

@Injectable()
export class ArmarPostulacionService {
  constructor(
    private readonly oferta: ArmarLaOfertaService,
    private readonly documentos: GeneracionService,
    private readonly cotizacion: CotizacionDeLaPostulacionService,
    private readonly generaciones: GeneracionRepository,
    private readonly analisis: AnalisisRepository,
    private readonly oferente: OferenteRepository,
    private readonly repo: PostulacionRepository,
    private readonly experiencia: LaExperienciaService,
    private readonly adjuntos: AdjuntosRepository,
    private readonly logger: PinoLogger,
    /** La cotización detallada (decisión 119). Opcional: las pruebas de
     *  antes no la traen, y sin ella no se arma. */
    @Optional()
    private readonly cotizacionDetallada?: LaCotizacionDetalladaService,
    /** Las preguntas antes de armar (decisión 119, parte 3). Opcional: sin
     *  ellas se arma sin preguntar, como antes. */
    @Optional()
    private readonly preguntas?: LasPreguntasService,
  ) {
    this.logger.setContext(ArmarPostulacionService.name);
  }

  /** Responde al tiro con la oferta en curso; lo demás sigue por detrás.
   *  Si a la empresa le faltan respuestas, responde con el armado detenido
   *  y las preguntas (decisión 119, parte 3). */
  async armar(
    user: User,
    oportunidadId: number,
    total: number,
    opciones: { sinPreguntar?: boolean } = {},
  ): Promise<FilaDeGeneracion> {
    const companyId = user.company_id;
    const [analisis, oferente, ficha] = await Promise.all([
      this.analisis.ultimo(companyId, oportunidadId),
      this.oferente.oferente(companyId),
      this.repo.oportunidad(companyId, oportunidadId),
    ]);
    // Los anexos lo necesitan: se dice antes de gastar en la oferta.
    if (!oferente?.razon_social || !oferente.rut) {
      throw new BadRequestException(
        'Primero llena los datos de la empresa en «Mi empresa» (al menos la razón social y el RUT).',
      );
    }
    // Si las bases piden experiencia, va la que eligió la IA (decisión 76)
    // y, desde la decisión 86 (27-10), ya no se confirma a mano antes: se
    // elige y se confirma sola, por detrás, cuando la oferta quedó lista.
    const piden =
      analisis?.estado === 'listo' && pidenExperiencia(analisis.resultado);
    // Decisión 94 (27-10): una compra ágil sin formularios no tiene anexos
    // que llenar; va la propuesta técnica valorizada con el formato de la
    // casa. Felipe, con la 3497-466-COT26: "como no hay formularios no arma
    // nada... es compra ágil, ahí usemos el formato de la casa para sacar
    // la propuesta técnica valorizada".
    const listo = analisis?.estado === 'listo';
    const sinAnexos =
      ficha?.proceso?.tipo === 'compra_agil' &&
      listo &&
      loQueDicenLasBases(analisis.resultado).formularios.length === 0;
    const armada: PostulacionArmada = {
      total,
      propuesta: (listo && vaLaPropuesta(analisis.resultado)) || sinAnexos,
      ...(sinAnexos ? { anexos: false } : {}),
    };
    // Decisión 119, parte 3 (07-11). Felipe: "pincho una licitación y le
    // faltan 5 preguntas... vuelvo a la licitación, me aparece el modal de
    // lo que me falta, yo respondo las preguntas y lo genera". Antes de
    // gastar en la oferta: lo que la IA no sabe de la empresa se pregunta.
    if (listo && this.preguntas && !opciones.sinPreguntar) {
      // Lo postulado queda fijo (decisión 33): no se pregunta por nada.
      if (ficha) noSiEstaCongelada(ficha.estado);
      const faltan = await this.preguntas.queFalta(
        companyId,
        oportunidadId,
        analisis.resultado,
        ficha?.exigencias_marcadas ?? {},
      );
      if (faltan.length > 0) {
        const detenida = await this.detenida(user, oportunidadId, {
          total,
          preguntas: faltan,
        });
        if (detenida) return detenida;
      }
    }
    return this.oferta.pedir(companyId, user.id, oportunidadId, {
      parametros: { postulacion: armada },
      despues: async (ofertaId) =>
        this.seguir(
          user,
          oportunidadId,
          ofertaId,
          armada,
          piden ? await this.experiencia.paraArmar(user, oportunidadId) : null,
        ),
    });
  }

  /** Las respuestas del modal (decisión 119, parte 3): quedan en «Mi
   *  empresa» y marcadas en «Bases y criterios», y recién ahí se arma, sin
   *  volver a preguntar. */
  async responderYArmar(
    user: User,
    oportunidadId: number,
    total: number,
    respuestas: RespuestaDelModal[],
  ): Promise<FilaDeGeneracion> {
    if (!this.preguntas) {
      throw new BadRequestException('Este motor todavía no guarda respuestas.');
    }
    await this.preguntas.guardar(user.company_id, oportunidadId, respuestas);
    return this.armar(user, oportunidadId, total, { sinPreguntar: true });
  }

  /** El armado detenido por las preguntas, para que la pantalla abra el
   *  modal al tiro o al volver a la licitación. Va en la última fila de la
   *  oferta: así lo armado antes sigue a la vista en las demás pantallas
   *  («Lo que tienes que ofrecer», la cotización) mientras no se responda.
   *  Sin oferta todavía, una fila nueva en «error», sin oferta. null si hay
   *  una oferta en curso: sigue el camino de siempre. */
  private async detenida(
    user: User,
    oportunidadId: number,
    detenida: ArmadoDetenido,
  ): Promise<FilaDeGeneracion | null> {
    const companyId = user.company_id;
    const ultima = await this.generaciones.ultimoDeTipo(
      companyId,
      oportunidadId,
      'oferta',
    );
    if (ultima?.estado === 'procesando') return null;
    if (ultima) {
      const parametros = { ...(ultima.parametros ?? {}), detenida };
      await this.generaciones.anotarParametros(
        companyId,
        ultima.id,
        parametros,
      );
      return { ...ultima, parametros };
    }
    const fila = await this.generaciones.crearGeneracion({
      company_id: companyId,
      oportunidad_id: oportunidadId,
      tipo: 'oferta',
      parametros: { detenida },
      modelo: MODELO_HAIKU,
      archivos: [],
      no_leidos: [],
      pedido_por: await this.adjuntos.perfilDe(companyId, user.id),
    });
    if (!fila) return null;
    const n = detenida.preguntas.length;
    const error =
      n === 1
        ? 'Falta 1 respuesta sobre tu empresa.'
        : `Faltan ${n} respuestas sobre tu empresa.`;
    await this.generaciones.terminar(companyId, fila.id, {
      estado: 'error',
      error,
    });
    return {
      ...fila,
      estado: 'error',
      error,
      terminado_en: new Date().toISOString(),
    };
  }

  /** Cuando la oferta quedó lista. Cada documento es un trabajo de la IA
   *  con su propia fila (ahí queda si resultó); lo que ni siquiera partió
   *  queda anotado en la fila de la oferta. Nunca lanza. */
  async seguir(
    user: User,
    oportunidadId: number,
    ofertaId: number,
    armada: PostulacionArmada,
    experiencia: ExperienciaConfirmada | null = null,
  ): Promise<void> {
    const companyId = user.company_id;
    const analisis = await this.analisis
      .ultimo(companyId, oportunidadId)
      .catch(() => null);
    const resultado = analisis?.estado === 'listo' ? analisis.resultado : null;
    // La experiencia que confirmó la empresa (decisión 76): los anexos
    // llevan esas filas y el ZIP pega los PDF de las de Post-venta. Ya no se
    // lee Post-venta aquí: lo leyó la propuesta de experiencia.
    const postVenta = experiencia ? respaldosDeLaExperiencia(experiencia) : [];
    // «Volver a armar» (decisión 49): lo firmado se queda y no se rehace;
    // los borradores sin firma los reemplaza lo nuevo (se borran cuando
    // quedó guardado).
    const vuelta = await this.laVueltaAnterior(
      companyId,
      oportunidadId,
      armada.total,
      resultado,
      ofertaId,
    );
    const conPropuesta = armada.propuesta && !vuelta.propuestaFirmada;
    const propuestasViejas = conPropuesta ? [] : vuelta.borradoresDePropuesta;
    // Decisión 99 (27-10): con todo firmado no hay trabajo de anexos, y sin
    // esta marca la pantalla lo daba por no partido. Felipe, sobre el rojo
    // «No alcanzó a partir» de una postulación ya firmada: "si armalo".
    const anotada: PostulacionArmada =
      vuelta.todoFirmado && armada.anexos !== false
        ? { ...armada, firmados: true }
        : armada;
    if (anotada !== armada) await this.anotar(companyId, ofertaId, anotada);
    // Decisión 119 (07-11, el reparto): el precio se reparte una sola vez
    // sobre los servicios de la cotización vinculada, y las mismas cifras
    // van a la cotización detallada y a los formularios.
    const reparto = await this.elReparto(
      companyId,
      oportunidadId,
      armada.total,
    );
    const pasos: Array<[string, () => Promise<unknown>]> = [];
    if (vuelta.todoFirmado || armada.anexos === false) {
      // Nada que rehacer, o una compra ágil sin formularios (decisión 94):
      // los borradores de lo ya firmado sobran.
      await this.adjuntos
        .borrarBorradores(companyId, oportunidadId, [
          ...vuelta.borradoresDeFormularios,
          ...propuestasViejas,
        ])
        .catch((error) =>
          this.logger.warn(
            `borradores de la oportunidad ${oportunidadId}: ${mensajeDe(error)}`,
          ),
        );
    } else {
      pasos.push([
        'Los anexos',
        () =>
          this.documentos.generarAnexos(companyId, user.id, oportunidadId, {
            monto_total: armada.total,
            post_venta: postVenta,
            ...(experiencia ? { experiencia } : {}),
            ya_firmados: vuelta.yaFirmados,
            reemplaza: [...vuelta.borradoresDeFormularios, ...propuestasViejas],
            ...(reparto ? { reparto } : {}),
          }),
      ]);
    }
    if (conPropuesta) {
      pasos.push([
        'La propuesta técnica',
        () =>
          this.documentos.crearPropuesta(companyId, user.id, oportunidadId, {
            monto_total: armada.total,
            reemplaza: vuelta.borradoresDePropuesta,
          }),
      ]);
    }
    // Decisión 119 (07-11): si las bases piden una cotización, la arma el
    // motor desde la cotización vinculada. Felipe, con la 2705-1740-COT26:
    // "todos los documentos debieron generarse". Lo subido a mano manda; la
    // firmada con el mismo precio se queda.
    const problemas: string[] = [];
    const conCotizacion =
      Boolean(this.cotizacionDetallada) &&
      pidenLaCotizacion(resultado) &&
      (vuelta.cotizacion === 'no_hay' || vuelta.cotizacion === 'otro_precio');
    if (conCotizacion && this.cotizacionDetallada) {
      const detallada = this.cotizacionDetallada;
      pasos.push([
        'La cotización detallada',
        () =>
          detallada.armar(user, oportunidadId, ofertaId, armada.total, {
            conPropuesta: armada.propuesta,
            reemplaza: vuelta.borradoresDeCotizacion,
            ...(reparto ? { reparto } : {}),
          }),
      ]);
      if (vuelta.cotizacion === 'otro_precio') {
        problemas.push(
          'La cotización detallada firmada tiene el precio de antes: firma la nueva y borra la anterior.',
        );
      }
    }
    await Promise.all(
      pasos.map(async ([que, paso]) => {
        try {
          await paso();
        } catch (error) {
          problemas.push(`${que}: ${mensajeDe(error)}`);
        }
      }),
    );
    if (problemas.length === 0) return;
    this.logger.warn(
      `postulación de la oportunidad ${oportunidadId}: ${problemas.join(' · ')}`,
    );
    await this.anotar(companyId, ofertaId, { ...anotada, problemas });
  }

  /** Lo que pasó al armar, en la fila de la oferta. Nunca lanza. */
  private async anotar(
    companyId: number,
    ofertaId: number,
    postulacion: PostulacionArmada,
  ): Promise<void> {
    await this.generaciones
      .anotarParametros(companyId, ofertaId, { postulacion })
      .catch((error) =>
        this.logger.error(
          `no pude anotar lo que pasó con la postulación ${ofertaId}: ${mensajeDe(error)}`,
        ),
      );
  }

  /** El precio repartido sobre la cotización vinculada (el-reparto.ts).
   *  Sin vinculada, o si no se puede leer, null: los formularios dejan el
   *  precio por ítem pendiente, como antes. Nunca lanza. */
  private async elReparto(
    companyId: number,
    oportunidadId: number,
    total: number,
  ): Promise<DiaDeLaCotizacion[] | null> {
    try {
      const o = await this.repo.oportunidad(companyId, oportunidadId);
      if (!o?.quotation_id) return null;
      const q = await this.repo.cotizacion(companyId, { id: o.quotation_id });
      return q ? repartirElPrecio(diasDeLaCotizacion(q), total) : null;
    } catch (error) {
      this.logger.warn(
        `el reparto del precio de la oportunidad ${oportunidadId}: ${mensajeDe(error)}`,
      );
      return null;
    }
  }

  /** Lo que ya hay en «Mi postulación»: qué está firmado y qué borradores
   *  se reemplazan (volver-a-armar.ts). Si no se puede leer, se rehace todo
   *  y no se borra nada. */
  private async laVueltaAnterior(
    companyId: number,
    oportunidadId: number,
    total: number,
    resultado: Record<string, unknown> | null,
    ofertaId?: number,
  ): Promise<LaVueltaAnterior> {
    try {
      const [archivos, trabajos] = await Promise.all([
        this.repo.archivosDelSet(companyId, oportunidadId),
        this.repo.trabajosDeLaIA(companyId, oportunidadId),
      ]);
      return laVueltaAnterior({
        postulacion: archivos.filter((a) => a.seccion === 'postulacion'),
        formularios: Array.isArray(resultado?.formularios)
          ? (resultado.formularios as FormularioDeLasBases[])
          : [],
        total,
        totalDe: new Map(
          trabajos
            .filter((t) => t.tipo === 'anexos')
            .map((t) => {
              const monto = Number(t.parametros?.monto_total);
              return [t.id, monto > 0 ? monto : null];
            }),
        ),
        // El precio de la vuelta anterior: la oferta lista más nueva que no
        // es esta (decisión 119).
        precioAnterior: (() => {
          const antes = trabajos.find(
            (t) =>
              t.tipo === 'oferta' && t.estado === 'listo' && t.id !== ofertaId,
          );
          const monto = Number(
            (antes?.parametros?.postulacion as { total?: unknown } | undefined)
              ?.total,
          );
          return monto > 0 ? monto : null;
        })(),
      });
    } catch (error) {
      this.logger.warn(
        `lo que ya había en la postulación ${oportunidadId}: ${mensajeDe(error)}`,
      );
      return {
        yaFirmados: [],
        todoFirmado: false,
        borradoresDeFormularios: [],
        borradoresDePropuesta: [],
        propuestaFirmada: false,
        borradoresDeCotizacion: [],
        cotizacion: 'no_hay',
      };
    }
  }
}
