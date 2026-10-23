import { normalizarRut } from '../historia/ganadores';

// QUIÉN GANA LO QUE TÚ HACES (decisión 71 del doc 17, 23-10). Felipe: "siento
// que estoy como en un mar de productores de eventos y yo no soy productor
// de eventos... quién gana en mi zona es quién gana los servicios que a mí
// me interesa participar... catering, celebraciones, cenas, paseos, fiestas
// de funcionarios". La categoría que pone Mercado Público no sirve (el Día
// del Profesor 2025 de Quillón está como «ventas y marketing»): la IA lee el
// nombre y las líneas de cada licitación UNA vez y dice cuáles son del
// rubro. Quién ganó cada línea lo dice la adjudicación; en una mixta cuenta
// quién ganó la comida, no el escenario.

/** Una línea de la licitación, con quién la ganó (la adjudicación de la
 *  API, `detalle.Items.Listado`). `n` es su posición, desde 1. */
export type LineaDelProceso = {
  n: number;
  producto: string;
  descripcion: string;
  ganador: { rut: string; nombre: string; monto: number } | null;
};

/** Cuántas líneas ve la IA de cada licitación: las de 200 líneas son
 *  compras de insumos, no servicios. */
export const MAX_LINEAS_A_LA_IA = 15;

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const numero = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0;

/** Las líneas de `detalle.Items.Listado`. */
export const lineasDelProceso = (items: unknown): LineaDelProceso[] =>
  (Array.isArray(items) ? items : []).map((x, i) => {
    const it = (x ?? {}) as Record<string, unknown>;
    const adj = (it.Adjudicacion ?? null) as Record<string, unknown> | null;
    const rut = normalizarRut(texto(adj?.RutProveedor));
    return {
      n: i + 1,
      producto: texto(it.NombreProducto),
      descripcion: texto(it.Descripcion),
      ganador: rut
        ? {
            rut,
            nombre: texto(adj?.NombreProveedor) || rut,
            monto: numero(adj?.MontoUnitario) * (numero(adj?.Cantidad) || 1),
          }
        : null,
    };
  });

/** Lo que lee la IA de una licitación. */
export const textoParaLaIA = (
  p: { codigo: string; nombre: string | null },
  lineas: readonly LineaDelProceso[],
): string => {
  const vistas = lineas.slice(0, MAX_LINEAS_A_LA_IA).map((l) => {
    const d = l.descripcion.replace(/\s+/g, ' ').slice(0, 160);
    return `  ${l.n}. ${l.producto}${d ? `: ${d}` : ''}`;
  });
  const resto = lineas.length - vistas.length;
  return [
    `#${p.codigo} | ${(p.nombre ?? '').trim()}`,
    ...vistas,
    ...(resto > 0 ? [`  (y ${resto} líneas más)`] : []),
  ].join('\n');
};

export const ESQUEMA_DEL_RUBRO = {
  type: 'object',
  properties: {
    licitaciones: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          codigo: { type: 'string' },
          del_rubro: { type: 'string', enum: ['si', 'parcial', 'no'] },
          lineas: { type: 'array', items: { type: 'integer' } },
          razon: { type: 'string' },
        },
        required: ['codigo', 'del_rubro', 'lineas', 'razon'],
        additionalProperties: false,
      },
    },
  },
  required: ['licitaciones'],
  additionalProperties: false,
} as const;

export const instruccionesDelRubro = (perfil: string | null): string =>
  [
    'Revisas licitaciones públicas de Chile para una empresa que da estos servicios:',
    perfil?.trim() ||
      '(complejo turístico con salones, restaurante y cabañas, que da alimentación y eventos)',
    '',
    'Son DEL RUBRO de la empresa: servicios de alimentación y catering (almuerzos, cenas, desayunos, onces, cóctel, coffee break, colaciones, banquetería), celebraciones y fiestas (día del funcionario, del profesor, de la madre, aniversarios, navidad, fiestas de fin de año, convivencias), paseos y jornadas recreativas o de autocuidado, arriendo de salón o de centro de eventos, y alojamiento. Una "producción de evento" para una celebración con comida o en un recinto también es del rubro.',
    'NO son del rubro: la producción técnica sola (audio, amplificación, iluminación, escenarios, pantallas, carpas, animación, artistas, shows), la compra de alimentos o abarrotes (no es un servicio de comida), transporte, capacitación y cursos, impresiones, regalos, vestuario, aseo, construcción y todo lo demás.',
    'Cada licitación viene con su código, su nombre y sus líneas numeradas. Por cada una responde: "codigo" tal cual; "del_rubro": "si" si todo lo que pide es del rubro, "parcial" si solo algunas líneas, "no" si nada; "lineas": los números de las líneas del rubro (vacío si "no"); y una "razon" de menos de 12 palabras.',
  ].join('\n');

