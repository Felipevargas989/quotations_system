import { AlertTriangle, CalendarDays, FileText } from "lucide-react";
import type { ReactNode } from "react";
import type {
  EventoPorFacturar,
  OcSinLeer,
  OrdenPorFacturar,
  TipoDeDte,
  VistaPrevia,
} from "../../services/facturas.service";

// LO DEL EVENTO (doc 19 §9.31; Felipe, 08-11: *"me parece extensa la
// cantidad de información por línea, el nro de OC está dos veces, quizás el
// resto de la información debería ser un recuadro que aparezca solo en el
// modal"*). Lo que antes iba bajo el cliente en «Por facturar» —sus OC con
// su estado, las que BelIA no ha leído y por qué no pudo, y el PDF de una
// factura subido a mano— va en este recuadro, arriba del documento que se
// revisa, con lo que dice el motor: sus avisos, lo que falta y lo que no
// cuadra.
//
// Felipe, 08-11: *"ese cuadro ámbar, podría ser un cuadro azul más bonito"*
// (con la maqueta: *"me parece bien el recuadro"*). Siempre azul: el total
// del evento grande arriba, la barra y los tres montos en columnas, y lo
// que hay que mirar en su propia franja ámbar (roja si no cuadra); las OC y
// los avisos, abajo y en chico.

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const pct = (n: number) =>
  `${String(Math.round(n * 10) / 10).replace(".", ",")} %`;

/** «OC 4500123 · $10.000.000 · facturada», una por línea; la de la
 *  factura que se revisa dice «esta factura». */
export function LineaDeOc({
  oc,
  actual = false,
}: {
  readonly oc: OrdenPorFacturar;
  readonly actual?: boolean;
}) {
  const estado =
    oc.estado === "facturado"
      ? "facturada"
      : oc.estado === "parcial"
        ? `${pct((oc.facturado / oc.total) * 100)} facturado`
        : "pendiente";
  return (
    <span className="flex items-center gap-1.5 text-xs text-gray-600">
      <FileText
        size={13}
        className="shrink-0 text-gray-400"
        aria-hidden="true"
      />
      <span>
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
        {actual && (
          <span className="font-semibold text-blue-700"> · esta factura</span>
        )}
      </span>
    </span>
  );
}

