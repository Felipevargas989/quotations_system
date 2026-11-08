import type {
  EventoPorFacturar,
  OcSinLeer,
  OrdenPorFacturar,
  VistaPrevia,
} from "../../services/facturas.service";

// LO DEL EVENTO (doc 19 §9.31; Felipe, 08-11: *"me parece extensa la
// cantidad de información por línea, el nro de OC está dos veces, quizás el
// resto de la información debería ser un recuadro que aparezca solo en el
// modal"*). Lo que antes iba bajo el cliente en «Por facturar» —sus OC con
// su estado, las que BelIA no ha leído y por qué no pudo, y el PDF de una
// factura subido a mano— va en este recuadro, arriba del documento que se
// revisa, con lo que dice el motor: sus avisos, lo que falta y lo que no
// cuadra. Gris si solo informa; ámbar si hay algo que mirar.

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const pct = (n: number) =>
  `${String(Math.round(n * 10) / 10).replace(".", ",")} %`;

/** «OC 4500123 · $10.000.000 · facturada», una por línea. */
export function LineaDeOc({ oc }: { readonly oc: OrdenPorFacturar }) {
  const estado =
    oc.estado === "facturado"
      ? "facturada"
      : oc.estado === "parcial"
        ? `${pct((oc.facturado / oc.total) * 100)} facturado`
        : "pendiente";
  return (
    <span className="block text-xs text-gray-600">
      OC {oc.numero} · {clp(oc.total)} ·{" "}
      <span
        className={
          oc.estado === "facturado"
            ? "text-green-700"
            : oc.estado === "parcial"
              ? "text-amber-700"
              : ""
        }
      >
        {estado}
      </span>
    </span>
  );
}

export default function LoDelEvento({
  evento,
  noLeidas,
  vista,
}: {
  readonly evento: EventoPorFacturar;
  /** Lo que BelIA no pudo leer en la primera lectura de «Por facturar». */
  readonly noLeidas: readonly OcSinLeer[];
  /** La revisión del motor del documento que se revisa, si ya está. */
  readonly vista: VistaPrevia | null;
}) {
  const ordenes = evento.ordenes ?? [];
  const sinLeer = evento.ocs_sin_leer ?? 0;
  const fallas = noLeidas.filter((n) => n.quotation_id === evento.id);
  const avisos = vista?.avisos ?? [];
  const problemas = vista?.problemas ?? [];
  const faltan = vista?.faltan ?? [];
  const hayQueMirar =
    fallas.length > 0 ||
    !!evento.tiene_factura_en_documentos ||
    problemas.length > 0 ||
    faltan.length > 0;
  if (!ordenes.length && !sinLeer && !avisos.length && !hayQueMirar)
    return null;
  return (
    <div
      className={`space-y-0.5 rounded-lg border px-3 py-2 text-xs ${hayQueMirar ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50"}`}
    >
      <p
        className={`font-semibold ${hayQueMirar ? "text-amber-900" : "text-gray-700"}`}
      >
        Lo del evento
      </p>
      {ordenes.map((o) => (
        <LineaDeOc key={o.id} oc={o} />
      ))}
      {sinLeer > 0 && (
        <p className="text-gray-600">
          {sinLeer === 1 ? "1 OC sin leer" : `${sinLeer} OC sin leer`}
        </p>
      )}
      {fallas.map((f) => (
        <p key={f.documento_id} className="text-amber-800">
          BelIA no pudo leer «{f.nombre}»: {f.motivo.replace(/\.$/, "")}
        </p>
      ))}
      {evento.tiene_factura_en_documentos && (
        <p className="font-medium text-amber-800">
          Tiene factura en Documentos
        </p>
      )}
      {avisos.map((a) => (
        <p key={a} className="text-gray-600">
          • {a}
        </p>
      ))}
      {problemas.map((p) => (
        <p key={p} className="text-red-600">
          • {p}
        </p>
      ))}
      {faltan.length > 0 && (
        <p className="font-semibold text-amber-800">
          Falta {faltan.map((f) => f.texto).join(", ")}: corrígelo antes de
          aprobar
        </p>
      )}
    </div>
  );
}
