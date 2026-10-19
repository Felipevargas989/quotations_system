import { BadRequestException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import type { User } from 'src/users/entities/user.entity';
import { AnalisisRepository } from '../analisis/analisis.repository';
import {
  type FilaDeGeneracion,
  GeneracionRepository,
} from '../generacion/generacion.repository';
import { GeneracionService } from '../generacion/generacion.service';
import { OferenteRepository } from '../oferente/oferente.repository';
import { ArmarLaOfertaService } from './armar-la-oferta.service';
import { CotizacionDeLaPostulacionService } from './cotizacion-de-la-postulacion.service';
import { normalizar } from './el-set';
import { PostulacionRepository } from './postulacion.repository';

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
//  3. si hay una cotización vinculada, se iguala a lo postulado con el
//     mismo precio (es de solo lectura: cotizacion-de-licitacion.ts).
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
  const requisitos = Array.isArray(resultado?.requisitos)
    ? (resultado.requisitos as Array<{ que?: unknown }>).map((r) => r.que)
    : [];
  const formularios = Array.isArray(resultado?.formularios)
    ? (resultado.formularios as Array<{ nombre?: unknown; aplica?: unknown }>)
        .filter((f) => f.aplica !== false)
        .map((f) => f.nombre)
    : [];
  const textos = [...requisitos, ...formularios].filter(
    (t): t is string => typeof t === 'string',
  );
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
    const armada: PostulacionArmada = {
      total,
      propuesta:
        analisis?.estado === 'listo' && vaLaPropuesta(analisis.resultado),
    };
    return this.oferta.pedir(companyId, user.id, oportunidadId, {
      parametros: { postulacion: armada },
      despues: (ofertaId) => this.seguir(user, oportunidadId, ofertaId, armada),
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
  ): Promise<void> {
    const companyId = user.company_id;
    const pasos: Array<[string, () => Promise<unknown>]> = [
      [
        'Los anexos',
        () =>
          this.documentos.generarAnexos(companyId, user.id, oportunidadId, {
            monto_total: armada.total,
          }),
      ],
    ];
    if (armada.propuesta) {
      pasos.push([
        'La propuesta técnica',
        () =>
          this.documentos.crearPropuesta(companyId, user.id, oportunidadId, {
            monto_total: armada.total,
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
    try {
      const o = await this.repo.oportunidad(companyId, oportunidadId);
      if (o?.quotation_id) {
        await this.cotizacion.llevar(
          user,
          oportunidadId,
          undefined,
          armada.total,
        );
      }
    } catch (error) {
      problemas.push(`La cotización vinculada: ${mensajeDe(error)}`);
    }
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
}
