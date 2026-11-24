/**
 * LA IA LEE UNA COMPRA (doc 25, 23-11-2026).
 *
 * Felipe: *"poder ir subiendo las facturas, las guías o screenshot de la
 * guía de despacho, de las compras, de los pedidos, y que se vayan
 * utilizando los costos para tener los márgenes bien"*.
 *
 * Sonnet lee el documento con una estructura fija y asocia cada línea a un
 * insumo del catálogo de la empresa (con sus cortes equivalentes y marcas).
 * Nada cambia acá: lo leído se guarda como PROPUESTA y una persona le da
 * check antes de que el costo llegue al catálogo.
 *
 * Todo lo de este archivo es puro (sin base ni red) para poder probarlo.
 */

export type FamiliaDeUnidad = 'masa' | 'volumen' | 'unidad';

export const UNIDAD_BASE: Record<FamiliaDeUnidad, string> = {
  masa: 'kg',
  volumen: 'L',
  unidad: 'u',
};

export interface InsumoParaLeer {
  id: number;
  name: string;
  unit_family: FamiliaDeUnidad;
  price: number;
  package_qty?: number | null;
  supplier_id?: number | null;
}

export interface EquivalenteParaLeer {
  supply_id: number;
  nombre: string;
  nombre_normal: string;
  tipo: 'corte' | 'marca' | 'texto';
  supplier_id: number | null;
}

export const ESQUEMA_DE_LA_COMPRA = {
  type: 'object',
  properties: {
    es_compra: { type: 'boolean' },
    proveedor: { type: 'string' },
    tipo_documento: {
      type: 'string',
      enum: ['factura', 'boleta', 'guia', 'pedido', 'otro'],
    },
    numero: { type: 'string' },
    fecha: { type: 'string' },
    totales_netos: { type: 'boolean' },
    lineas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          texto: { type: 'string' },
          cantidad_texto: { type: 'string' },
          insumo_id: { type: 'integer' },
          equivalente: { type: 'string' },
          posibles: { type: 'array', items: { type: 'integer' } },
          cantidad_base: { type: 'number' },
          total: { type: 'number' },
        },
        required: ['texto'],
        additionalProperties: false,
      },
    },
  },
  required: ['es_compra', 'tipo_documento', 'totales_netos', 'lineas'],
  additionalProperties: false,
} as const;

