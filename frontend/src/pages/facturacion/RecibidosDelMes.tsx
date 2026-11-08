import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import { toast } from "../../components/toast/Toast";
import {
  getRecibidos,
  traerRecibidos,
} from "../../services/documentosTributarios.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";
import { fechaCorta } from "../../utils/ordenesDeCompra";
import { formatearRut } from "../../utils/rut";

// «RECIBIDOS» (doc 19 §9.25 y §9.28; Felipe, 07-11: *"¿ya trajiste las
// facturas recibidas? ¿eso funcionará?"*). Las facturas de los proveedores
// de un mes, desde el Libro de Compras de facturacion.cl: la lista sale de
// la copia guardada y «Traer de facturacion.cl» la pone al día. Solo lee:
// aceptar o rechazar es el paso 3, con otro OK.

const clp = (n: number | null) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString("es-CL")}`;

const NOMBRE: Record<number, string> = {
  33: "Factura",
  34: "Factura exenta",
  46: "Factura de compra",
  52: "Guía de despacho",
  56: "Nota de débito",
  61: "Nota de crédito",
};

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** «2026-11» en Chile, hoy. */
const esteMes = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);

const moverMes = (periodo: string, n: number) => {
  const [a, m] = periodo.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

const nombreDelMes = (periodo: string) => {
  const [a, m] = periodo.split("-").map(Number);
  return `${MESES[m - 1]} ${a}`;
};

export default function RecibidosDelMes() {
  const queryClient = useQueryClient();
  const [periodo, setPeriodo] = useState(esteMes);
  const [trayendo, setTrayendo] = useState(false);
  const llave = ["facturacion", "recibidos", periodo];
  const recibidos = useQuery({
    queryKey: llave,
    queryFn: () => getRecibidos(periodo),
  });

  const traer = async () => {
    setTrayendo(true);
    try {
      const r = await traerRecibidos(periodo);
      queryClient.setQueryData(llave, r);
      toast.success(
        r.traidos
          ? `Se trajeron ${r.traidos} documentos de ${nombreDelMes(periodo)}.`
          : `facturacion.cl no tiene documentos recibidos en ${nombreDelMes(periodo)}.`,
      );
    } catch (e) {
      toast.error(
        humanizeApiError(e, "No se pudo traer lo recibido de facturacion.cl."),
      );
    } finally {
      setTrayendo(false);
    }
  };

  const datos = recibidos.data;
  const documentos = datos?.documentos ?? [];
  const signo = (tipo: number) => (tipo === 61 ? -1 : 1);
  const total = documentos.reduce(
    (s, d) => s + signo(d.tipo) * (d.total ?? 0),
    0,
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Mes anterior"
            onClick={() => setPeriodo((p) => moverMes(p, -1))}
            className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[9rem] text-center text-sm font-semibold capitalize text-gray-900">
            {nombreDelMes(periodo)}
          </span>
          <button
            type="button"
            aria-label="Mes siguiente"
            onClick={() => setPeriodo((p) => moverMes(p, 1))}
            className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {datos?.traido_en && (
            <span>Traído el {formatMomento(datos.traido_en, "diaMes")}</span>
          )}
          <button
            type="button"
            disabled={trayendo || !datos?.se_puede_traer}
            onClick={() => void traer()}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {trayendo ? "Trayendo…" : "Traer de facturacion.cl"}
          </button>
        </div>
      </div>

      {datos?.sin_conexion && (
        <p className="text-xs text-amber-700">{datos.sin_conexion}.</p>
      )}

      {recibidos.isPending ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : recibidos.isError ? (
        <p className="text-sm text-red-600">
          {humanizeApiError(recibidos.error, "No se pudo cargar lo recibido.")}
        </p>
      ) : documentos.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          Sin documentos recibidos de {nombreDelMes(periodo)}.
          {datos?.se_puede_traer &&
            " Apreta «Traer de facturacion.cl» para pedirlos."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4">
          <p className="mb-2 text-xs text-gray-500">
            {documentos.length}{" "}
            {documentos.length === 1 ? "documento" : "documentos"} · total{" "}
            <span className="font-semibold text-gray-900">{clp(total)}</span>{" "}
            (las notas de crédito restan)
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="py-1 font-medium">Proveedor</th>
                <th className="py-1 font-medium">Documento</th>
                <th className="py-1 text-right font-medium">Neto</th>
                <th className="py-1 text-right font-medium">IVA</th>
                <th className="py-1 text-right font-medium">Total</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {documentos.map((d) => (
                <tr key={d.id} className="align-top">
                  <td className="py-1.5 pr-2 text-gray-800">
                    {d.razon_social_emisor ?? "—"}
                    <span className="block text-xs text-gray-500">
                      {formatearRut(d.rut_emisor)}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">
                    {NOMBRE[d.tipo] ?? `Documento ${d.tipo}`} {d.folio}
                    <span className="block text-xs text-gray-500">
                      {d.fecha_emision ? fechaCorta(d.fecha_emision) : "—"}
                      {d.recepcion_sii
                        ? ` · recibida en el SII el ${fechaCorta(d.recepcion_sii.slice(0, 10))}`
                        : ""}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap text-gray-600">
                    {clp(d.neto)}
                  </td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap text-gray-600">
                    {clp(d.iva)}
                  </td>
                  <td
                    className={`py-1.5 pr-2 text-right whitespace-nowrap font-semibold ${d.tipo === 61 ? "text-red-700" : "text-gray-900"}`}
                  >
                    {d.tipo === 61 ? `−${clp(d.total)}` : clp(d.total)}
                  </td>
                  <td className="py-1.5 text-right">
                    {d.link_pdf && (
                      <a
                        href={d.link_pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
                      >
                        PDF <ExternalLink size={12} />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
