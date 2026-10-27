import { normalizarRut } from '../historia/ganadores';

// EL RESULTADO DE UNA COMPRA ÁGIL POSTULADA (decisión 92 del doc 17, 27-10).
// Felipe perdió la del catamarán (1346350-37-COT26) y Eventia no le avisó.
// Medido ese día con el detalle oficial (API v2, con el ticket del radar):
// mientras está «Cerrada», `proveedores_cotizando` viene vacío; con
// «Proveedor seleccionado» trae todas las ofertas, con su total y quién
// quedó elegido. `id_orden_compra` es un número interno, no el código de la
// orden: no sirve para leer su ficha.
// Felipe: "para comparar siempre ocupa el criterio (1) de cómo te evalúan".
// En una compra ágil ese criterio es la ley (decisión 93): gana el menor
// precio, y si eligen otra cotización tienen que justificarlo.
// Lo público (a quién eligieron y todas las ofertas) es igual para cualquier
// empresa y va en mp_cambios, por código; ganada o perdida, el lugar y lo
// que cotizó cada empresa se calcula con su RUT al leerlo.

type Oferente = { rut: string; proveedor: string | null; monto: number | null };

/** A quién eligió el comprador y todas las ofertas, con su total. */
export type ResultadoPublico = {
  tipo: 'compra_agil';
  elegidos: Oferente[];
  ofertas: Array<Oferente & { inadmisible: string | null }>;
};

/** Lo de una empresa: lo que ve en «Mis licitaciones». */
export type ResultadoDeCompraAgil = {
  estado: 'ganada' | 'perdida';
  /** A quién eligió el comprador. */
  proveedor: string | null;
  rut_proveedor: string | null;
  /** Su total, con impuestos. */
  monto: number | null;
  /** El total que cotizó la empresa; null si su oferta no aparece. */
  mi_monto: number | null;
  /** El lugar de la empresa al ordenar por precio, como manda la ley. */
  lugar: number | null;
  /** Cuántas ofertas se compararon. */
  ofertas: number;
  /** Tenía el menor precio y eligieron a otro. */
  era_la_mas_barata: boolean;
  /** Por qué el comprador dejó fuera la oferta de la empresa. */
  inadmisible: string | null;
};

const texto = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/** Lo público, cuando el comprador ya eligió; null mientras no. */
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

/** Ganada si eligieron a la empresa; si no, perdida. Además, su oferta
 *  ordenada por precio entre las admisibles. null sin el RUT de la empresa
 *  o si lo guardado no tiene a quién eligieron. */
export const resultadoParaLaEmpresa = (
  publico: ResultadoPublico | null | undefined,
  rutDeLaEmpresa: string | null | undefined,
): ResultadoDeCompraAgil | null => {
  const elegido = publico?.elegidos?.[0];
  if (!publico || !elegido || !rutDeLaEmpresa) return null;
  const rut = normalizarRut(rutDeLaEmpresa);
  const esDeLaEmpresa = (o: Oferente) => normalizarRut(o.rut) === rut;
  const mia = (publico.ofertas ?? []).find(esDeLaEmpresa) ?? null;
  const comparables = (publico.ofertas ?? []).filter(
    (o): o is Oferente & { monto: number; inadmisible: null } =>
      o.monto !== null && !o.inadmisible,
  );
  const miMonto = mia && !mia.inadmisible ? mia.monto : null;
  const ganada = publico.elegidos.some(esDeLaEmpresa);
  return {
    estado: ganada ? 'ganada' : 'perdida',
    proveedor: elegido.proveedor,
    rut_proveedor: elegido.rut,
    monto: elegido.monto,
    mi_monto: mia?.monto ?? null,
    lugar:
      miMonto === null
        ? null
        : 1 + comparables.filter((o) => o.monto < miMonto).length,
    ofertas: comparables.length,
    era_la_mas_barata:
      !ganada &&
      miMonto !== null &&
      comparables.every((o) => esDeLaEmpresa(o) || o.monto > miMonto),
    inadmisible: mia?.inadmisible ?? null,
  };
};

/** Las dos cosas de una vez, desde el detalle de Mercado Público. */
export const resultadoDeCompraAgil = (
  detalle: unknown,
  rutDeLaEmpresa: string | null | undefined,
): ResultadoDeCompraAgil | null =>
  resultadoParaLaEmpresa(resultadoPublicoDeCompraAgil(detalle), rutDeLaEmpresa);
