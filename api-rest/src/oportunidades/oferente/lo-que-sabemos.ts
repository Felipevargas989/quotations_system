import type { MarcaDeExigencia } from '../ficha/ficha.repository';

// LO QUE EVENTIA SABE DE TU EMPRESA (decisión 119, parte 3, 07-11-2026;
// migración 190). Felipe: "una vez que ya lo generó, en la siguiente
// cotización no me vuelve a preguntar si tengo ramplas, po. Lo aprende como
// parte del conocimiento de la empresa".
//
// Cada respuesta de la empresa (✓ Lo tengo / ✗ No puedo, con un detalle si
// quiere) queda guardada con la exigencia en minúsculas y sin tildes, la
// misma clave de las marcas de «Bases y criterios» (migración 152). Sirve
// para tres cosas:
//  - «Armar postulación» no vuelve a preguntar lo ya respondido
//    (postulacion/las-preguntas.ts);
//  - todas las IA de Oportunidades la leen, junto a lo que sabe la casa
//    (`loQueSabeLaCasa`, analisis/comun.ts);
//  - los documentos ya no dejan [POR CONFIRMAR] en lo respondido
//    (`conLoQueRespondio`, abajo).
// Se ve, se cambia y se borra en «Mi empresa». Como las lecciones del
// cerebro (cerebro/lecciones.ts), vive también en la memoria del motor: se
// trae al arrancar, cada 5 minutos y apenas cambia.

export type RespuestaDeLaEmpresa = {
  id: number;
  company_id: number;
  /** La exigencia en minúsculas, sin tildes y con un solo espacio. */
  clave: string;
  /** Lo que se le preguntó, en palabras simples. */
  pregunta: string;
  /** Lo que decían las bases, tal cual. */
  exigencia: string | null;
  respuesta: MarcaDeExigencia;
  detalle: string | null;
  /** La licitación de donde salió (null si se borró). */
  oportunidad_id: number | null;
  /** Su código, solo en la lista de «Mi empresa». */
  oportunidad?: { codigo: string } | null;
  creado_en: string;
  actualizado_en: string;
};

/** La clave de una exigencia: la MISMA que guarda «Bases y criterios»
 *  (frontend, `exigencias.ts`: `normalizeText`, un solo espacio, 400). */
export const claveDeExigencia = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);

const enMemoria = new Map<number, RespuestaDeLaEmpresa[]>();

/** Las respuestas de una empresa, como las trajo la base. */
export const guardarRespuestas = (
  empresa: number,
  lista: RespuestaDeLaEmpresa[],
): void => {
  enMemoria.set(empresa, lista);
};

/** Todas de una vez (la carga del arranque y cada 5 min): la empresa que
 *  ya no tiene ninguna queda sin respuestas. */
export const reemplazarTodas = (
  porEmpresa: Map<number, RespuestaDeLaEmpresa[]>,
): void => {
  enMemoria.clear();
  for (const [empresa, lista] of porEmpresa) guardarRespuestas(empresa, lista);
};

export const respuestasDe = (empresa: number): RespuestaDeLaEmpresa[] =>
  enMemoria.get(empresa) ?? [];

/** Las que caben en lo que lee la IA: las más nuevas primero. */
export const MAXIMO_PARA_LA_IA = 150;

const EN_PALABRAS: Record<MarcaDeExigencia, string> = {
  lo_tengo: 'Lo tiene',
  no_puedo: 'No puede',
};

/** Lo que se suma a lo que leen las IA de Oportunidades, o '' si la
 *  empresa no ha respondido nada. */
export const seccionDeLoQueSabemos = (
  lista: RespuestaDeLaEmpresa[],
): string => {
  if (lista.length === 0) return '';
  const ultimas = [...lista]
    .sort((a, b) => b.actualizado_en.localeCompare(a.actualizado_en))
    .slice(0, MAXIMO_PARA_LA_IA);
  return [
    '',
    '',
    '---',
    '',
    'LO QUE YA RESPONDIÓ LA EMPRESA (en «Armar postulación» o en «Bases y criterios»; se corrige en «Mi empresa»). Es un dato de la empresa, igual que sus instalaciones:',
    ...ultimas.map(
      (r) =>
        `- ${EN_PALABRAS[r.respuesta]}: ${r.pregunta}${r.detalle ? ` (${r.detalle})` : ''}`,
    ),
  ].join('\n');
};

/** Un ítem de «¿Puedo cumplir?» como lo lee la generación. */
type ItemRevisado = {
  que: string;
  estado: string;
  con_que: string;
  por_que: string;
};

/** «¿Puedo cumplir?» con lo que ya respondió la empresa: lo que dijo que
 *  tiene pasa a «lo tiene» (con su detalle) y lo que dijo que no puede, a
 *  «no_puede». Manda lo marcado en ESTA licitación («Bases y criterios» o
 *  el modal) y, si no, la respuesta guardada con las mismas palabras. Así
 *  los documentos no dejan [POR CONFIRMAR] en lo respondido. */
export function conLoQueRespondio<T extends { cumplimiento: ItemRevisado[] }>(
  bases: T | null,
  marcas: Record<string, MarcaDeExigencia> | null | undefined,
  respuestas: RespuestaDeLaEmpresa[],
): T | null {
  if (!bases || bases.cumplimiento.length === 0) return bases;
  if (respuestas.length === 0 && Object.keys(marcas ?? {}).length === 0) {
    return bases;
  }
  const porClave = new Map(respuestas.map((r) => [r.clave, r]));
  return {
    ...bases,
    cumplimiento: bases.cumplimiento.map((i) => {
      const clave = claveDeExigencia(i.que);
      const guardada = porClave.get(clave);
      const marca = marcas?.[clave] ?? guardada?.respuesta;
      if (!marca) return i;
      const detalle =
        guardada?.respuesta === marca ? (guardada.detalle ?? '') : '';
      if (marca === 'lo_tengo') {
        return i.estado === 'tengo'
          ? i
          : {
              ...i,
              estado: 'tengo',
              con_que: detalle || 'lo confirmó la empresa',
              por_que: '',
            };
      }
      return { ...i, estado: 'no_puede', con_que: '', por_que: detalle };
    }),
  };
}
