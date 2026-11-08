import {
  armarBorradorDeDte,
  prepararDte,
  type BorradorDelDte,
  type DtePedido,
  type PreparacionDelDte,
  type TipoDeDte,
  type VistaPrevia,
} from "../../services/facturas.service";

// LO QUE LA REVISIÓN DE «FACTURAR SELECCIONADOS» SABE DE CADA EVENTO (doc
// 19 §9.21 y §9.31): lo mismo que «Emitir DTE» al abrirse. BelIA lee las
// OC de Documentos, propone factura o boleta, y el DTE se llena desde la
// OC que queda por facturar o desde la cotización. Desde el 08-11 (§9.31)
// se revisa uno por uno y lo que no está listo se arregla con «Corregir»
// antes de aprobarlo.

export interface RevisadoParaLaMasiva {
  tipo: TipoDeDte;
  pedida: DtePedido;
  vista: VistaPrevia;
  /** §9.32: lo que leyó BelIA (sus OC, el evento) y su borrador, para que
   *  «Corregir» parta de ahí sin pedírselo de nuevo. */
  preparacion?: PreparacionDelDte;
  borrador?: BorradorDelDte;
}

/**
 * El documento de un evento. Con `ocId`, el de esa OC (Felipe, 08-11:
 * *"una factura por cada OC"*, como Santo Tomás con sus tres); sin ella, el
 * de la primera OC con saldo o el de la cotización. `preparar` deja que las
 * facturas de un mismo evento compartan una sola lectura de BelIA.
 */
export const revisarUnoParaLaMasiva = async (
  quotationId: string,
  ocId: number | null = null,
  preparar: (id: string) => Promise<PreparacionDelDte> = prepararDte,
): Promise<RevisadoParaLaMasiva> => {
  const preparacion = await preparar(quotationId);
  const pedida =
    ocId != null && preparacion.ocs.some((o) => o.id === ocId) ? ocId : null;
  const oc =
    preparacion.tipo === 33
      ? (pedida ??
        preparacion.ocs.find((o) => o.facturado < o.total)?.id ??
        null)
      : null;
  const borrador = await armarBorradorDeDte(quotationId, preparacion.tipo, oc);
  return {
    tipo: preparacion.tipo,
    pedida: borrador.pedida,
    vista: borrador.vista,
    preparacion,
    borrador,
  };
};

/** Lo que le falta para emitirse, en palabras: «Falta el giro», o el
 *  primer problema. */
export const loQueLeFalta = (vista: VistaPrevia): string | null =>
  vista.ok
    ? null
    : vista.faltan.length
      ? `Falta ${vista.faltan.map((f) => f.texto).join(", ")}`
      : (vista.problemas[0] ?? "No está listo");
