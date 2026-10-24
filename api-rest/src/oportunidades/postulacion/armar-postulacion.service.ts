import { BadRequestException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import type { User } from 'src/users/entities/user.entity';
import { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import { AnalisisRepository } from '../analisis/analisis.repository';
import {
  type FilaDeGeneracion,
  GeneracionRepository,
} from '../generacion/generacion.repository';
import { GeneracionService } from '../generacion/generacion.service';
import { OferenteRepository } from '../oferente/oferente.repository';
import { ArmarLaOfertaService } from './armar-la-oferta.service';
import { CotizacionDeLaPostulacionService } from './cotizacion-de-la-postulacion.service';
import { type FormularioDeLasBases, normalizar } from './el-set';
import {
  type ExperienciaConfirmada,
  loQueDicenLasBases,
  pidenExperiencia,
  respaldosDeLaExperiencia,
} from './la-experiencia';
import { LaExperienciaService } from './la-experiencia.service';
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
  /** Lo que no alcanzó a partir después de la oferta, en palabras. */
  problemas?: string[];
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
  ) {
    this.logger.setContext(ArmarPostulacionService.name);
  }

  /** Responde al tiro con la oferta en curso; lo demás sigue por detrás. */
  async armar(
    user: User,
    oportunidadId: number,
    total: number,
  ): Promise<FilaDeGeneracion> {
    const companyId = user.company_id;
    const [analisis, oferente] = await Promise.all([
      this.analisis.ultimo(companyId, oportunidadId),
      this.oferente.oferente(companyId),
    ]);
    // Los anexos lo necesitan: se dice antes de gastar en la oferta.
    if (!oferente?.razon_social || !oferente.rut) {
      throw new BadRequestException(
        'Primero llena los datos de la empresa en «Mi empresa» (al menos la razón social y el RUT).',
      );
    }
    // El proceso estricto (decisión 76): si las bases piden experiencia, la
    // empresa confirma antes cuál presenta, y van esas y ninguna otra.
    const piden =
      analisis?.estado === 'listo' && pidenExperiencia(analisis.resultado);
    const experiencia = piden
      ? await this.experiencia.confirmada(companyId, oportunidadId)
      : null;
    if (piden && !experiencia) {
      throw new BadRequestException(
        'Primero confirma la experiencia que vas a presentar («La experiencia», arriba): la IA la propone según las bases y tú dices cuáles van.',
      );
    }
    const armada: PostulacionArmada = {
      total,
      propuesta:
        analisis?.estado === 'listo' && vaLaPropuesta(analisis.resultado),
    };
    return this.oferta.pedir(companyId, user.id, oportunidadId, {
      parametros: { postulacion: armada },
      despues: (ofertaId) =>
        this.seguir(user, oportunidadId, ofertaId, armada, experiencia),
    });
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
    );
    const conPropuesta = armada.propuesta && !vuelta.propuestaFirmada;
    const propuestasViejas = conPropuesta ? [] : vuelta.borradoresDePropuesta;
    const pasos: Array<[string, () => Promise<unknown>]> = [];
    if (vuelta.todoFirmado) {
      // Nada que rehacer: los borradores de lo ya firmado sobran.
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
    const problemas: string[] = [];
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
    await this.generaciones
      .anotarParametros(companyId, ofertaId, {
        postulacion: { ...armada, problemas },
      })
      .catch((error) =>
        this.logger.error(
          `no pude anotar lo que faltó de la postulación ${ofertaId}: ${mensajeDe(error)}`,
        ),
      );
  }

  /** Lo que ya hay en «Mi postulación»: qué está firmado y qué borradores
   *  se reemplazan (volver-a-armar.ts). Si no se puede leer, se rehace todo
   *  y no se borra nada. */
  private async laVueltaAnterior(
    companyId: number,
    oportunidadId: number,
    total: number,
    resultado: Record<string, unknown> | null,
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
      };
    }
  }
}
