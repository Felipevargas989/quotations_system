import {
  armarBorradorDeDte,
  prepararDte,
  type DtePedido,
  type TipoDeDte,
  type VistaPrevia,
} from "../../services/facturas.service";

// LO QUE LA FACTURACIÓN MASIVA SABE DE CADA EVENTO (doc 19 §9.21): lo
// mismo que «Emitir DTE» al abrirse. BelIA lee las OC de Documentos,
// propone factura o boleta, y el DTE se llena desde la OC que queda por
// facturar o desde la cotización. No se corrige nada a mano: lo que no
// está listo se factura uno por uno.

export interface RevisadoParaLaMasiva {
  tipo: TipoDeDte;
  pedida: DtePedido;
  vista: VistaPrevia;
}

export const revisarUnoParaLaMasiva = async (
  quotationId: string,
): Promise<RevisadoParaLaMasiva> => {
  const preparacion = await prepararDte(quotationId);
  const oc =
    preparacion.tipo === 33
      ? (preparacion.ocs.find((o) => o.facturado < o.total)?.id ?? null)
      : null;
  const borrador = await armarBorradorDeDte(quotationId, preparacion.tipo, oc);
  return {
    tipo: preparacion.tipo,
    pedida: borrador.pedida,
    vista: borrador.vista,
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
