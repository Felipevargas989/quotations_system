import type { DocumentoDeLaLista } from "../../services/documentosTributarios.service";
import { nombreDelMedio } from "../../constants/facturacion";
import { fechaCorta } from "../../utils/ordenesDeCompra";

/**
 * CÓMO SE VE CADA FILA DE «DOCUMENTOS» (doc 19 §9.22, §9.41 y §9.42): el
 * color y la línea del estado, la línea de abajo del documento, el nombre
 * de su PDF y la barra roja que une un documento con sus notas. Salió de
 * `ListaDeDocumentos` el 09-11, cuando la lista pasó las 800 líneas.
 */

export const esNota = (d: DocumentoDeLaLista) => d.tipo === 56 || d.tipo === 61;

type ParaOrdenar = Pick<
  DocumentoDeLaLista,
  "id" | "tipo" | "folio" | "fecha_emision"
>;

/** EL ORDEN DE LA LISTA, POR NÚMERO (§9.44; Felipe, 09-11: *"ordénalo por
 *  número, es más intuitivo"*; por la fecha de emisión, la Factura 388
 *  fechada el 30-11 quedaba arriba de la 389). Cada tipo va del N° más alto
 *  al más bajo, y entre una factura y una boleta, la que salió después: la
 *  marca de cada documento es el más nuevo de su tipo con un N° igual o
 *  menor, así un número nunca salta a otro, aunque su fecha sea otra o se
 *  haya traído después (la 374, traída el 08-11, queda bajo la 381). Lo
 *  que no tiene N° o fecha, lo que espera «Comprobar», va primero. */
export const porNumero = <T extends ParaOrdenar>(docs: T[]): T[] => {
  const sinNumero = (d: T) => d.folio == null || d.fecha_emision == null;
  const porTipo = new Map<number, T[]>();
  for (const d of docs)
    if (!sinNumero(d)) porTipo.set(d.tipo, [...(porTipo.get(d.tipo) ?? []), d]);
  const marca = new Map<number, number>();
  for (const delTipo of porTipo.values()) {
    let masNuevo = 0;
    delTipo.sort((a, b) => (a.folio ?? 0) - (b.folio ?? 0) || a.id - b.id);
    for (const d of delTipo) {
      masNuevo = Math.max(masNuevo, d.id);
      marca.set(d.id, masNuevo);
    }
  }
  return [...docs].sort(
    (a, b) =>
      Number(sinNumero(b)) - Number(sinNumero(a)) ||
      (marca.get(b.id) ?? 0) - (marca.get(a.id) ?? 0) ||
      (b.folio ?? 0) - (a.folio ?? 0) ||
      b.id - a.id,
  );
};

/** La nota que anula otra nota (la ND que anula la NC): no cobra nada
 *  nuevo, deshace la otra, y las dos se cancelan. Va tachada como la que
 *  anula, y la que vale es la factura (§9.42; Felipe, 09-11: *"pareciera
 *  que hay dos montos pendientes"*, y *"vamos con la segunda"*). La NC que
 *  anula una factura no entra: lo que modifica no es una nota. */
export const cancelaOtraNota = (
  d: DocumentoDeLaLista,
  modifica: DocumentoDeLaLista | undefined,
) =>
  esNota(d) &&
  d.situacion !== "anulada" &&
  !!modifica &&
  esNota(modifica) &&
  modifica.situacion === "anulada";

/** El color del estado, como la maqueta: lo vigente en verde (también la
 *  nota en pie y la factura corregida, que valen enteras). */
export const colorDelEstado = (d: DocumentoDeLaLista) =>
  d.situacion === "por_confirmar" || d.situacion === "rebajada"
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : d.situacion === "anulada"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-green-200 bg-green-50 text-green-700";

/** «Crédito 30 días · vence 06-12» o «Contado»: la factura (§9.22). Con
 *  su medio de pago (§9.43): «Contado · Débito», y la boleta, «Efectivo». */
export const condicionDePago = (d: DocumentoDeLaLista) => {
  const medio = nombreDelMedio(d.medio_de_pago);
  if (d.tipo === 39) return medio;
  if (d.tipo !== 33 || d.forma_de_pago == null) return null;
  if (d.forma_de_pago === 1 || !d.vencimiento)
    return medio ? `Contado · ${medio}` : "Contado";
  return `Crédito ${d.plazo_dias ?? ""} días · vence ${fechaCorta(d.vencimiento).slice(0, 5)}`;
};

/** «F383_Municipalidad de Quillón_460_1213301-49-AG26.pdf» (§9.35; un
 *  motor de antes manda solo «NC 88», o ni eso, y se corta del título). */
export const nombreDelArchivo = (d: DocumentoDeLaLista) =>
  d.nombre_del_pdf ?? d.nombre ?? d.titulo.split(" · ")[0];

/** Abajo del estado, en letra chica (§9.22, 07-11): lo que lo cambió («Se
 *  rebajaron $1.000», «Por NC 88») con el vencimiento de la factura que
 *  sigue por cobrar; sin cambios, su condición de pago. */
export const lineaDelEstado = (d: DocumentoDeLaLista) => {
  if (d.estado !== "emitido") return null;
  if (d.situacion === "anulada") return d.cadena.detalle;
  // §9.42 (Felipe, 09-11: *"eliminar el −1000 del chip rebajada"*): lo
  // rebajado ya se ve en los montos; abajo, la condición de pago.
  if (!d.cadena.detalle || (d.situacion === "rebajada" && d.queda))
    return condicionDePago(d);
  const vence = d.vencimiento
    ? `vence ${fechaCorta(d.vencimiento).slice(0, 5)}`
    : null;
  return [d.cadena.detalle, vence].filter(Boolean).join(" · ");
};

/** La línea de abajo del documento: la fecha, lo que hace la nota («rebaja
 *  la 1235»), la OC (o la referencia que lleve), el N° del evento y la
 *  factura anulada que reemplaza. */
export const subtitulo = (d: DocumentoDeLaLista) => {
  const ref = d.referencia
    ? `${d.referencia.tipo === "801" ? "OC" : d.referencia.tipo} ${d.referencia.folio}`
    : d.oc
      ? `OC ${d.oc}`
      : null;
  // La nota va debajo de su factura, que ya dice la OC y el evento: ella
  // dice solo lo que hace, para caber en su línea (07-11).
  const nota = esNota(d) && !!d.que_hace;
  return [
    d.fecha_emision ? fechaCorta(d.fecha_emision) : "sin fecha",
    d.que_hace,
    nota ? null : ref,
    !nota && d.numero ? `N° ${d.numero}` : null,
    d.reemplaza ? `reemplaza a la ${d.reemplaza}` : null,
    // §9.36: emitida fuera de Eventia y traída de facturacion.cl.
    d.traida ? "traída de facturacion.cl" : null,
  ]
    .filter(Boolean)
    .join(" · ");
};

/** La barra roja que une un documento con sus notas (08-11, la opción B;
 *  §9.42, 09-11: *"la línea del lado debería ser continua"*): una franja
 *  por dentro de la primera celda, que no corre el texto. En las notas sube
 *  un píxel y tapa la raya entre filas, para que no se corte. */
export const BARRA_DEL_GRUPO =
  "relative before:absolute before:bottom-0 before:left-0 before:w-1 before:bg-red-300";
export const BARRA_ARRIBA = "before:top-0";
export const BARRA_SEGUIDA = "before:-top-px";
