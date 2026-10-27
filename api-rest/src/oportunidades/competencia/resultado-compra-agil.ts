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

/** A quién eligió el comprador (o a quiénes adjudicó) y las ofertas, con
 *  su total. */
export type ResultadoPublico = {
  tipo: 'compra_agil' | 'licitacion';
  elegidos: Oferente[];
  ofertas: Array<Oferente & { inadmisible: string | null }>;
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
};

const texto = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/** Compra ágil, medido el 27-10 con el detalle oficial (API v2, con el
 *  ticket del radar): mientras está «Cerrada», `proveedores_cotizando`
 *  viene vacío; con «Proveedor seleccionado» trae todas las ofertas, con su
 *  total y quién quedó elegido. `id_orden_compra` es un número interno, no
 *  el código de la orden. null mientras no eligen. */
export const resultadoPublicoDeCompraAgil = (
  detalle: unknown,
): ResultadoPublico | null => {
  const lista = (detalle as { proveedores_cotizando?: unknown } | null)
    ?.proveedores_cotizando;
  if (!Array.isArray(lista)) return null;
  const ofertas: ResultadoPublico['ofertas'] = [];
  const elegidos: Oferente[] = [];
  for (const x of lista) {
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
  return elegidos.length > 0
    ? { tipo: 'compra_agil', elegidos, ofertas }
    : null;
};

/** Licitación: a quiénes adjudicaron, según la adjudicación que el radar
 *  guarda en `mp_procesos` (decisión 30: las seguidas y, desde la 92, las
 *  postuladas se revisan una vez al día). Del que se llevó más al que se
 *  llevó menos. Desierta, revocada o sin ganadores con RUT: null. */
export const resultadoPublicoDeLicitacion = (proceso: {
  estado: string | null;
  adjudicacion: unknown;
}): ResultadoPublico | null => {
  if (/desiert|revocad|suspend/i.test(proceso.estado ?? '')) return null;
  const elegidos = ganadoresDe(proceso.adjudicacion as Adjudicacion)
    .filter((g): g is typeof g & { rut: string } => Boolean(g.rut))
    .sort((a, b) => (b.monto ?? 0) - (a.monto ?? 0))
    .map((g) => ({ rut: g.rut, proveedor: g.nombre || null, monto: g.monto }));
  return elegidos.length > 0
    ? { tipo: 'licitacion', elegidos, ofertas: [] }
    : null;
};

/** Ganada si eligieron (o adjudicaron) a la empresa; si no, perdida. En
 *  una compra ágil, además, su oferta ordenada por precio entre las
 *  admisibles. null sin el RUT de la empresa o si lo guardado no tiene a
 *  quién eligieron. */
export const resultadoParaLaEmpresa = (
  publico: ResultadoPublico | null | undefined,
  rutDeLaEmpresa: string | null | undefined,
): ResultadoDeLaEmpresa | null => {
  if (!publico || !rutDeLaEmpresa || !publico.elegidos?.length) return null;
  const rut = normalizarRut(rutDeLaEmpresa);
  const esDeLaEmpresa = (o: Oferente) => normalizarRut(o.rut) === rut;
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
  const porPrecio = publico.tipo === 'compra_agil';
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
