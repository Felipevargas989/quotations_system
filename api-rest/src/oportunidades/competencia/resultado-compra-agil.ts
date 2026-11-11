import { criteriosDeEvaluacion } from '../analisis/criterios-de-evaluacion';
import type { Adjudicacion } from '../historia/ganadores';
import { ganadoresDe, normalizarRut } from '../historia/ganadores';

// EL RESULTADO DE LO POSTULADO (decisión 92 del doc 17, 27-10). Felipe
// perdió la del catamarán (1346350-37-COT26) y Eventia no le avisó.
// Felipe: "para comparar siempre ocupa el criterio (1) de cómo te evalúan".
// Hay dos caminos: en una licitación mandan los criterios de las bases; en
// una compra ágil manda la ley (decisión 93): gana el menor precio, y si
// eligen otra cotización tienen que justificarlo.
// Lo público (a quién eligieron y las ofertas) es igual para cualquier
// empresa y va en mp_cambios, por código; ganada o perdida, el lugar y lo
// que ofertó cada empresa se calcula con su RUT al leerlo.

type Oferente = { rut: string; proveedor: string | null; monto: number | null };

/** Terminó sin adjudicar (decisión 124): desierta, o revocada (en una
 *  compra ágil, «cancelada»). Una suspendida puede volver: no cuenta. */
export type SinAdjudicar = 'desierta' | 'revocada';

/** A quién eligió el comprador (o a quiénes adjudicó) y las ofertas, con
 *  su total. Desde la decisión 124, si terminó sin adjudicar, `elegidos`
 *  va vacío y `sin_adjudicar` dice cómo. */
export type ResultadoPublico = {
  tipo: 'compra_agil' | 'licitacion';
  elegidos: Oferente[];
  ofertas: Array<Oferente & { inadmisible: string | null }>;
  sin_adjudicar?: SinAdjudicar | null;
};

/** Lo de una empresa: lo que ve en «Mis licitaciones». */
export type ResultadoDeLaEmpresa = {
  tipo: ResultadoPublico['tipo'];
  estado: 'ganada' | 'perdida';
  /** A quién eligió el comprador; si ganó la empresa, ella misma. */
  proveedor: string | null;
  rut_proveedor: string | null;
  /** Su total, con impuestos. */
  monto: number | null;
  /** A cuántos más adjudicaron (una licitación puede ir por línea). */
  mas_elegidos: number;
  /** El total que ofertó la empresa; null si su oferta no aparece. */
  mi_monto: number | null;
  /** Solo en una compra ágil: el lugar de la empresa al ordenar por
   *  precio, como manda la ley. */
  lugar: number | null;
  /** Cuántas ofertas se compararon. */
  ofertas: number;
  /** Compra ágil: tenía el menor precio y eligieron a otro. */
  era_la_mas_barata: boolean;
  /** Por qué el comprador dejó fuera la oferta de la empresa. */
  inadmisible: string | null;
  /** Decisión 124: quedó perdida porque terminó sin adjudicar. */
  sin_adjudicar?: SinAdjudicar | null;
};

const texto = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/** Decisión 124 (10-11). Felipe, con la 1532886-5-LE26 del Día del
 *  Funcionario, que salió desierta y siguió «postulada»: "igual debió
 *  marcarla cuando salió desierta". Desierta o revocada (en una compra
 *  ágil, cancelada) es perdida; la suspendida puede volver. El estado de una
 *  compra ágil viene como objeto (`codigo`, `glosa`) y el de una licitación
 *  como texto. */
export const sinAdjudicarDe = (estado: unknown): SinAdjudicar | null => {
  const e =
    typeof estado === 'string'
      ? estado
      : estado && typeof estado === 'object'
        ? [
            (estado as Record<string, unknown>).codigo,
            (estado as Record<string, unknown>).glosa,
          ]
            .filter((x): x is string => typeof x === 'string')
            .join(' ')
        : '';
  if (/suspend/i.test(e)) return null;
  if (/desiert/i.test(e)) return 'desierta';
  if (/revocad|cancelad/i.test(e)) return 'revocada';
  return null;
};

/** Compra ágil, medido el 27-10 con el detalle oficial (API v2, con el
 *  ticket del radar): mientras está «Cerrada», `proveedores_cotizando`
 *  viene vacío; con «Proveedor seleccionado» trae todas las ofertas, con su
 *  total y quién quedó elegido. `id_orden_compra` es un número interno, no
 *  el código de la orden. null mientras no eligen. */
export const resultadoPublicoDeCompraAgil = (
  detalle: unknown,
): ResultadoPublico | null => {
  const d = detalle as {
    proveedores_cotizando?: unknown;
    estado?: unknown;
  } | null;
  const lista = Array.isArray(d?.proveedores_cotizando)
    ? d.proveedores_cotizando
    : [];
  const sinAdjudicar = sinAdjudicarDe(d?.estado);
  if (!Array.isArray(d?.proveedores_cotizando) && !sinAdjudicar) return null;
  const ofertas: ResultadoPublico['ofertas'] = [];
  const elegidos: Oferente[] = [];
  for (const x of lista as unknown[]) {
    if (!x || typeof x !== 'object') continue;
    const f = x as Record<string, unknown>;
    const rut = texto(f.rut_proveedor);
    if (!rut) continue;
    const oferente = {
      rut,
      proveedor: texto(f.razon_social),
      monto:
        typeof f.monto_total === 'number' && Number.isFinite(f.monto_total)
          ? f.monto_total
          : null,
    };
    ofertas.push({
      ...oferente,
      inadmisible: texto(f.justificacion_inadmisibilidad),
    });
    if (f.proveedor_seleccionado === 1 || f.proveedor_seleccionado === true) {
      elegidos.push(oferente);
    }
  }
  if (elegidos.length > 0) return { tipo: 'compra_agil', elegidos, ofertas };
  // Decisión 124: desierta o cancelada, con las ofertas (y por qué dejaron
  // fuera cada una).
  return sinAdjudicar
    ? {
        tipo: 'compra_agil',
        elegidos: [],
        ofertas,
        sin_adjudicar: sinAdjudicar,
      }
    : null;
};

