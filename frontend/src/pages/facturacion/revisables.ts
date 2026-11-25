import type {
  EventoPorFacturar,
  FacturaAprobada,
} from "../../services/facturas.service";

// LO QUE SE REVISA EN «FACTURAR SELECCIONADOS» (doc 19 §9.31): un documento
// por evento, o uno por OC con saldo (Felipe, 08-11: *"una factura por cada
// OC"*). Vive aparte desde el §9.48 porque «Por facturar» usa las mismas
// claves para decir cuáles ya están aprobadas y guardadas.

/** Lo que se revisa: un documento por evento, uno por OC con saldo o, si
 *  la OC va en una factura por línea (§9.59, CCU), uno por línea. */
export interface Revisable {
  readonly clave: string;
  readonly evento: EventoPorFacturar;
  /** La OC de esta factura, si el evento va en una por OC. */
  readonly ocId: number | null;
  readonly ocNumero: string | null;
  /** §9.59: la línea de la OC (desde 0), si va en una factura por línea. */
  readonly linea: number | null;
}

export const claveDe = (
  quotationId: string,
  ocId: number | null,
  linea: number | null = null,
) =>
  ocId == null
    ? quotationId
    : linea == null
      ? `${quotationId}:${ocId}`
      : `${quotationId}:${ocId}:${linea}`;

/** «línea 10»: como la numera la OC (de 10 en 10, como SAP). */
export const nombreDeLaLinea = (linea: number) => `línea ${(linea + 1) * 10}`;

export const revisablesDe = (
  eventos: readonly EventoPorFacturar[],
): Revisable[] =>
  eventos.flatMap((e): Revisable[] => {
    const conSaldo = (e.ordenes ?? []).filter((o) => o.queda > 1);
    // §9.59: la OC que va en una factura por línea, una por cada línea que
    // falta; las demás, una por OC.
    const facturas = conSaldo.flatMap((o) =>
      o.lineas_por_facturar?.length
        ? o.lineas_por_facturar.map((linea) => ({ o, linea }))
        : [{ o, linea: null as number | null }],
    );
    return facturas.length > 1
      ? facturas.map(({ o, linea }) => ({
          clave: claveDe(e.id, o.id, linea),
          evento: e,
          ocId: o.id,
          ocNumero: o.numero,
          linea,
        }))
      : [{ clave: e.id, evento: e, ocId: null, ocNumero: null, linea: null }];
  });

/** Las aprobadas guardadas (§9.48), por la clave de lo que se revisa. */
export const porClave = (
  aprobadas: readonly FacturaAprobada[],
): Map<string, FacturaAprobada> =>
  new Map(
    aprobadas.map((a) => [
      claveDe(a.quotation_id, a.oc_id, a.linea_de_la_oc ?? null),
      a,
    ]),
  );

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
