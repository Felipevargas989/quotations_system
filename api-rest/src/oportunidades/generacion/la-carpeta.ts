import { NOMBRES_DE_DOCUMENTO } from '../oferente/nombres-de-documento';
import { TIPO_RESPALDO } from '../oferente/respaldo';

// LA CARPETA DE «MI EMPRESA» PARA LA IA DE LOS ANEXOS (decisión 121,
// 09-11-2026). En la 2656-97-LE26 el Anexo N°4 (programas de integridad, el
// 10% del puntaje) quedó sin llenar «porque no hay datos de programas de
// integridad de la empresa», con el programa en la carpeta desde el 27-10 y
// dentro del ZIP. La IA que llena los formularios leía los datos de «Mi
// empresa» y su experiencia, pero no la carpeta. Felipe: "yo creo que lo
// teníamos en la integridad... teníamos el documento, creo que inclusive
// está arriba". Va el nombre de cada documento (lo de adentro lo revisa
// «Validar todo»); los respaldos de experiencia no, porque ya van aparte.

/** Un documento de la carpeta, como lo lee la IA. */
export type DocumentoDeLaCarpeta = {
  tipo: string;
  nombre: string;
  vence: string | null;
};

/** Lo que va a la IA: la carpeta sin los respaldos de experiencia. */
export const laCarpetaParaLaIA = (
  documentos: ReadonlyArray<DocumentoDeLaCarpeta>,
): DocumentoDeLaCarpeta[] =>
  documentos
    .filter((d) => d.tipo !== TIPO_RESPALDO)
    .map((d) => ({ tipo: d.tipo, nombre: d.nombre, vence: d.vence ?? null }));

/** El bloque de las instrucciones de los anexos, o nada si la carpeta está
 *  vacía. */
export const textoDeLaCarpeta = (
  carpeta: ReadonlyArray<DocumentoDeLaCarpeta> | undefined,
): string[] =>
  !carpeta || carpeta.length === 0
    ? []
    : [
        '',
        'LO QUE LA EMPRESA TIENE EN SU CARPETA DE DOCUMENTOS («Mi empresa»; va en el ZIP para Mercado Público cuando las bases lo piden):',
        ...carpeta.map(
          (d) =>
            `- ${NOMBRES_DE_DOCUMENTO[d.tipo] ?? d.tipo}: ${d.nombre}${d.vence ? ` (vence ${d.vence})` : ''}`,
        ),
        '- Si un formulario pregunta si la empresa tiene uno de estos documentos (por ejemplo, un programa de integridad o de cumplimiento), la respuesta es sí: llénalo así y anota que se adjunta copia. No lo dejes en blanco ni en pendientes por falta de datos.',
      ];
