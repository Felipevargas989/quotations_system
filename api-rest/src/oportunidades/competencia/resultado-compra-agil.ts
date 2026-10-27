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

type Oferta = {
  rut: string;
  rut_escrito: string;
  nombre: string | null;
  monto: number | null;
  elegida: boolean;
  inadmisible: string | null;
};

const texto = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

const ofertasDelDetalle = (detalle: unknown): Oferta[] => {
  const lista = (detalle as { proveedores_cotizando?: unknown } | null)
    ?.proveedores_cotizando;
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((x): Oferta[] => {
    if (!x || typeof x !== 'object') return [];
    const f = x as Record<string, unknown>;
    const rutEscrito = texto(f.rut_proveedor);
    if (!rutEscrito) return [];
    const monto =
      typeof f.monto_total === 'number' && Number.isFinite(f.monto_total)
        ? f.monto_total
        : null;
    return [
      {
        rut: normalizarRut(rutEscrito),
        rut_escrito: rutEscrito,
        nombre: texto(f.razon_social),
        monto,
        elegida:
          f.proveedor_seleccionado === 1 || f.proveedor_seleccionado === true,
        inadmisible: texto(f.justificacion_inadmisibilidad),
      },
    ];
  });
};

/** Con quién quedó elegido, la oferta de la empresa ordenada por precio
 *  entre las admisibles. null mientras no hay elegido, o sin el RUT de la
 *  empresa. */
export const resultadoDeCompraAgil = (
  detalle: unknown,
  rutDeLaEmpresa: string | null | undefined,
): ResultadoDeCompraAgil | null => {
  if (!rutDeLaEmpresa) return null;
  const ofertas = ofertasDelDetalle(detalle);
  const elegida = ofertas.find((o) => o.elegida);
  if (!elegida) return null;
  const rut = normalizarRut(rutDeLaEmpresa);
  const mia = ofertas.find((o) => o.rut === rut) ?? null;
  const comparables = ofertas.filter(
    (o): o is Oferta & { monto: number } => o.monto !== null && !o.inadmisible,
  );
  const miMonto = mia && !mia.inadmisible ? mia.monto : null;
  const ganada = elegida.rut === rut;
  return {
    estado: ganada ? 'ganada' : 'perdida',
    proveedor: elegida.nombre,
    rut_proveedor: elegida.rut_escrito,
    monto: elegida.monto,
    mi_monto: mia?.monto ?? null,
    lugar:
      miMonto === null
        ? null
        : 1 + comparables.filter((o) => o.monto < miMonto).length,
    ofertas: comparables.length,
    era_la_mas_barata:
      !ganada &&
      miMonto !== null &&
      comparables.every((o) => o.rut === rut || o.monto > miMonto),
    inadmisible: mia?.inadmisible ?? null,
  };
};