export type ClasificacionDelRubro = {
  codigo: string;
  del_rubro: 'si' | 'parcial' | 'no';
  lineas: number[];
  razon: string;
};

/** Solo códigos pedidos, una vez cada uno, con líneas que existen. "si" sin
 *  líneas son todas; "parcial" sin líneas no tiene nada del rubro. */
export const rubroValido = (
  salida: unknown,
  pedidos: ReadonlyMap<string, number>,
): ClasificacionDelRubro[] => {
  const lista = (salida as { licitaciones?: unknown })?.licitaciones;
  if (!Array.isArray(lista)) return [];
  const vistos = new Set<string>();
  const r: ClasificacionDelRubro[] = [];
  for (const x of lista) {
    const f = (x ?? {}) as Record<string, unknown>;
    const codigo = texto(f.codigo).replace(/^#/, '');
    const total = pedidos.get(codigo);
    if (total === undefined || vistos.has(codigo)) continue;
    const decision = f.del_rubro;
    if (decision !== 'si' && decision !== 'parcial' && decision !== 'no') {
      continue;
    }
    const tope = Math.min(total, MAX_LINEAS_A_LA_IA);
    let lineas = [
      ...new Set(
        (Array.isArray(f.lineas) ? f.lineas : [])
          .map((n) => Math.trunc(Number(n)))
          .filter((n) => n >= 1 && n <= tope),
      ),
    ].sort((a, b) => a - b);
    let del_rubro: ClasificacionDelRubro['del_rubro'] = decision;
    if (decision === 'no') lineas = [];
    if (decision === 'si') {
      lineas = Array.from({ length: total }, (_, i) => i + 1);
    }
    if (decision === 'parcial' && lineas.length === 0) del_rubro = 'no';
    vistos.add(codigo);
    r.push({
      codigo,
      del_rubro,
      lineas,
      razon: texto(f.razon).slice(0, 200),
    });
  }
  return r;
};

/** Quién ganó las líneas del rubro y por cuánto (por RUT). */
export const ganadoresDeLasLineas = (
  lineas: readonly LineaDelProceso[],
  elegidas: readonly number[],
): Array<{ rut: string; nombre: string; monto: number }> => {
  const set = new Set(elegidas);
  const porRut = new Map<
    string,
    { rut: string; nombre: string; monto: number }
  >();
  for (const l of lineas) {
    if (!set.has(l.n) || !l.ganador) continue;
    const g = porRut.get(l.ganador.rut) ?? {
      rut: l.ganador.rut,
      nombre: l.ganador.nombre,
      monto: 0,
    };
    g.monto += l.ganador.monto;
    porRut.set(g.rut, g);
  }
  return [...porRut.values()];
};

/** Una licitación clasificada (una fila de oportunidades_rubro). */
export type FilaDelRubro = {
  codigo: string;
  del_rubro: 'si' | 'parcial' | 'no';
  ganadores: Array<{ rut: string; nombre: string; monto: number }>;
  nombre: string | null;
  organismo: string | null;
  comuna: string | null;
  fecha: string | null;
};

/** Quién gana lo que la empresa hace en su zona: de más triunfos a menos
 *  (a igual número, el que más monto se llevó). Misma forma que el ranking
 *  de siempre, para la misma tabla. */
export const rankingDelRubro = (
  filas: readonly FilaDelRubro[],
  limite = 50,
) => {
  const porRut = new Map<
    string,
    {
      nombre: string;
      triunfos: number;
      monto: number;
      ultimo: string | null;
      veces: Map<string, number>;
    }
  >();
  for (const f of filas) {
    if (f.del_rubro === 'no') continue;
    for (const g of f.ganadores) {
      const r = porRut.get(g.rut) ?? {
        nombre: g.nombre,
        triunfos: 0,
        monto: 0,
        ultimo: null,
        veces: new Map<string, number>(),
      };
      r.triunfos += 1;
      r.monto += g.monto;
      if (f.fecha && (!r.ultimo || f.fecha > r.ultimo)) r.ultimo = f.fecha;
      const org = f.organismo?.trim() || 'Sin organismo';
      r.veces.set(org, (r.veces.get(org) ?? 0) + 1);
      porRut.set(g.rut, r);
    }
  }
  return [...porRut]
    .map(([rut, r]) => ({
      rut,
      nombre: r.nombre,
      triunfos: r.triunfos,
      monto_total: Math.round(r.monto),
      ultimo: r.ultimo,
      organismos: [...r.veces]
        .map(([nombre, veces]) => ({ nombre, veces }))
        .sort((a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre)),
    }))
    .sort(
      (a, b) =>
        b.triunfos - a.triunfos ||
        b.monto_total - a.monto_total ||
        a.nombre.localeCompare(b.nombre),
    )
    .slice(0, limite);
};