/** Licitación: a quiénes adjudicaron, según la adjudicación que el radar
 *  guarda en `mp_procesos` (decisión 30: las seguidas y, desde la 92, las
 *  postuladas se revisan una vez al día). Del que se llevó más al que se
 *  llevó menos. Desde la decisión 124, desierta o revocada: sin elegidos y
 *  con `sin_adjudicar`. Suspendida o sin ganadores con RUT: null. */
export const resultadoPublicoDeLicitacion = (proceso: {
  estado: string | null;
  adjudicacion: unknown;
}): ResultadoPublico | null => {
  const sinAdjudicar = sinAdjudicarDe(proceso.estado);
  if (sinAdjudicar) {
    return {
      tipo: 'licitacion',
      elegidos: [],
      ofertas: [],
      sin_adjudicar: sinAdjudicar,
    };
  }
  if (/suspend/i.test(proceso.estado ?? '')) return null;
  const elegidos = ganadoresDe(proceso.adjudicacion as Adjudicacion)
    .filter((g): g is typeof g & { rut: string } => Boolean(g.rut))
    .sort((a, b) => (b.monto ?? 0) - (a.monto ?? 0))
    .map((g) => ({ rut: g.rut, proveedor: g.nombre || null, monto: g.monto }));
  return elegidos.length > 0
    ? { tipo: 'licitacion', elegidos, ofertas: [] }
    : null;
};

/** Ganada si eligieron (o adjudicaron) a la empresa; si no, perdida. En
 *  una compra ágil con el criterio de la ley, además, su oferta ordenada
 *  por precio entre las admisibles: desde la decisión 95 la solicitud
 *  puede traer sus propios criterios (los del análisis, `criterios`), y
 *  entonces no se compara solo por precio (decisión 97). null sin el RUT
 *  de la empresa o si lo guardado no tiene a quién eligieron. */
export const resultadoParaLaEmpresa = (
  publico: ResultadoPublico | null | undefined,
  rutDeLaEmpresa: string | null | undefined,
  criterios?: Array<{ nombre: string }> | null,
): ResultadoDeLaEmpresa | null => {
  if (!publico || !rutDeLaEmpresa) return null;
  const rut = normalizarRut(rutDeLaEmpresa);
  const esDeLaEmpresa = (o: Oferente) => normalizarRut(o.rut) === rut;
  // Decisión 124: terminó sin adjudicar, perdida para la empresa, con lo
  // suyo si su oferta aparece (y por qué la dejaron fuera).
  if (publico.sin_adjudicar && !publico.elegidos?.length) {
    const suya = (publico.ofertas ?? []).find(esDeLaEmpresa) ?? null;
    return {
      tipo: publico.tipo,
      estado: 'perdida',
      proveedor: null,
      rut_proveedor: null,
      monto: null,
      mas_elegidos: 0,
      mi_monto: suya?.monto ?? null,
      lugar: null,
      ofertas: (publico.ofertas ?? []).length,
      era_la_mas_barata: false,
      inadmisible: suya?.inadmisible ?? null,
      sin_adjudicar: publico.sin_adjudicar,
    };
  }
  if (!publico.elegidos?.length) return null;
  const ganada = publico.elegidos.some(esDeLaEmpresa);
  const mostrado =
    (ganada
      ? publico.elegidos.find(esDeLaEmpresa)
      : publico.elegidos.find((o) => !esDeLaEmpresa(o))) ?? publico.elegidos[0];
  const ofertas = publico.ofertas ?? [];
  const mia = ofertas.find(esDeLaEmpresa) ?? null;
  const comparables = ofertas.filter(
    (o): o is Oferente & { monto: number; inadmisible: null } =>
      o.monto !== null && !o.inadmisible,
  );
  const porPrecio =
    publico.tipo === 'compra_agil' &&
    criteriosDeEvaluacion(criterios, 'compra_agil').every(
      (c) => (c as { de_la_ley?: boolean }).de_la_ley === true,
    );
  const miMonto = mia && !mia.inadmisible ? mia.monto : null;
  return {
    tipo: publico.tipo,
    estado: ganada ? 'ganada' : 'perdida',
    proveedor: mostrado.proveedor,
    rut_proveedor: mostrado.rut,
    monto: mostrado.monto,
    mas_elegidos: publico.elegidos.length - 1,
    mi_monto: mia?.monto ?? (ganada ? mostrado.monto : null),
    lugar:
      porPrecio && miMonto !== null
        ? 1 + comparables.filter((o) => o.monto < miMonto).length
        : null,
    ofertas: comparables.length,
    era_la_mas_barata:
      porPrecio &&
      !ganada &&
      miMonto !== null &&
      comparables.every((o) => esDeLaEmpresa(o) || o.monto > miMonto),
    inadmisible: mia?.inadmisible ?? null,
  };
};

/** Compra ágil: las dos cosas de una vez, desde el detalle. */
export const resultadoDeCompraAgil = (
  detalle: unknown,
  rutDeLaEmpresa: string | null | undefined,
): ResultadoDeLaEmpresa | null =>
  resultadoParaLaEmpresa(resultadoPublicoDeCompraAgil(detalle), rutDeLaEmpresa);