/** Sin tildes, minúsculas, espacios simples: para comparar nombres. */
export const normalizar = (t: string): string =>
  (t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.,/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const instruccionesDeLaCompra = (
  empresa: string,
  insumos: InsumoParaLeer[],
  equivalentes: EquivalenteParaLeer[],
): string => {
  const porInsumo = new Map<number, string[]>();
  for (const e of equivalentes) {
    if (e.tipo === 'texto') continue;
    const l = porInsumo.get(e.supply_id) ?? [];
    l.push(`${e.tipo} ${e.nombre}`);
    porInsumo.set(e.supply_id, l);
  }
  const catalogo = insumos
    .map((i) => {
      const eq = porInsumo.get(i.id);
      return `${i.id} | ${i.name} | ${UNIDAD_BASE[i.unit_family]}${
        eq?.length ? ` | equivale: ${eq.join(', ')}` : ''
      }`;
    })
    .join('\n');
  return [
    `Eres el asistente de compras de ${empresa}, una empresa de eventos y banquetería en Chile.`,
    'Te llega una factura, boleta, guía de despacho o pantallazo de un pedido que la empresa le COMPRÓ a un proveedor.',
    'Lee cada línea de producto y asóciala a UN insumo del catálogo de abajo (id | nombre | unidad base | equivalentes).',
    '',
    'Reglas para asociar:',
    '- Asocia por lo que ES el producto, no por la letra exacta. Las marcas no importan: "ACEITE PEDRITO 5L" va a "Aceite maravilla" si ese es el insumo.',
    '- Si el insumo tiene equivalentes (cortes o marcas), una línea con ese corte o marca va a ese insumo.',
    '- `equivalente`: si la línea trae un corte o una marca que NO es el nombre del insumo (ej. "Guachalomo" para una carne, "Pedrito" para un aceite), escríbelo aquí con su nombre corto, esté o no en el catálogo.',
    '- Cortes distintos que la empresa vende por separado NO se mezclan: lomo vetado y lomo liso son insumos distintos. Solo junta cortes que estén listados como equivalentes.',
    '- Si no hay un insumo que sea claramente ese producto, deja `insumo_id` vacío. Nunca adivines.',
    '- Si dudas entre algunos insumos (un corte nuevo que podría ser de varias carnes, una marca que no conoces), deja `insumo_id` vacío y pon en `posibles` hasta 3 ids de los más probables, del más al menos probable. La persona elige. Igual llena `cantidad_base` en la unidad base del más probable.',
    '- Si el producto no se parece a nada del catálogo (algo puntual que pidió un cliente para un evento, ej. silbatos de PVC, globos, un regalo), deja `insumo_id` y `posibles` vacíos: no todo se empareja.',
    '- Lo que no es un insumo de cocina o de servicio (fletes, despacho, descuentos globales, envases retornables) igual va como línea, sin insumo_id.',
    '',
    'Reglas para las cantidades:',
    '- `cantidad_texto`: la cantidad tal como la imprime el documento (ej. "2 x 5 L", "12,4 KG").',
    '- `cantidad_base`: la cantidad TOTAL comprada en la unidad base del insumo asociado (kg, L o u). Convierte: 500 g = 0,5 kg; 2 bidones de 5 L = 10 L; 1 caja de 12 u = 12 u. Si no puedes saberla con certeza, déjala vacía.',
    '- `total`: el monto total de esa línea en pesos chilenos, tal como lo imprime el documento, sin puntos de miles. Si el documento no trae montos (una guía sin precios), déjalo vacío.',
    '- `totales_netos`: true si los montos de las líneas son netos, sin IVA (lo normal en una factura); false si ya incluyen el IVA (boleta, pedido de supermercado).',
    '',
    'Del encabezado: `proveedor` (razón social o nombre de quien vende, no la empresa compradora), `numero` (folio), `fecha` (AAAA-MM-DD).',
    'Si el documento no es una compra (es una cotización a un cliente, una OC de un cliente, otra cosa), `es_compra` = false y `lineas` vacío.',
    '',
    'Catálogo de insumos:',
    catalogo || '(sin insumos)',
  ].join('\n');
};

export interface LineaLeida {
  texto: string;
  cantidad_texto: string | null;
  supply_id: number | null;
  equivalente: string | null;
  posibles: number[];
  cantidad_base: number | null;
  total: number | null;
  costo_base: number | null;
  costo_antes: number | null;
}

export interface CompraLeida {
  proveedor: string | null;
  tipo_documento: 'factura' | 'boleta' | 'guia' | 'pedido' | 'otro';
  numero: string | null;
  fecha: string | null;
  con_iva: boolean;
  lineas: LineaLeida[];
}

/** Lo que escribió la IA, como texto (un objeto no se vuelve texto). */
const txt = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';

const positivo = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** El costo por unidad base: total ÷ cantidad, con dos decimales. */
export const costoPorUnidad = (
  total: number | null,
  cantidadBase: number | null,
): number | null =>
  total && cantidadBase ? Math.round((total / cantidadBase) * 100) / 100 : null;

/**
 * Lo que escribió la IA → la propuesta. Descarta un insumo que no es de la
 * empresa, aplica lo aprendido (una línea con el mismo texto del mismo
 * proveedor ya se asoció antes: manda eso) y calcula el costo.
 */
export const propuestaDeLaCompra = (
  salida: unknown,
  insumos: InsumoParaLeer[],
  equivalentes: EquivalenteParaLeer[],
  supplierId: number | null,
): CompraLeida | null => {
  const s = (salida ?? {}) as Record<string, unknown>;
  if (s.es_compra !== true) return null;
  const porId = new Map(insumos.map((i) => [i.id, i]));
  const aprendido = new Map<string, number>();
  // Primero los sin proveedor, después los del proveedor: el del proveedor
  // pisa.
  for (const e of [...equivalentes].sort(
    (a, b) => Number(a.supplier_id !== null) - Number(b.supplier_id !== null),
  )) {
    if (e.supplier_id !== null && e.supplier_id !== supplierId) continue;
    aprendido.set(e.nombre_normal, e.supply_id);
  }
  const lineas = (Array.isArray(s.lineas) ? s.lineas : [])
    .map((l): LineaLeida | null => {
      const x = (l ?? {}) as Record<string, unknown>;
      const texto = txt(x.texto).trim();
      if (!texto) return null;
      const delaIA = Number(x.insumo_id);
      let supplyId = porId.has(delaIA) ? delaIA : null;
      // Cuando la IA duda, igual SUGIERE el más probable (Felipe, 23-11:
      // "primero debería sugerirme uno"): queda puesto, sin check y con
      // los otros posibles a la vista hasta que la persona lo confirme.
      const posibles = (Array.isArray(x.posibles) ? x.posibles : [])
        .map(Number)
        .filter((id, i, a) => porId.has(id) && a.indexOf(id) === i)
        .slice(0, 3);
      if (!supplyId && posibles.length) supplyId = posibles[0];
      const yaVisto = aprendido.get(normalizar(texto));
      if (yaVisto !== undefined && porId.has(yaVisto)) supplyId = yaVisto;
      const cantidadBase = positivo(x.cantidad_base);
      const total = positivo(x.total);
      const insumo = supplyId ? porId.get(supplyId) : undefined;
      return {
        texto: texto.slice(0, 300),
        cantidad_texto: x.cantidad_texto
          ? txt(x.cantidad_texto).slice(0, 80)
          : null,
        supply_id: supplyId,
        // El corte o la marca se guarda aunque falte el insumo: al elegirlo,
        // la pantalla pregunta si es un equivalente (doc 25 D14).
        equivalente: x.equivalente ? txt(x.equivalente).slice(0, 80) : null,
        // Con posibles, el insumo es una sugerencia por confirmar.
        posibles:
          porId.has(delaIA) || (yaVisto !== undefined && porId.has(yaVisto))
            ? []
            : posibles,
        cantidad_base: cantidadBase,
        total: total !== null ? Math.round(total) : null,
        costo_base: supplyId ? costoPorUnidad(total, cantidadBase) : null,
        costo_antes: insumo ? Number(insumo.price) || 0 : null,
      };
    })
    .filter((l): l is LineaLeida => l !== null)
    .slice(0, 200);
  const tipo = txt(s.tipo_documento);
  const fecha = txt(s.fecha);
  return {
    proveedor: s.proveedor ? txt(s.proveedor).slice(0, 200) : null,
    tipo_documento: (['factura', 'boleta', 'guia', 'pedido'].includes(tipo)
      ? tipo
      : 'otro') as CompraLeida['tipo_documento'],
    numero: s.numero ? txt(s.numero).slice(0, 40) : null,
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null,
    con_iva: s.totales_netos !== true,
    lineas,
  };
};

/**
 * El proveedor del documento entre los de la empresa: el que tenga el mismo
 * nombre normalizado, o uno que contenga al otro (mínimo 4 letras).
 */
export const proveedorDe = (
  texto: string | null,
  proveedores: { id: number; name: string }[],
): number | null => {
  const t = normalizar(texto ?? '');
  if (t.length < 4) return null;
  const exacto = proveedores.find((p) => normalizar(p.name) === t);
  if (exacto) return exacto.id;
  const parecido = proveedores.find((p) => {
    const n = normalizar(p.name);
    return n.length >= 4 && (t.includes(n) || n.includes(t));
  });
  return parecido?.id ?? null;
};

/** Sube más de este % → la fila sale en ámbar y parte sin check. */
export const SALTO_GRANDE = 20;

export const variacion = (
  antes: number | null,
  nuevo: number | null,
): number | null =>
  antes && nuevo ? Math.round(((nuevo - antes) / antes) * 100) : null;
