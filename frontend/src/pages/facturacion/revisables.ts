import type {
  EventoPorFacturar,
  FacturaAprobada,
} from "../../services/facturas.service";

// LO QUE SE REVISA EN «FACTURAR SELECCIONADOS» (doc 19 §9.31): un documento
// por evento, o uno por OC con saldo (Felipe, 08-11: *"una factura por cada
// OC"*). Vive aparte desde el §9.48 porque «Por facturar» usa las mismas
// claves para decir cuáles ya están aprobadas y guardadas.

/** Lo que se revisa: un documento por evento, o uno por OC con saldo. */
export interface Revisable {
  readonly clave: string;
  readonly evento: EventoPorFacturar;
  /** La OC de esta factura, si el evento va en una por OC. */
  readonly ocId: number | null;
  readonly ocNumero: string | null;
}

export const claveDe = (quotationId: string, ocId: number | null) =>
  ocId == null ? quotationId : `${quotationId}:${ocId}`;

export const revisablesDe = (
  eventos: readonly EventoPorFacturar[],
): Revisable[] =>
  eventos.flatMap((e): Revisable[] => {
    const conSaldo = (e.ordenes ?? []).filter((o) => o.queda > 1);
    return conSaldo.length > 1
      ? conSaldo.map((o) => ({
          clave: claveDe(e.id, o.id),
          evento: e,
          ocId: o.id,
          ocNumero: o.numero,
        }))
      : [{ clave: e.id, evento: e, ocId: null, ocNumero: null }];
  });

/** Las aprobadas guardadas (§9.48), por la clave de lo que se revisa. */
export const porClave = (
  aprobadas: readonly FacturaAprobada[],
): Map<string, FacturaAprobada> =>
  new Map(aprobadas.map((a) => [claveDe(a.quotation_id, a.oc_id), a]));

/** Las aprobadas de un evento que siguen valiendo: las de lo que hoy se
 *  revisaría de él (si cambiaron sus OC, la vieja no cuenta). */
export const aprobadasDe = (
  evento: EventoPorFacturar,
  guardadas: ReadonlyMap<string, FacturaAprobada>,
): { aprobadas: FacturaAprobada[]; de: number } => {
  const suyas = revisablesDe([evento]);
  return {
    aprobadas: suyas.flatMap((r) => {
      const a = guardadas.get(r.clave);
      return a ? [a] : [];
    }),
    de: suyas.length,
  };
};
