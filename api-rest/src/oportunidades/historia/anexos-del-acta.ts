import { MAX_BYTES_ADJUNTO } from '../adjuntos/adjuntos.service';
import {
  type Pedir,
  leerPaginaDelAnexo,
  nombreDelArchivo,
  pedirPublico,
} from '../competencia/ofertas-publicas';
import { ENLACE_DEL_ACTA } from './acta';

// LOS ANEXOS DE LA ADJUDICACIÓN (decisión 128 del doc 17, 11-11). Felipe:
// "subir el acta de evaluación debería también ser automático (¿se puede?)".
// Se puede: la página pública del acta de adjudicación (la misma que lee
// `acta.ts`) trae la tabla «Anexos a la Adjudicación», con el mismo control
// de los anexos de una oferta (decisión 96): cada fila se baja con su botón
// «Ver Anexo», sin clave, sin cookie y sin código. Bajar varios juntos pide
// un código de imagen, y ese camino no se usa. Medido el 11-11 con la
// 5040-6-LE26 (Mes de las Juventudes): «Acta de evaluación ID
// 5040-6-LE26.pdf», 851 KB, 4 páginas; el mismo tipo de fila está en la
// 4364-13-LE26 y en la 3902-61-LE25.
//
// De esa tabla se trae el acta de evaluación, que es donde la comisión dice
// cómo decidió. Las declaraciones de conflicto de intereses y lo demás no
// se traen.

export type AnexoDeLaAdjudicacion = {
  nombre: string;
  /** Como lo clasifica Mercado Público: un código
   *  (`DOCUMENT_TYPE_ACTA_EVALUACION_ADJ_ATTACHMENT`) o un texto
   *  («Resolución/Decreto Adjudicación»). */
  tipo: string;
  descripcion: string;
  /** Lo que dice la lista, en KB; null si no lo dice. */
  kb: number | null;
  boton: string;
};

/** Cuántos archivos se traen de una adjudicación, a lo más. */
export const MAX_ANEXOS_DEL_ACTA = 3;

const celda = (pagina: string, n: string, campo: string): string => {
  const m = new RegExp(`id="DWNL_grdId_ctl${n}_${campo}">([^<]*)<`).exec(
    pagina,
  );
  return (m?.[1] ?? '')
    .replace(/&#(\d+);/g, (_, c: string) => String.fromCharCode(Number(c)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim();
};

/** Las filas de «Anexos a la Adjudicación» y los campos ocultos del
 *  formulario, que se devuelven al pedir cada archivo. */
export const anexosDeLaAdjudicacion = (
  pagina: string,
): { anexos: AnexoDeLaAdjudicacion[]; ocultos: Record<string, string> } => {
  const { archivos, ocultos } = leerPaginaDelAnexo(pagina);
  return {
    ocultos,
    anexos: archivos.map((a) => {
      const n = /ctl(\d+)\$search$/.exec(a.boton)?.[1] ?? '';
      return {
        ...a,
        tipo: celda(pagina, n, 'Type'),
        descripcion: celda(pagina, n, 'Description'),
      };
    }),
  };
};

const sinTildes = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** El acta o el informe de evaluación: por el tipo de Mercado Público o, si
 *  el comprador lo subió con otro tipo, por cómo se llama. */
export const esElActaDeEvaluacion = (a: AnexoDeLaAdjudicacion): boolean =>
  /ACTA_EVALUACION/i.test(a.tipo) ||
  /\b(acta|informe|cuadro)\b.{0,40}\bevaluaci|\binforme\b.{0,40}\bcomisi/i.test(
    sinTildes(`${a.nombre} ${a.descripcion} ${a.tipo}`),
  );

/** El decreto o la resolución que adjudica: suele transcribir la
 *  evaluación. */
export const esElDecretoDeAdjudicacion = (a: AnexoDeLaAdjudicacion): boolean =>
  /\b(resolucion|decreto)\b.{0,40}\badjudic/i.test(sinTildes(a.tipo));

/** Lo que se trae: el acta de evaluación; si el comprador no la subió como
 *  tal, el decreto o la resolución de adjudicación. Solo PDF y Word, que es
 *  lo que lee «Aprender del acta», y nada que la lista diga que pesa más de
 *  lo que Eventia guarda (30 MB). */
export const anexosParaAprender = (
  anexos: AnexoDeLaAdjudicacion[],
): AnexoDeLaAdjudicacion[] => {
  const leibles = anexos.filter(
    (a) =>
      /\.(pdf|docx)$/i.test(a.nombre) &&
      (a.kb === null || a.kb * 1024 <= MAX_BYTES_ADJUNTO),
  );
  const actas = leibles.filter(esElActaDeEvaluacion);
  return (
    actas.length > 0 ? actas : leibles.filter(esElDecretoDeAdjudicacion)
  ).slice(0, MAX_ANEXOS_DEL_ACTA);
};

/** Baja de la página pública del acta lo que sirve para aprender de la
 *  comisión. Vacío si el comprador no adjuntó el acta de evaluación (ni el
 *  decreto). Lanza si Mercado Público no responde. */
export async function bajarAnexosDelActa(
  enlace: string,
  pedir: Pedir = pedirPublico,
): Promise<Array<{ nombre: string; contenido: Buffer }>> {
  if (!ENLACE_DEL_ACTA.test(enlace)) {
    throw new Error('el enlace del acta no es de Mercado Público');
  }
  // Por https desde el comienzo: el enlace de la API viene con http, y al
  // redirigir un POST se pierde lo que lleva.
  const url = enlace.replace(/^http:/i, 'https:');
  const pagina = await pedir(url);
  if (!pagina.ok) {
    throw new Error(`Mercado Público respondió ${pagina.status}`);
  }
  const { anexos, ocultos } = anexosDeLaAdjudicacion(await pagina.text());
  const traidos: Array<{ nombre: string; contenido: Buffer }> = [];
  for (const a of anexosParaAprender(anexos)) {
    const cuerpo = new URLSearchParams(ocultos);
    cuerpo.set(`${a.boton}.x`, '5');
    cuerpo.set(`${a.boton}.y`, '5');
    const r = await pedir(url, {
      method: 'POST',
      body: cuerpo,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const disposicion = r.headers.get('content-disposition');
    // Sin «attachment» no es el archivo: es la página de vuelta.
    if (!r.ok || !/attachment/i.test(disposicion ?? '')) continue;
    traidos.push({
      nombre: nombreDelArchivo(disposicion) ?? a.nombre,
      contenido: Buffer.from(await r.arrayBuffer()),
    });
  }
  return traidos;
}
