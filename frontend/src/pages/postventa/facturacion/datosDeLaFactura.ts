import { useEffect, useState } from "react";
import type { LineaPedida, Receptor } from "../../../services/facturas.service";

// LO QUE COMPARTEN LAS PIEZAS DEL DTE (doc 19 §9.20 y §9.32): la factura de
// «Nuevo DTE» y «Corregir» de la revisión (`CorregirDte`), sus líneas
// (`LineasDelDte`) y los datos del receptor (`CamposDelReceptor`).

export const OTRA = "otra";
// Un solo alto en todo el DTE (Felipe, 05-11: «los altos no son los
// mismos»): el py-2 de las piezas de la casa (el RUT, el campo numérico y
// el desplegable), y arriba el título de cada casilla.
export const claseCasilla =
  "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent";
export const claseTitulo = "flex justify-between text-xs text-gray-500";

/** Una línea escrita a mano: descripción y precio libres. */
export const lineaAMano = (): LineaPedida => ({
  descripcion: "",
  descripcion_larga: null,
  cantidad: 1,
  precio: 0,
});

/** Una línea del tarifario, todavía sin elegir (doc 19 §9.23): su nombre
 *  y su precio llegan al elegir el ítem. */
export const lineaDelTarifario = (): LineaPedida => ({
  ...lineaAMano(),
  tarifario_id: null,
});

export const RECEPTOR_VACIO: Receptor = {
  rut: "",
  razon_social: "",
  giro: null,
  direccion: null,
  comuna: null,
  ciudad: null,
  correo: null,
};

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
