import { normalizarRut } from '../historia/ganadores';
import {
  CODIGO_DE_ORDEN,
  type OrdenDeCompra,
} from '../oferente/orden-de-compra';

// EL RESULTADO DE UNA COMPRA ÁGIL POSTULADA (decisión 92 del doc 17, 27-10).
// Felipe perdió la del catamarán (1346350-37-COT26) y Eventia no le avisó:
// las compras ágiles no tienen acta ni dicen quién cotizó, y la de noche
// solo miraba una vez al día. Lo que sí trae su detalle, al resolverse, es
// la orden de compra; su ficha pública dice a quién se le compró y por
// cuánto. Con el RUT de la empresa se sabe si se ganó o se perdió.

export type ResultadoDeCompraAgil = {
  estado: 'ganada' | 'perdida';
  orden_de_compra: string;
  /** La razón social de a quién se le compró. */
  proveedor: string | null;
  rut_proveedor: string | null;
  /** El total de la orden, con impuestos. */
  monto: number | null;
  /** AAAA-MM-DD, la fecha de la orden. */
  fecha: string | null;
};

/** El número de la orden de compra que trae el detalle, si ya la hay y
 *  tiene forma de número de orden. */
export const ordenDelDetalle = (detalle: unknown): string | null => {
  const v = (detalle as { id_orden_compra?: unknown } | null)?.id_orden_compra;
  const codigo =
    typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  return codigo && CODIGO_DE_ORDEN.test(codigo) ? codigo : null;
};

/** Ganada si la orden es para la empresa; si es para otro, perdida. Sin el
 *  RUT de la orden o el de la empresa no se puede saber: null. */
export const resultadoDeLaOrden = (
  orden: OrdenDeCompra,
  rutDeLaEmpresa: string | null | undefined,
): ResultadoDeCompraAgil | null => {
  if (!orden.rut_proveedor || !rutDeLaEmpresa) return null;
  const nuestra =
    normalizarRut(orden.rut_proveedor) === normalizarRut(rutDeLaEmpresa);
  return {
    estado: nuestra ? 'ganada' : 'perdida',
    orden_de_compra: orden.numero,
    proveedor: orden.proveedor,
    rut_proveedor: orden.rut_proveedor,
    monto: orden.monto,
    fecha: orden.fecha,
  };
};
