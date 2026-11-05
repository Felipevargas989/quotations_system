import { nombreDeReferencia } from "../../../constants/facturacion";
import type {
  FacturaPedida,
  VistaPrevia,
} from "../../../services/facturas.service";
import { fechaCorta } from "../../../utils/ordenesDeCompra";
import { formatearRut } from "../../../utils/rut";

// LA FACTURA TAL COMO SALDRÁ (doc 19 §9.10; maqueta del 04-11): el emisor,
// el N° que sigue, el receptor, el detalle, las referencias, la observación
// y los totales. facturacion.cl no tiene vista previa (L6): esta se arma en
// Eventia con la misma revisión que emite, así que lo que se ve es lo que
// sale.

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

export default function VistaPreviaDeFactura({
  vista,
  pedida,
  puedeEmitir,
  emitiendo,
  onVolver,
  onEmitir,
}: {
  readonly vista: VistaPrevia;
  readonly pedida: FacturaPedida;
  readonly puedeEmitir: boolean;
  readonly emitiendo: boolean;
  readonly onVolver: () => void;
  readonly onEmitir: () => void;
}) {
  const r = pedida.receptor;
  const simulado = vista.ambiente === "simulado";
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gray-300 bg-white p-4 text-sm space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-gray-900">
              {vista.emisor.nombre ?? "La empresa"}
            </p>
            {vista.emisor.rut && (
              <p className="text-xs text-gray-500">
                R.U.T. {formatearRut(vista.emisor.rut)}
              </p>
            )}
          </div>
          <div className="rounded border-2 border-red-600 px-3 py-1 text-center text-red-700">
            <p className="text-xs font-semibold">Factura electrónica</p>
            <p className="text-sm font-bold">
              N° {vista.folio}{" "}
              <span className="font-normal">(el siguiente)</span>
            </p>
          </div>
        </div>

        <div className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          <p>
            <span className="text-gray-500">Señor(es): </span>
            {r.razon_social || "—"}
          </p>
          <p>
            <span className="text-gray-500">Fecha: </span>
            {fechaCorta(vista.fecha)}
          </p>
          <p>
            <span className="text-gray-500">R.U.T.: </span>
            {r.rut ? formatearRut(r.rut) : "—"}
          </p>
          <p>
            <span className="text-gray-500">Giro: </span>
            {r.giro || "—"}
          </p>
          <p>
            <span className="text-gray-500">Dirección: </span>
            {r.direccion || "—"}
          </p>
          <p>
            <span className="text-gray-500">Comuna: </span>
            {r.comuna || "—"}
            {r.ciudad ? ` · ${r.ciudad}` : ""}
          </p>
        </div>

        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-1 text-left font-medium">Detalle</th>
              <th className="py-1 text-right font-medium">Cant.</th>
              <th className="py-1 text-right font-medium">Neto</th>
            </tr>
          </thead>
          <tbody>
            {vista.lineas.map((l, i) => (
              <tr key={i} className="align-top">
                <td className="py-1 pr-2">
                  {l.descripcion}
                  {l.descripcionLarga && (
                    <p className="text-gray-500">{l.descripcionLarga}</p>
                  )}
                </td>
                <td className="py-1 text-right">{l.cantidad}</td>
                <td className="py-1 text-right">{clp(l.precio)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {pedida.referencias.length > 0 && (
          <div className="text-xs">
            <p className="text-gray-500">Referencias</p>
            {pedida.referencias.map((ref) => (
              <p key={ref.tipo}>
                {ref.tipo} · {nombreDeReferencia(ref.tipo)} · {ref.folio || "—"}
                {ref.fecha ? ` · ${fechaCorta(ref.fecha)}` : ""}
              </p>
            ))}
          </div>
        )}

        <div className="flex items-end justify-between gap-3">
          <p className="text-xs text-gray-500">
            {vista.observaciones.join(" · ")}
          </p>
          {vista.montos && (
            <dl className="grid grid-cols-2 gap-x-3 text-xs">
              <dt className="text-gray-500">Neto</dt>
              <dd className="text-right">{clp(vista.montos.neto)}</dd>
              <dt className="text-gray-500">IVA 19 %</dt>
              <dd className="text-right">{clp(vista.montos.iva)}</dd>
              <dt className="font-semibold">Total</dt>
              <dd className="text-right font-semibold">
                {clp(vista.montos.total)}
              </dd>
            </dl>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Emitida no se borra: un error se anula con nota de crédito.
        {r.correo && !simulado ? ` facturacion.cl la manda a ${r.correo}.` : ""}
      </p>
      {simulado && (
        <p className="text-xs text-amber-700">
          Simulada: facturacion.cl todavía no está conectado y no sale nada al
          SII.
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onVolver}
          className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg font-semibold hover:bg-gray-200"
        >
          Volver
        </button>
        {puedeEmitir ? (
          <button
            type="button"
            disabled={!vista.ok || emitiendo}
            onClick={onEmitir}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {emitiendo ? "Emitiendo…" : "Emitir factura"}
          </button>
        ) : (
          <span className="text-xs text-gray-500">
            La emite el administrador.
          </span>
        )}
      </div>
    </div>
  );
}
