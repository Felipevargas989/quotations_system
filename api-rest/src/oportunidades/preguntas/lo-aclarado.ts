import { mensajeDe } from 'src/logging/mensaje-de-error';
import type { FilaDePregunta } from './preguntas.repository';

// LO ACLARADO MANDA (decisión 68 del doc 17, 22-10). Felipe: "una sola
// memoria por licitación". La memoria es el análisis de las bases más lo
// aclarado en «Pregúntale a la IA»:
//  - lo que los documentos dicen directo (seguridad alta) entra solo;
//  - una deducción (media) o lo que no está (baja) entra SOLO cuando la
//    persona anota lo que confirmó el comprador. Felipe preguntó qué se
//    gana con que su palabra pese más: cuando las bases no lo dicen, la
//    respuesta real la tiene el comprador, no la IA (el catamarán: «100
//    colaciones» por día o en total cambia el precio casi al triple);
//  - lo que confirmó el comprador manda también sobre una respuesta alta.
// La oferta, los anexos, la propuesta técnica y la validación leen esta
// misma lista, después de lo que piden las bases.

export type FuenteDeLoAclarado = 'documentos' | 'comprador';

export type Aclaracion = {
  pregunta: string;
  respuesta: string;
  fuente: FuenteDeLoAclarado;
};

/** Tope de aclaraciones que entran a un pedido (las más nuevas). */
export const MAX_ACLARACIONES = 30;

/** Lo que entra a la memoria, en el orden en que se preguntó. */
export const loAclarado = (
  filas: ReadonlyArray<
    Pick<FilaDePregunta, 'pregunta' | 'estado' | 'respuesta' | 'seguridad'> & {
      confirmado?: string | null;
    }
  >,
): Aclaracion[] => {
  const lista: Aclaracion[] = [];
  for (const f of filas) {
    if (f.estado !== 'listo') continue;
    const confirmado = f.confirmado?.trim();
    if (confirmado) {
      lista.push({
        pregunta: f.pregunta,
        respuesta: confirmado,
        fuente: 'comprador',
      });
    } else if (f.seguridad === 'alta' && f.respuesta?.trim()) {
      lista.push({
        pregunta: f.pregunta,
        respuesta: f.respuesta.trim(),
        fuente: 'documentos',
      });
    }
  }
  return lista.slice(-MAX_ACLARACIONES);
};

/** La memoria en texto, para el pedido de la IA; nada si no hay. */
export const textoDeLoAclarado = (
  lista: ReadonlyArray<Aclaracion>,
): string[] =>
  lista.length === 0
    ? []
    : [
        'LO ACLARADO DE ESTA LICITACIÓN (manda sobre tu propia lectura de las bases y sobre el análisis; si contradice algo de arriba, gana esto):',
        ...lista.map(
          (a) =>
            `- ${a.pregunta} → ${a.respuesta} (${a.fuente === 'comprador' ? 'lo confirmó el comprador' : 'lo dicen los documentos'})`,
        ),
        '',
      ];

/** La memoria de una licitación sin romper el trabajo de la IA: sin
 *  repositorio (las pruebas de antes) o si falla la lectura, nada. */
export const memoriaDeLaLicitacion = async (
  repo:
    | {
        aclarado(
          companyId: number,
          oportunidadId: number,
        ): Promise<Aclaracion[]>;
      }
    | undefined,
  companyId: number,
  oportunidadId: number,
  avisar: (mensaje: string) => void,
): Promise<Aclaracion[]> => {
  if (!repo) return [];
  try {
    return await repo.aclarado(companyId, oportunidadId);
  } catch (error) {
    avisar(
      `no pude leer lo aclarado de la oportunidad ${oportunidadId}: ${mensajeDe(error)}`,
    );
    return [];
  }
};