/** Lo que hay que mirar, en su franja dentro del recuadro azul. */
function Franja({
  tono = "ambar",
  children,
}: {
  readonly tono?: "ambar" | "rojo";
  readonly children: ReactNode;
}) {
  return (
    <p
      className={`flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 font-medium ${tono === "rojo" ? "bg-red-50 text-red-700" : "bg-amber-100 text-amber-900"}`}
    >
      <AlertTriangle size={14} className="mt-px shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** El monto que se tolera de redondeo (como `estadoDeLaFacturacion`). */
const REDONDEO = 1;

/**
 * LA BARRA DE LO FACTURADO (doc 19 §9.34; Felipe, 08-11: *"acá sería
 * interesante tener el monto en valores del evento, quizás una barrita de
 * lo que ya está facturado (ejemplo Rudel debo meter una OC de adelanto de
 * 4M) y el resto queda pendiente"*). Verde lo ya facturado (neto de notas
 * de crédito, la cuenta del motor), azul lo de este documento y blanco lo
 * que queda, con los tres montos en columnas, siempre en el mismo lugar.
 * Si con este documento se pasa del total del evento, lo dice en ámbar.
 */
export function BarraDeLoFacturado({
  total,
  facturado,
  esta,
  nombre,
}: {
  readonly total: number;
  readonly facturado: number;
  /** Lo de este documento, con IVA; 0 si todavía no está. */
  readonly esta: number;
  /** «Esta factura» o «Esta boleta». */
  readonly nombre: string;
}) {
  const conEsta = facturado + esta;
  const queda = Math.max(0, total - conEsta);
  const pasa = conEsta - total > REDONDEO ? conEsta - total : 0;
  const escala = Math.max(total, conEsta) || 1;
  const ancho = (n: number) => `${(n / escala) * 100}%`;
  const montos = [
    {
      etiqueta: "Facturado",
      valor: clp(facturado),
      punto: "bg-green-500",
      clase: "text-gray-900",
    },
    {
      etiqueta: nombre,
      valor: esta > 0 ? clp(esta) : "—",
      punto: "bg-blue-600",
      clase: "text-blue-700",
    },
    {
      etiqueta: "Queda",
      valor: clp(queda),
      punto: "bg-white ring-1 ring-gray-300",
      clase: "text-gray-900",
    },
  ];
  return (
    <div className="space-y-2">
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-white ring-1 ring-inset ring-blue-100"
        aria-hidden="true"
      >
        <div className="bg-green-500" style={{ width: ancho(facturado) }} />
        <div className="bg-blue-600" style={{ width: ancho(esta) }} />
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {montos.map((m) => (
          <div key={m.etiqueta}>
            <dt className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${m.punto}`}
                aria-hidden="true"
              />
              {m.etiqueta}
            </dt>
            <dd className={`text-sm font-semibold tabular-nums ${m.clase}`}>
              {m.valor}
            </dd>
          </div>
        ))}
      </dl>
      {pasa > 0 && (
        <Franja>
          Con {nombre.toLowerCase()} se pasa del evento por {clp(pasa)}
        </Franja>
      )}
    </div>
  );
}

const NOMBRE_DE_ESTA = { 33: "Esta factura", 39: "Esta boleta" } as const;

export default function LoDelEvento({
  evento,
  noLeidas,
  vista,
  tipo,
  ocActual = null,
  enEstaRevision = 0,
}: {
  readonly evento: EventoPorFacturar;
  /** Lo que BelIA no pudo leer en la primera lectura de «Por facturar». */
  readonly noLeidas: readonly OcSinLeer[];
  /** La revisión del motor del documento que se revisa, si ya está. */
  readonly vista: VistaPrevia | null;
  /** El tipo del documento que se revisa (factura o boleta). */
  readonly tipo?: TipoDeDte | null;
  /** La OC de la factura que se revisa, cuando el evento va en una
   *  factura por OC. */
  readonly ocActual?: number | null;
  /** Lo de las facturas anteriores de este evento en la misma revisión:
   *  la barra lo cuenta como facturado. */
  readonly enEstaRevision?: number;
}) {
  const ordenes = evento.ordenes ?? [];
  const sinLeer = evento.ocs_sin_leer ?? 0;
  const fallas = noLeidas.filter((n) => n.quotation_id === evento.id);
  const avisos = vista?.avisos ?? [];
  const problemas = vista?.problemas ?? [];
  const faltan = vista?.faltan ?? [];
  const abajo = ordenes.length > 0 || sinLeer > 0 || avisos.length > 0;
  return (
    <div className="space-y-2.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-blue-900">
          <CalendarDays
            size={15}
            className="shrink-0 text-blue-600"
            aria-hidden="true"
          />
          Lo del evento
        </p>
        <p className="text-blue-800">
          Evento{" "}
          <span className="text-lg font-semibold tabular-nums text-blue-900">
            {clp(evento.total)}
          </span>
        </p>
      </div>
      <BarraDeLoFacturado
        total={evento.total}
        facturado={evento.emitido + enEstaRevision}
        esta={vista?.montos?.total ?? 0}
        nombre={NOMBRE_DE_ESTA[tipo ?? 33]}
      />
      {fallas.map((f) => (
        <Franja key={f.documento_id}>
          BelIA no pudo leer «{f.nombre}»: {f.motivo.replace(/\.$/, "")}
        </Franja>
      ))}
      {evento.tiene_factura_en_documentos && (
        <Franja>Tiene factura en Documentos</Franja>
      )}
      {problemas.map((p) => (
        <Franja key={p} tono="rojo">
          {p}
        </Franja>
      ))}
      {faltan.length > 0 && (
        <Franja>
          Falta {faltan.map((f) => f.texto).join(", ")}: corrígelo antes de
          aprobar
        </Franja>
      )}
      {abajo && (
        <div className="space-y-0.5 border-t border-blue-100 pt-2">
          {ordenes.map((o) => (
            <LineaDeOc key={o.id} oc={o} actual={o.id === ocActual} />
          ))}
          {sinLeer > 0 && (
            <p className="text-gray-600">
              {sinLeer === 1 ? "1 OC sin leer" : `${sinLeer} OC sin leer`}
            </p>
          )}
          {avisos.map((a) => (
            <p key={a} className="text-gray-600">
              • {a}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
