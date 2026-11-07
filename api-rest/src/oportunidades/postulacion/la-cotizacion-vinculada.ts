import type { CotizacionDeLaPostulacion } from './postulacion.repository';

// LA COTIZACIÓN VINCULADA MANDA (decisión 119 del doc 17, 07-11). Felipe:
// "si está vinculada a una cotización, la arme en base a esa cotización",
// "respetando claramente las bases", y "yo debería poder vincular antes de
// armar la licitación... una vez vinculada toma todos sus antecedentes". La
// IA sigue armando la oferta (la matriz: cómo se cumple cada especificación
// de las bases), pero lo que se ofrece ya está decidido: los mismos
// productos, días y personas de la cotización. Va sin precios: los precios
// nunca deciden qué se ofrece (decisión 74).

type Fila = Record<string, unknown>;

const filas = (v: unknown): Fila[] =>
  Array.isArray(v)
    ? v.filter((x): x is Fila => Boolean(x && typeof x === 'object'))
    : [];

const texto = (v: unknown): string =>
  typeof v === 'string'
    ? v.replace(/\s+/g, ' ').trim()
    : typeof v === 'number' && Number.isFinite(v)
      ? String(v)
      : '';

const diaDe = (f: Fila): number => {
  const d = Number(f.day);
  return Number.isInteger(d) && d > 0 ? d : 0;
};

const fechaCorta = (iso: string | null | undefined): string | null =>
  iso ? iso.slice(0, 10).split('-').reverse().join('-') : null;

/** Un producto de la cotización como lo lee la IA: su nombre, su id del
 *  catálogo y, si es más de uno por persona, la cantidad. */
const producto = (f: Fila): string => {
  const nombre = texto(f.nombre);
  const id = texto(f.codigo);
  const cantidad = Number(f.quantity);
  return [
    nombre || '(sin nombre)',
    id ? ` (id ${id})` : '',
    Number.isInteger(cantidad) && cantidad > 1 ? ` ×${cantidad}` : '',
  ].join('');
};

/** La cotización vinculada en texto para la IA de la oferta, día por día;
 *  null si no trae productos. */
export const laCotizacionVinculadaEnTexto = (
  q: CotizacionDeLaPostulacion,
): string | null => {
  const items = (q.items ?? {}) as Fila;
  const fijos = filas(items.fixed_services);
  const variables = filas(items.variable_services);
  if (fijos.length === 0 && variables.length === 0) return null;
  const desde = fechaCorta(q.event_date);
  const hasta = fechaCorta(q.event_end_date);
  const cuando = desde
    ? hasta && hasta !== desde
      ? `, del ${desde} al ${hasta}`
      : `, el ${desde}`
    : '';
  const lineas = [
    `N° ${q.quotation_number} (${q.quotation_status}), para ${q.people_count} personas${cuando}.`,
  ];
  const dias = [...new Set([...fijos, ...variables].map(diaDe))].sort(
    (a, b) => a - b,
  );
  for (const d of dias) {
    lineas.push(d === 0 ? 'Todo el evento:' : `Día ${d}:`);
    for (const f of fijos.filter((x) => diaDe(x) === d)) {
      lineas.push(`- Servicio fijo: ${producto(f)}`);
    }
    for (const v of variables.filter((x) => diaDe(x) === d)) {
      const personas = Number(v.people);
      const quien = v.audience === 'ninos' ? 'niños' : 'adultos';
      lineas.push(
        `- ${texto(v.category) || 'Servicio'} (${Number.isInteger(personas) && personas > 0 ? personas : q.people_count} personas, ${quien}): ${filas(v.items).map(producto).join('; ')}`,
      );
    }
  }
  return lineas.join('\n');
};
