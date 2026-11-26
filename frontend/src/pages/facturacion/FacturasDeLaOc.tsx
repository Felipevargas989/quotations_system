import type { OrdenPorFacturar } from "../../services/facturas.service";

// LAS FACTURAS DE LA OC, UNA POR FILA (doc 19 §9.60; Felipe, 25-11-2026, con
// las 4 facturas de la OC de Transportes CCU, al ver las dos barras de «Lo
// del evento»: *"si pidele opciones de graficos porfaovr para ver como lo
// podemos ver"*; de las tres maquetas eligió esta: *"me tinca la C"*). En vez
// de las barras de la OC y del evento, la OC con cada una de sus facturas:
// lo ya emitido en verde, la que se revisa en azul, las armadas en ámbar,
// las aprobadas en verde claro, y lo que no tiene factura en gris. La OC y
// la línea salen del subtítulo: ya se ven acá.

export type EstadoDeLaFila = "esta" | "aprobada" | "armada" | "por_revisar";

export interface FilaDeLaOc {
  readonly clave: string;
  /** «Línea 10» o «Factura». */
  readonly etiqueta: string;
  /** El N° de la nota de pedido (802), si ya lo tiene. */
  readonly nota: string | null;
  /** Con IVA; nulo mientras BelIA la arma. */
  readonly monto: number | null;
  readonly estado: EstadoDeLaFila;
}

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

const CHIP: Record<
  EstadoDeLaFila | "emitida" | "sin_factura",
  { texto: string; clase: string }
> = {
  esta: { texto: "Revisando", clase: "bg-blue-600 text-white" },
  aprobada: { texto: "Aprobada", clase: "bg-emerald-100 text-emerald-800" },
  armada: { texto: "Armada", clase: "bg-amber-100 text-amber-900" },
  por_revisar: { texto: "Por revisar", clase: "bg-gray-100 text-gray-600" },
  emitida: { texto: "Emitida", clase: "bg-green-600 text-white" },
  sin_factura: { texto: "Sin factura", clase: "bg-gray-100 text-gray-600" },
};

/** El monto que se tolera de redondeo (como `estadoDeLaFacturacion`). */
const REDONDEO = 1;

function Fila({
  etiqueta,
  nota,
  monto,
  chip,
  resaltada = false,
}: {
  readonly etiqueta: string;
  readonly nota: string | null;
  readonly monto: string;
  readonly chip: keyof typeof CHIP;
  readonly resaltada?: boolean;
}) {
  return (
    <li
      className={`grid grid-cols-[6rem_minmax(0,1fr)_7.5rem_6.5rem] items-center gap-2 rounded-lg px-2.5 py-1.5 ${resaltada ? "bg-blue-100 text-blue-900" : "bg-white text-gray-800"}`}
    >
      <span className="font-semibold">{etiqueta}</span>
      <span className="truncate text-gray-500">{nota ? `NP ${nota}` : ""}</span>
      <span className="text-right font-semibold tabular-nums">{monto}</span>
      <span className="text-right">
        <span
          className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHIP[chip].clase}`}
        >
          {CHIP[chip].texto}
        </span>
      </span>
    </li>
  );
}

export default function FacturasDeLaOc({
  oc,
  filas,
}: {
  readonly oc: OrdenPorFacturar;
  /** Las facturas de esta OC en la revisión, en orden. */
  readonly filas: readonly FilaDeLaOc[];
}) {
  const enLaRevision = filas.reduce((s, f) => s + (f.monto ?? 0), 0);
  const sinFactura = oc.total - oc.facturado - enLaRevision;
  return (
    <div className="space-y-1.5">
      <p className="flex items-baseline justify-between gap-3 text-blue-800">
        <span className="font-semibold">OC {oc.numero}</span>
        <span className="text-base font-semibold tabular-nums text-blue-900">
          {clp(oc.total)}
        </span>
      </p>
      <ul className="space-y-1">
        {oc.facturado > REDONDEO && (
          <Fila
            etiqueta="Ya emitido"
            nota={null}
            monto={clp(oc.facturado)}
            chip="emitida"
          />
        )}
        {filas.map((f) => (
          <Fila
            key={f.clave}
            etiqueta={f.etiqueta}
            nota={f.nota}
            monto={f.monto != null ? clp(f.monto) : "…"}
            chip={f.estado}
            resaltada={f.estado === "esta"}
          />
        ))}
        {sinFactura > REDONDEO && (
          <Fila
            etiqueta="Sin factura"
            nota={null}
            monto={clp(sinFactura)}
            chip="sin_factura"
          />
        )}
      </ul>
    </div>
  );
}
