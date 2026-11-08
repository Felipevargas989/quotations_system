import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import ConfirmInline from "../../components/ConfirmInline";
import { toast } from "../../components/toast/Toast";
import { useAuth } from "../../contexts/AuthContext";
import {
  acusarRecibido,
  getPendientesDeAcuse,
  getRecibidos,
  traerRecibidos,
  type DocumentoRecibido,
} from "../../services/documentosTributarios.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";
import { fechaCorta } from "../../utils/ordenesDeCompra";
import { formatearRut } from "../../utils/rut";

// «RECIBIDOS» (doc 19 §9.25 y §9.28; Felipe, 07-11: *"¿ya trajiste las
// facturas recibidas? ¿eso funcionará?"*). Las facturas de los proveedores
// de un mes, desde el Libro de Compras de facturacion.cl: la lista sale de
// la copia guardada y «Traer de facturacion.cl» la pone al día. Desde el
// 08-11 (§9.30), la columna «Acuse»: lo pendiente en el Panel DTE
// Recibidos con «Aceptar» y «Reclamar» (solo el administrador, con
// confirmación, y reclamar dentro de los 8 días de la ley), y lo ya hecho
// desde Eventia con quién y cuándo.

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

/** La llave de un documento recibido: emisor, tipo y folio. */
const claveDe = (d: { rut_emisor: string; tipo: number; folio: number }) =>
  `${d.rut_emisor}|${d.tipo}|${d.folio}`;

/** «Quedan 3 días para reclamar», «Hoy vence…» o «Ya no se puede…». */
const textoDelPlazo = (p: DocumentoRecibido["plazo_para_reclamar"]) => {
  if (!p) return null;
  if (p.quedan < 0)
    return "ya no se puede reclamar (la ley la da por aceptada)";
  if (p.quedan === 0) return "hoy es el último día para reclamar";
  return `quedan ${p.quedan} ${p.quedan === 1 ? "día" : "días"} para reclamar`;
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
  // Aceptar o reclamar: el administrador, con «Documentos» (§9.30).
  const { userRole, permisos } = useAuth();
  const puedeAcusar =
    userRole === "administrador" && permisos.includes("facturacion_documentos");
  const panel = useQuery({
    queryKey: ["facturacion", "recibidos", "pendientes"],
    queryFn: getPendientesDeAcuse,
    enabled: !!recibidos.data?.se_puede_traer,
    retry: false,
  });
  const pendientes = new Set(
    (panel.data?.pendientes ?? []).map((p) => claveDe(p)),
  );
  const [confirmando, setConfirmando] = useState<{
    clave: string;
    accion: "aceptar" | "reclamar";
  } | null>(null);
  const [acusando, setAcusando] = useState(false);

  const acusar = async (
    d: DocumentoRecibido,
    accion: "aceptar" | "reclamar",
  ) => {
    setAcusando(true);
    try {
      await acusarRecibido({
        rut_emisor: d.rut_emisor,
        tipo: d.tipo,
        folio: d.folio,
        accion,
      });
      toast.success(
        accion === "aceptar"
          ? `Aceptada ante el SII: ${NOMBRE[d.tipo] ?? "documento"} ${d.folio}.`
          : `Reclamada ante el SII: ${NOMBRE[d.tipo] ?? "documento"} ${d.folio}.`,
      );
      setConfirmando(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: llave }),
        queryClient.invalidateQueries({
          queryKey: ["facturacion", "recibidos", "pendientes"],
        }),
      ]);
    } catch (e) {
      toast.error(
        humanizeApiError(
          e,
          accion === "aceptar"
            ? "No se pudo aceptar en facturacion.cl."
            : "No se pudo reclamar en facturacion.cl.",
        ),
      );
    } finally {
      setAcusando(false);
    }
  };

  /** La celda «Acuse»: el estado en una palabra y el detalle debajo. */
  const celdaDelAcuse = (d: DocumentoRecibido) => {
    const hecho = d.acuse_eventia;
    if (hecho)
      return (
        <>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${hecho.accion === "aceptar" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}
          >
            {hecho.accion === "aceptar" ? "Aceptada" : "Reclamada"}
          </span>
          <span className="mt-0.5 block truncate text-xs text-gray-500">
            {hecho.pedido_por_nombre ? `por ${hecho.pedido_por_nombre} ` : ""}
            el {formatMomento(hecho.pedido_en, "diaMes")}
          </span>
        </>
      );
    const clave = claveDe(d);
    if (pendientes.has(clave)) {
      const pregunta = confirmando?.clave === clave ? confirmando.accion : null;
      const plazo = textoDelPlazo(d.plazo_para_reclamar);
      const sePuedeReclamar = (d.plazo_para_reclamar?.quedan ?? 0) >= 0;
      return (
        <>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
            Pendiente
          </span>
          {plazo && (
            <span className="mt-0.5 block text-xs text-gray-500">{plazo}</span>
          )}
          {puedeAcusar &&
            (pregunta ? (
              <span className="mt-1 block">
                <ConfirmInline
                  question={
                    pregunta === "aceptar"
                      ? "¿Aceptarla ante el SII? Después no se puede reclamar."
                      : "¿Reclamarla ante el SII? El proveedor tendrá que anularla con una nota de crédito."
                  }
                  yesLabel={
                    pregunta === "aceptar" ? "Sí, aceptar" : "Sí, reclamar"
                  }
                  tono={pregunta === "aceptar" ? "normal" : "peligro"}
                  busy={acusando}
                  onYes={() => void acusar(d, pregunta)}
                  onNo={() => setConfirmando(null)}
                />
              </span>
            ) : (
              <span className="mt-1 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfirmando({ clave, accion: "aceptar" })}
                  className="rounded-lg border border-gray-300 bg-white px-2 py-0.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Aceptar
                </button>
                {sePuedeReclamar && (
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmando({ clave, accion: "reclamar" })
                    }
                    className="rounded-lg border border-red-200 bg-white px-2 py-0.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    Reclamar
                  </button>
                )}
              </span>
            ))}
        </>
      );
    }
    if (d.acuse_sii)
      return (
        <span
          className="block truncate text-xs text-gray-500"
          title={d.acuse_sii}
        >
          SII: {d.acuse_sii}
        </span>
      );
    return <span className="text-xs text-gray-400">—</span>;
  };

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
      {panel.data?.se_puede && !panel.data.ok && panel.data.mensaje && (
        <p className="text-xs text-amber-700">
          Panel de recibidos: facturacion.cl dice «{panel.data.mensaje}».
        </p>
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
                <th className="py-1 pl-3 font-medium">Acuse</th>
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
                  <td className="max-w-[16rem] py-1.5 pl-3 pr-2">
                    {celdaDelAcuse(d)}
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
