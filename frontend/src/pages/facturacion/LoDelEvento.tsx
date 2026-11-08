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

/** El monto que se tolera de redondeo (como `estadoDeLaFacturacion`). */
const REDONDEO = 1;

/**
 * LA BARRA DE LO FACTURADO (doc 19 §9.34; Felipe, 08-11: *"acá sería
 * interesante tener el monto en valores del evento, quizás una barrita de
 * lo que ya está facturado (ejemplo Rudel debo meter una OC de adelanto de
 * 4M) y el resto queda pendiente"*). Verde lo ya facturado (neto de notas
 * de crédito, la cuenta del motor), azul lo de este documento y gris lo que
 * queda. Si con este documento se pasa del total del evento, lo dice en
 * ámbar.
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
  return (
    <div className="space-y-1 pb-1">
      <p className="text-gray-700">
        Evento <span className="font-semibold">{clp(total)}</span>
      </p>
      <div
        className="flex h-2 overflow-hidden rounded-full bg-gray-200"
        aria-hidden="true"
      >
        <div className="bg-green-600" style={{ width: ancho(facturado) }} />
        <div className="bg-blue-500" style={{ width: ancho(esta) }} />
      </div>
      <p className="text-gray-600">
        <span className="text-green-700">Facturado {clp(facturado)}</span>
        {esta > 0 && (
          <>
            {" · "}
            <span className="text-blue-700">
              {nombre} {clp(esta)}
            </span>
          </>
        )}
        {" · "}Queda {clp(queda)}
      </p>
      {pasa > 0 && (
        <p className="font-medium text-amber-800">
          Con {nombre.toLowerCase()} se pasa del evento por {clp(pasa)}
        </p>
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
}: {
  readonly evento: EventoPorFacturar;
  /** Lo que BelIA no pudo leer en la primera lectura de «Por facturar». */
  readonly noLeidas: readonly OcSinLeer[];
  /** La revisión del motor del documento que se revisa, si ya está. */
  readonly vista: VistaPrevia | null;
  /** El tipo del documento que se revisa (factura o boleta). */
  readonly tipo?: TipoDeDte | null;
}) {
  const ordenes = evento.ordenes ?? [];
  const sinLeer = evento.ocs_sin_leer ?? 0;
  const fallas = noLeidas.filter((n) => n.quotation_id === evento.id);
  const avisos = vista?.avisos ?? [];
  const problemas = vista?.problemas ?? [];
  const faltan = vista?.faltan ?? [];
  const esta = vista?.montos?.total ?? 0;
  const seVaDelEvento = evento.emitido + esta - evento.total > REDONDEO;
  const hayQueMirar =
    fallas.length > 0 ||
    !!evento.tiene_factura_en_documentos ||
    problemas.length > 0 ||
    faltan.length > 0 ||
    seVaDelEvento;
  return (
    <div
      className={`space-y-0.5 rounded-lg border px-3 py-2 text-xs ${hayQueMirar ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50"}`}
    >
      <p
        className={`font-semibold ${hayQueMirar ? "text-amber-900" : "text-gray-700"}`}
      >
        Lo del evento
      </p>
      <BarraDeLoFacturado
        total={evento.total}
        facturado={evento.emitido}
        esta={esta}
        nombre={NOMBRE_DE_ESTA[tipo ?? 33]}
      />
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
