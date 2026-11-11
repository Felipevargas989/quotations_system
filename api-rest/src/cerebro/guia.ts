import type { Tarea } from './cerebro';

// LA GUÍA DE LA CASA (doc 20 §18; Felipe, 10-11-2026: «quiero que BelIA
// sea un cerebro para guiar a mi personal ... correos tipo, mensajes
// automáticos, horarios, valores, precios, cosas típicas»).
//
// La escribe administración en Mi empresa → «Guía de la casa» y vive en la
// base (`guias_de_la_casa`, migración 202). Se guarda acá, en la memoria
// del motor, para que `cerebroPara` la sume sin ir a la base en cada
// pregunta: la trae `GuiaService` al arrancar, cada 5 minutos y apenas
// administración la guarda. Si la base no responde, cada IA sigue con los
// archivos del cerebro.

export type SeccionDeGuia = { titulo: string; texto: string };

export type Guia = {
  secciones: SeccionDeGuia[];
  actualizada_por_nombre: string | null;
  updated_at: string | null;
};

/** Los topes de la guía (los mismos en la puerta y en la pantalla). */
export const TOPES_DE_LA_GUIA = {
  secciones: 40,
  titulo: 80,
  texto: 4000,
  /** La guía entera entra a las instrucciones de cada pregunta. */
  total: 30_000,
} as const;

/** Las tareas que la leen: BelIA en el chat y los correos de seguimiento.
 *  «Crear con IA» no: arma con el catálogo, y los precios salen de ahí. */
const LA_LEEN: readonly Tarea[] = ['conversar', 'escribir'];

const guias = new Map<number, SeccionDeGuia[]>();

export const guardarGuia = (
  empresa: number,
  secciones: SeccionDeGuia[],
): void => {
  guias.set(empresa, secciones);
};

/** Todas de una vez (la carga del arranque y cada 5 min): la empresa que
 *  ya no tiene ninguna queda sin guía. */
export const reemplazarGuias = (
  porEmpresa: Map<number, SeccionDeGuia[]>,
): void => {
  guias.clear();
  for (const [empresa, secciones] of porEmpresa) {
    guardarGuia(empresa, secciones);
  }
};

export const guiaDe = (empresa: number): SeccionDeGuia[] =>
  guias.get(empresa) ?? [];

/** Lo que se suma al cerebro para esta tarea, o null si no la lee o la
 *  guía está vacía. */
export const seccionDeLaGuia = (
  secciones: SeccionDeGuia[],
  tarea: Tarea,
): string | null => {
  if (!LA_LEEN.includes(tarea)) return null;
  const con = secciones.filter((s) => s.titulo.trim() && s.texto.trim());
  if (con.length === 0) return null;
  return [
    '# La guía de la casa',
    '',
    'La escribió administración de esta empresa en Eventia (Mi empresa → «Guía de la casa») para que respondas al equipo: horarios, tarifas, correos y mensajes tipo, y las preguntas de siempre. Lo que dice la guía es el dato de la casa: úsalo tal cual y, si algo no está, dilo en vez de suponerlo. Los precios de una cotización salen siempre del catálogo de Eventia, no de la guía. Las reglas de arriba siguen mandando.',
    '',
    ...con.flatMap((s) => [`## ${s.titulo.trim()}`, '', s.texto.trim(), '']),
  ]
    .join('\n')
    .trimEnd();
};

/** La guía limpia y dentro de los topes, o el porqué de que no sirva. */
export const limpiarGuia = (
  entrada: Array<{ titulo?: unknown; texto?: unknown }>,
): SeccionDeGuia[] | string => {
  if (entrada.length > TOPES_DE_LA_GUIA.secciones) {
    return `Son ${entrada.length} temas: el máximo es ${TOPES_DE_LA_GUIA.secciones}.`;
  }
  const secciones: SeccionDeGuia[] = [];
  for (const [i, s] of entrada.entries()) {
    const titulo = typeof s.titulo === 'string' ? s.titulo.trim() : '';
    const texto =
      typeof s.texto === 'string' ? s.texto.replace(/\r\n/g, '\n').trim() : '';
    if (!titulo && !texto) continue;
    if (!titulo) return `El tema ${i + 1} no tiene título.`;
    if (!texto) return `«${titulo}» no tiene texto.`;
    if (titulo.length > TOPES_DE_LA_GUIA.titulo) {
      return `El título «${titulo.slice(0, 30)}…» pasa de ${TOPES_DE_LA_GUIA.titulo} letras.`;
    }
    if (texto.length > TOPES_DE_LA_GUIA.texto) {
      return `«${titulo}» pasa de ${TOPES_DE_LA_GUIA.texto} letras.`;
    }
    secciones.push({ titulo, texto });
  }
  const total = secciones.reduce(
    (n, s) => n + s.titulo.length + s.texto.length,
    0,
  );
  if (total > TOPES_DE_LA_GUIA.total) {
    return `La guía tiene ${total} letras: el máximo es ${TOPES_DE_LA_GUIA.total}.`;
  }
  return secciones;
};
