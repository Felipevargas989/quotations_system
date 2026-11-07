import { useEffect, useState } from "react";
import { LARGO_MAXIMO } from "../../../constants/facturacion";
import type { Receptor } from "../../../services/facturas.service";

// LO QUE COMPARTEN EL DTE QUE ARMA BELIA (`EmitirDte`), SUS LÍNEAS
// (`LineasDelDte`) Y «EDITAR RECEPTOR Y REFERENCIAS» (`EditarReceptor`): el
// DTE del evento (doc 19 §9.20).

export const OTRA = "otra";
// Un solo alto en todo el DTE (Felipe, 05-11: «los altos no son los
// mismos»): el py-2 de las piezas de la casa (el RUT, el campo numérico y
// el desplegable), y arriba el título de cada casilla.
export const claseCasilla =
  "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent";
export const claseTitulo = "flex justify-between text-xs text-gray-500";

export const RECEPTOR_VACIO: Receptor = {
  rut: "",
  razon_social: "",
  giro: null,
  direccion: null,
  comuna: null,
  ciudad: null,
  correo: null,
};

// Lo que el SII exige del receptor en la factura (doc 19 §9.13).
export const DEL_RECEPTOR = [
  { campo: "giro", nombre: "Giro", largo: LARGO_MAXIMO.giro },
  { campo: "direccion", nombre: "Dirección", largo: LARGO_MAXIMO.direccion },
  { campo: "comuna", nombre: "Comuna", largo: LARGO_MAXIMO.comuna },
] as const;

/** Una línea al peso, con su descuento (doc 19 §9.22), como la cuenta el
 *  motor (`valorDeLaLinea`): cantidad por precio, menos su %. Sirve para
 *  el precio con IVA de la pantalla y para el neto de la vista previa. */
export const valorDeLaLinea = (l: {
  cantidad: number;
  precio: number;
  descuento?: number | null;
}): number =>
  Math.round(l.cantidad * l.precio) -
  (l.descuento ? Math.round((l.cantidad * l.precio * l.descuento) / 100) : 0);

/** El valor, cuando la persona deja de escribir: la vista previa se pide
 *  una vez y no en cada tecla. */
export function useQuieto<T>(valor: T, ms = 400): T {
  const [quieto, setQuieto] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setQuieto(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return quieto;
}
