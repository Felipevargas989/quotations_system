import FileViewLink from "../../../components/FileViewLink";
import type { DocumentoTributario } from "../../../services/facturas.service";
import { fechaCorta } from "../../../utils/ordenesDeCompra";

// LO EMITIDO DEL EVENTO (doc 19 §9.10, paso 2c). Solo lo que dice
// facturacion.cl (D9): «emitida por facturacion.cl», nunca «aceptada por el
// SII». Lo que se cortó al mandarlo queda «por confirmar» y no se emite de
// nuevo (L5). Lo que facturacion.cl rechazó no salió: no se lista. Con la
// cadena (paso 4): «Anulada por NC 1» en rojo, y cada nota dice qué hace.

const NOMBRE_DEL_TIPO: Record<number, string> = {
  33: "Factura",
  34: "Factura exenta",
  39: "Boleta",
  41: "Boleta exenta",
  56: "Nota de débito",
  61: "Nota de crédito",
};

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

const COLOR_DE_LA_CADENA: Record<string, string> = {
  anulado: "text-red-700",
  rebajado: "text-amber-700",
  corregido: "text-gray-600",
};

function Estado({ d }: { readonly d: DocumentoTributario }) {
  if (d.estado === "emitido" && d.cadena.texto)
    return (
      <span
        className={`text-xs font-semibold ${COLOR_DE_LA_CADENA[d.cadena.como] ?? "text-gray-600"}`}
      >
        {d.cadena.texto}
      </span>
    );
  if (d.estado === "emitido")
    return (
      <span className="text-xs font-semibold text-green-700">
        {d.ambiente === "simulado"
          ? "Emitida (simulada)"
          : "Emitida por facturacion.cl"}
      </span>
    );
  if (d.estado === "por_confirmar")
    return (
      <span className="text-xs font-semibold text-amber-700">
        Por confirmar: se cortó al mandarla. No la emitas de nuevo.
      </span>
    );
  return <span className="text-xs text-gray-500">Emitiendo…</span>;
}

export default function DocumentosEmitidos({
  documentos,
  ocs,
}: {
  readonly documentos: DocumentoTributario[];
  readonly ocs: { id: number; numero: string }[];
}) {
  const lista = documentos.filter(
    (d) => d.estado !== "rechazado" && d.estado !== "borrador",
  );
  if (lista.length === 0) return null;
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
      <h3 className="text-base font-semibold text-gray-900">
        Documentos emitidos
      </h3>
      {lista.map((d) => {
        const oc = ocs.find((o) => o.id === d.orden_de_compra_id);
        const nombre = `${NOMBRE_DEL_TIPO[d.tipo] ?? `Tipo ${d.tipo}`}${d.folio ? ` N° ${d.folio}` : ""}`;
        return (
          <div
            key={d.id}
            className="flex items-start justify-between gap-3 border-t border-gray-100 pt-3 first:border-t-0 first:pt-0 text-sm"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="font-semibold text-gray-900">
                {nombre}
                {d.fecha_emision && (
                  <span className="font-normal text-gray-500">
                    {" "}
                    · {fechaCorta(d.fecha_emision)}
                  </span>
                )}
              </p>
              {d.cadena.modifica && (
                <p className="text-xs text-gray-500">{d.cadena.modifica}</p>
              )}
              <p className="text-gray-700 break-words">
                {d.receptor?.razon_social}
                {oc ? ` · OC ${oc.numero}` : ""}
              </p>
              <p className="text-gray-900">
                {clp(d.total)}
                <span className="text-gray-500">
                  {" "}
                  (neto {clp(d.neto)} + IVA {clp(d.iva)})
                </span>
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Estado d={d} />
              {d.pdf_path ? (
                <FileViewLink url={d.pdf_path} title={`${nombre}.pdf`} />
              ) : d.estado === "emitido" ? (
                <span className="text-xs text-gray-400">PDF en camino</span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
