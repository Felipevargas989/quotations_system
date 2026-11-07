import { useState } from "react";
import ConfirmInline from "../../../components/ConfirmInline";
import { nombreDeReferencia } from "../../../constants/facturacion";
import type {
  DtePedido,
  VistaPrevia,
} from "../../../services/facturas.service";
import { fechaCorta } from "../../../utils/ordenesDeCompra";
import { formatearRut } from "../../../utils/rut";
import { valorDeLaLinea } from "./datosDeLaFactura";

// EL DTE TAL COMO SALDRÁ (doc 19 §9.10 y §9.20; maqueta del 04-11): el
// emisor, el N° que sigue, el receptor, el detalle, las referencias, la
// observación y los totales. facturacion.cl no tiene vista previa (L6):
// esta se arma en Eventia con la misma revisión que emite, así que lo que
// se ve es lo que sale. La factura lleva sus líneas en neto; la boleta, con
// IVA, y su N° lo pone facturacion.cl.
//
// Desde el 06-11 (doc 19 §9.22, sprint 3) es la misma para los cuatro
// documentos de «Nuevo documento»: la factura, la boleta y las notas de
// crédito y de débito (con lo que modifican en `referencia`). Y como la
// maqueta, «Emitir» pregunta antes («¿Emitir la factura N° … por $…?»):
// emitido no se borra.

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

const TITULO: Record<number, string> = {
  33: "Factura electrónica",
  39: "Boleta electrónica",
  56: "Nota de débito electrónica",
  61: "Nota de crédito electrónica",
};
const NOMBRE: Record<number, string> = {
  33: "factura",
  39: "boleta",
  56: "nota de débito",
  61: "nota de crédito",
};

export default function VistaPreviaDelDte({
  vista,
  pedida,
  referencia = null,
  puedeEmitir,
  emitiendo,
  onVolver,
  onEmitir,
}: {
  readonly vista: VistaPrevia;
  /** La factura y la boleta (33 y 39) y las notas (61 y 56). */
  readonly pedida: Pick<DtePedido, "receptor" | "referencias"> & {
    tipo: number;
  };
  /** La nota: lo que modifica, como va en ella («Anula la factura N° …»). */
  readonly referencia?: string | null;
  readonly puedeEmitir: boolean;
  readonly emitiendo: boolean;
  readonly onVolver: () => void;
  readonly onEmitir: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const r = pedida.receptor;
  const factura = pedida.tipo === 33;
  const boleta = pedida.tipo === 39;
  const nombre = NOMBRE[pedida.tipo] ?? "documento";
  // La columna del descuento solo si alguna línea lo lleva (§9.22).
  const conDescuento = vista.lineas.some((l) => !!l.descuento);
  const simulado = vista.ambiente === "simulado";
  const prueba = vista.ambiente === "prueba";
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
            <p className="text-xs font-semibold">
              {TITULO[pedida.tipo] ?? "Documento electrónico"}
            </p>
            <p className="text-sm font-bold">
              N° {vista.folio}{" "}
              <span className="font-normal">(el siguiente)</span>
            </p>
          </div>
        </div>

        {!boleta ? (
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
            {factura && vista.pago && (
              <p className="sm:col-span-2">
                <span className="text-gray-500">Condición de pago: </span>
                {vista.pago.forma === 1 || !vista.pago.vencimiento
                  ? "Contado"
                  : `Crédito a ${vista.pago.dias} días · vence el ${fechaCorta(vista.pago.vencimiento)}`}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs">
            <span className="text-gray-500">Fecha: </span>
            {fechaCorta(vista.fecha)}
          </p>
        )}

        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-1 text-left font-medium">Detalle</th>
              <th className="w-14 py-1 pl-3 text-right font-medium">Cant.</th>
              <th className="w-28 py-1 pl-3 text-right font-medium">
                {boleta ? "Precio" : "Precio neto"}
              </th>
              {conDescuento && (
                <th className="w-16 py-1 pl-3 text-right font-medium">Desc.</th>
              )}
              <th className="w-28 py-1 pl-3 text-right font-medium">
                {boleta ? "Total" : "Neto"}
              </th>
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
                <td className="py-1 pl-3 text-right whitespace-nowrap">
                  {l.cantidad.toLocaleString("es-CL")}
                </td>
                <td className="py-1 pl-3 text-right whitespace-nowrap">
                  {/* El neto unitario lleva decimales: se muestran dos. */}
                  {`$${l.precio.toLocaleString("es-CL", { maximumFractionDigits: 2 })}`}
                </td>
                {conDescuento && (
                  <td className="py-1 pl-3 text-right whitespace-nowrap">
                    {l.descuento
                      ? `${l.descuento.toLocaleString("es-CL")} %`
                      : ""}
                  </td>
                )}
                <td className="py-1 pl-3 text-right whitespace-nowrap">
                  {clp(valorDeLaLinea(l))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {referencia && (
          <div className="text-xs">
            <p className="text-gray-500">Referencia</p>
            <p>{referencia}</p>
          </div>
        )}

        {factura && pedida.referencias.length > 0 && (
          <div className="text-xs">
            <p className="text-gray-500">Referencias</p>
            {pedida.referencias.map((ref, i) => (
              <p key={i}>
                {ref.tipo} · {nombreDeReferencia(ref.tipo)} · {ref.folio || "—"}
                {ref.fecha ? ` · ${fechaCorta(ref.fecha)}` : ""}
                {ref.razon ? ` · ${ref.razon}` : ""}
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
              {/* Una nota no se paga: dice lo que anula, rebaja o suma. */}
              <dt className="font-semibold">
                {factura || boleta ? "Total a pagar" : "Total"}
              </dt>
              <dd className="text-right font-semibold">
                {clp(vista.montos.total)}
              </dd>
            </dl>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500">
        {factura
          ? "Emitida no se borra: un error se anula con nota de crédito."
          : boleta
            ? "Emitida no se borra."
            : "Emitida no se borra: una nota se anula con otra nota."}
        {r.correo && vista.ambiente === "produccion"
          ? ` facturacion.cl la manda a ${r.correo}.`
          : ""}
      </p>
      {simulado && (
        <p className="text-xs text-amber-700">
          Simulada: facturacion.cl todavía no está conectado y no sale nada al
          SII.
        </p>
      )}
      {prueba && (
        <p className="text-xs text-sky-700">
          De prueba: sale en el ambiente de pruebas de facturacion.cl, no vale
          ante el SII y no se le manda a nadie.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onVolver}
          className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg font-semibold hover:bg-gray-200"
        >
          Volver a editar
        </button>
        {puedeEmitir ? (
          confirmando && vista.montos && !emitiendo ? (
            <ConfirmInline
              question={`¿Emitir la ${nombre}${boleta ? "" : ` N° ${vista.folio}`} por ${clp(vista.montos.total)}?`}
              yesLabel="Sí, emitir"
              tono="normal"
              onYes={() => {
                setConfirmando(false);
                onEmitir();
              }}
              onNo={() => setConfirmando(false)}
            />
          ) : (
            <button
              type="button"
              disabled={!vista.ok || emitiendo}
              onClick={() => setConfirmando(true)}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {emitiendo ? "Emitiendo…" : `Emitir ${nombre}`}
            </button>
          )
        ) : (
          <span className="text-xs text-gray-500">
            La emite el administrador.
          </span>
        )}
      </div>
    </div>
  );
}
