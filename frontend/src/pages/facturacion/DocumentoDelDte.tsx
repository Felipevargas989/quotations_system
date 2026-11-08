import type { ReactNode } from "react";
import { REFERENCIAS_QUE_PIDE } from "../../constants/facturacion";
import type {
  DtePedido,
  TipoDeDte,
  VistaPrevia,
} from "../../services/facturas.service";
import { fechaCorta } from "../../utils/ordenesDeCompra";
import { formatearRut } from "../../utils/rut";
import { valorDeLaLinea } from "../postventa/facturacion/datosDeLaFactura";
import { TotalesDelDte } from "../postventa/facturacion/LineasDelDte";
import { Seccion } from "./PiezasDelDocumento";

// LA FACTURA O LA BOLETA, PARA LEERLA (doc 19 §9.31; Felipe, 08-11: *"un
// modal con la misma estructura de documento (dejémoslo como pieza de
// estructura de factura/boleta) que ocupamos en nuevo documento"*). Las
// mismas secciones de «Nuevo documento» (`Seccion`: Documento,
// Destinatario, Ítems, Referencias y Totales), sin casillas: lo que se va a
// emitir, tal como lo pidió BelIA o como quedó corregido. Los montos y las
// observaciones son los de la revisión del motor, la misma que emite.

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const NOMBRE: Record<TipoDeDte, string> = {
  33: "Factura electrónica",
  39: "Boleta electrónica",
};
const nombreDeLaReferencia = (tipo: string) =>
  REFERENCIAS_QUE_PIDE.find((t) => t.codigo === tipo)?.nombre ?? tipo;

function Dato({
  titulo,
  ancho,
  children,
}: {
  readonly titulo: string;
  /** Las columnas que ocupa, de tres. */
  readonly ancho?: 2 | 3;
  readonly children: ReactNode;
}) {
  return (
    <div
      className={
        ancho === 3 ? "sm:col-span-3" : ancho === 2 ? "sm:col-span-2" : ""
      }
    >
      <dt className="text-xs text-gray-500">{titulo}</dt>
      <dd className="text-sm text-gray-900">{children || "—"}</dd>
    </div>
  );
}

export default function DocumentoDelDte({
  pedida,
  vista,
}: {
  readonly pedida: DtePedido;
  readonly vista: VistaPrevia;
}) {
  const factura = pedida.tipo === 33;
  const r = pedida.receptor;
  const pago = vista.pago;
  const conDescuento = pedida.lineas.some((l) => !!l.descuento);
  return (
    <div className="space-y-3">
      <Seccion titulo="Documento">
        <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-3">
          <Dato titulo="Tipo">{NOMBRE[pedida.tipo]}</Dato>
          <Dato titulo="Fecha de emisión">{fechaCorta(vista.fecha)}</Dato>
          {factura && pago && (
            <Dato titulo="Condición de pago">
              {pago.forma === 1 || !pago.vencimiento
                ? "Contado"
                : `Crédito ${pago.dias} días · vence ${fechaCorta(pago.vencimiento)}`}
            </Dato>
          )}
        </dl>
        {vista.observaciones.length > 0 && (
          <div className="text-xs text-gray-500">
            {vista.observaciones.map((o) => (
              <p key={o}>{o}</p>
            ))}
          </div>
        )}
      </Seccion>

      <Seccion titulo="Destinatario">
        {factura ? (
          <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-3">
            <Dato titulo="Razón social" ancho={3}>
              {r.razon_social}
            </Dato>
            <Dato titulo="RUT">{r.rut ? formatearRut(r.rut) : null}</Dato>
            <Dato titulo="Giro" ancho={2}>
              {r.giro}
            </Dato>
            <Dato titulo="Dirección">{r.direccion}</Dato>
            <Dato titulo="Comuna">{r.comuna}</Dato>
            <Dato titulo="Ciudad">{r.ciudad}</Dato>
            <Dato titulo="Correos" ancho={3}>
              {r.correo}
            </Dato>
          </dl>
        ) : (
          <p className="text-sm text-gray-700">
            Sin datos del cliente
            {r.correo ? ` · se le manda a ${r.correo}` : ""}
          </p>
        )}
      </Seccion>

      <Seccion titulo="Ítems">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="pb-1 font-normal">Descripción</th>
              <th className="pb-1 text-right font-normal">Cantidad</th>
              <th className="pb-1 text-right font-normal">Precio c/IVA</th>
              {conDescuento && (
                <th className="pb-1 text-right font-normal">Desc. %</th>
              )}
              <th className="pb-1 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pedida.lineas.map((l, i) => (
              <tr key={`${i}-${l.descripcion}`} className="align-top">
                <td className="py-1.5 pr-2 text-gray-900">
                  {l.descripcion}
                  {l.descripcion_larga && (
                    <span className="block text-xs text-gray-500">
                      {l.descripcion_larga}
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {l.cantidad.toLocaleString("es-CL")}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {clp(l.precio)}
                </td>
                {conDescuento && (
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {l.descuento ? `${l.descuento} %` : ""}
                  </td>
                )}
                <td className="py-1.5 text-right tabular-nums text-gray-900">
                  {clp(valorDeLaLinea(l))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Seccion>

      {factura && (
        <Seccion titulo="Referencias">
          {pedida.referencias.length ? (
            <ul className="space-y-0.5 text-sm text-gray-900">
              {pedida.referencias.map((x) => (
                <li key={`${x.tipo}-${x.folio}`}>
                  {x.tipo} · {nombreDeLaReferencia(x.tipo)}
                  {x.folio ? ` · N° ${x.folio}` : ""}
                  {x.fecha ? ` · ${fechaCorta(x.fecha)}` : ""}
                  {x.razon ? (
                    <span className="text-gray-500"> · {x.razon}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">Sin referencias</p>
          )}
        </Seccion>
      )}

      <Seccion titulo="Totales">
        <TotalesDelDte montos={vista.montos} />
      </Seccion>
    </div>
  );
}
