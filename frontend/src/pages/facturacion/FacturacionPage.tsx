import { Fragment, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import FileViewLink from "../../components/FileViewLink";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import { toast } from "../../components/toast/Toast";
import {
  comprobarDocumento,
  getListaDeFacturacion,
  pedirPdfDelDocumento,
  type DocumentoDeLaLista,
} from "../../services/documentosTributarios.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { fechaCorta } from "../../utils/ordenesDeCompra";
import NotaDeUnDocumento from "./NotaDeUnDocumento";

// LA LISTA DE FACTURACIÓN (doc 19 §9.5, paso 4; maqueta del 04-11). Solo el
// administrador (E5), solo con el módulo propio `facturacion`.
//
// Todo lo emitido en un mes: facturas, boletas y notas, cada documento con
// su estado en la cadena («Anulada por NC 88», «Rebajada: queda $…») y sus
// notas debajo (factura → NC → ND). Lo facturado del mes, neto de notas. Lo
// que se cortó al mandarlo espera «Comprobar» (L5). El reporte se descarga
// con el documento y el que lo anuló o rebajó.

const clp = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("es-CL")}`;

/** «1 factura», «4 boletas». */
const cuantas = (n: number, cosa: string) =>
  `${n} ${cosa}${n === 1 ? "" : "s"}`;

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

/** Los últimos 12 meses, del más nuevo al más viejo (AAAA-MM). */
const ultimosMeses = (hoy = new Date()) =>
  Array.from({ length: 12 }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { value: valor, label: `${MESES[d.getMonth()]} ${d.getFullYear()}` };
  });

type Filtro = "todo" | "facturas" | "boletas" | "notas";
const FILTROS: { key: Filtro; label: string }[] = [
  { key: "todo", label: "Todo" },
  { key: "facturas", label: "Facturas" },
  { key: "boletas", label: "Boletas" },
  { key: "notas", label: "Notas" },
];

const esNota = (d: DocumentoDeLaLista) => d.tipo === 56 || d.tipo === 61;

const colorDelEstado = (d: DocumentoDeLaLista) =>
  d.estado !== "emitido"
    ? "text-amber-700"
    : d.cadena.como === "anulado"
      ? "text-red-700"
      : d.cadena.como === "rebajado" || d.cadena.como === "corregido"
        ? "text-amber-700"
        : esNota(d)
          ? "text-gray-600"
          : "text-green-700";

/** El reporte (§9.5): el documento y el que lo anuló o rebajó. */
const descargarReporte = (mes: string, docs: DocumentoDeLaLista[]) => {
  const campo = (v: unknown) => {
    const t = String(v ?? "");
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const filas = [
    [
      "Fecha",
      "Documento",
      "Cliente",
      "Evento",
      "OC",
      "Neto",
      "IVA",
      "Total",
      "Estado",
    ],
    ...docs.map((d) => [
      d.fecha_emision ? fechaCorta(d.fecha_emision) : "",
      d.titulo,
      d.cliente ?? "",
      d.numero ?? "",
      d.oc ?? "",
      d.neto,
      d.iva,
      d.total,
      d.cadena.texto,
    ]),
  ];
  const texto = filas.map((f) => f.map(campo).join(";")).join("\r\n");
  // Con BOM: así Excel abre los acentos bien.
  const url = URL.createObjectURL(
    new Blob([`\ufeff${texto}`], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `facturacion-${mes}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

export default function FacturacionPage() {
  const queryClient = useQueryClient();
  const meses = ultimosMeses();
  const [mes, setMes] = useState(meses[0].value);
  const [filtro, setFiltro] = useState<Filtro>("todo");
  const [anulando, setAnulando] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const llave = ["facturacion", "lista", mes];
  const lista = useQuery({
    queryKey: llave,
    queryFn: () => getListaDeFacturacion(mes),
  });

  const docs = lista.data?.documentos ?? [];
  const porId = new Map(docs.map((d) => [d.id, d]));
  const hijos = new Map<number, DocumentoDeLaLista[]>();
  for (const d of docs)
    if (d.modifica_id != null && porId.has(d.modifica_id))
      hijos.set(d.modifica_id, [...(hijos.get(d.modifica_id) ?? []), d]);
  const raices =
    filtro === "notas"
      ? docs.filter(esNota)
      : docs.filter(
          (d) =>
            (d.modifica_id == null || !porId.has(d.modifica_id)) &&
            (filtro === "todo" ||
              (filtro === "facturas" && d.tipo === 33) ||
              (filtro === "boletas" && d.tipo === 39)),
        );

  const refrescar = () => queryClient.invalidateQueries({ queryKey: llave });

  const comprobar = async (d: DocumentoDeLaLista) => {
    setOcupado(d.id);
    try {
      const r = await comprobarDocumento(d.id);
      if (r.estado === "emitido")
        toast.success(`Salió: quedó con el folio N° ${r.folio}.`);
      else
        toast.warn(
          "No salió: no quedó en facturacion.cl. Se puede emitir de nuevo.",
        );
      await refrescar();
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo comprobar."));
    } finally {
      setOcupado(null);
    }
  };

  const pedirPdf = async (d: DocumentoDeLaLista) => {
    setOcupado(d.id);
    try {
      await pedirPdfDelDocumento(d.id);
      await refrescar();
    } catch (e) {
      toast.error(humanizeApiError(e, "No llegó el PDF."));
    } finally {
      setOcupado(null);
    }
  };

  const fila = (d: DocumentoDeLaLista, nivel: number): JSX.Element => (
    <Fragment key={d.id}>
      <tr className="align-top border-t border-gray-100">
        <td className="py-2 pr-2" style={{ paddingLeft: `${nivel * 1.25}rem` }}>
          <p
            className={`font-semibold ${esNota(d) ? "text-gray-700" : "text-gray-900"}`}
          >
            {nivel > 0 && <span className="text-gray-300">↳ </span>}
            {d.titulo}
          </p>
          {d.reemplaza && (
            <p className="text-xs text-gray-500">
              reemplaza a la {d.reemplaza}
            </p>
          )}
          <p className="text-xs text-gray-400">
            {d.fecha_emision ? fechaCorta(d.fecha_emision) : "sin fecha"}
            {d.numero ? ` · N° ${d.numero}` : ""}
            {d.oc ? ` · OC ${d.oc}` : ""}
          </p>
        </td>
        <td className="py-2 pr-2 text-gray-700 break-words">
          {d.cliente ?? "—"}
        </td>
        <td className="py-2 pr-4 text-right whitespace-nowrap text-gray-900">
          {clp(d.total)}
        </td>
        <td className={`py-2 pr-2 text-xs font-semibold ${colorDelEstado(d)}`}>
          {d.cadena.texto}
          {d.error && d.estado !== "emitido" && (
            <span className="block font-normal text-gray-500">{d.error}</span>
          )}
        </td>
        <td className="py-2 text-right text-xs whitespace-nowrap">
          <div className="flex flex-col items-end gap-1">
            {d.pdf_path && (
              <FileViewLink url={d.pdf_path} title={`${d.titulo}.pdf`} />
            )}
            {d.acciones.pedirPdf && (
              <button
                type="button"
                disabled={ocupado === d.id}
                onClick={() => void pedirPdf(d)}
                className="font-semibold text-blue-600 hover:underline disabled:opacity-50"
              >
                Pedir el PDF
              </button>
            )}
            {d.acciones.comprobar && (
              <button
                type="button"
                disabled={ocupado === d.id}
                onClick={() => void comprobar(d)}
                className="font-semibold text-amber-700 hover:underline disabled:opacity-50"
              >
                {ocupado === d.id ? "Comprobando…" : "Comprobar"}
              </button>
            )}
            {(d.acciones.anular || d.acciones.rebajar || d.acciones.corregir) &&
              anulando !== d.id && (
                <button
                  type="button"
                  onClick={() => setAnulando(d.id)}
                  className="font-semibold text-red-600 hover:underline"
                >
                  {d.tipo === 33 ? "Anular o rebajar…" : "Anular…"}
                </button>
              )}
          </div>
        </td>
      </tr>
      {anulando === d.id && (
        <tr>
          <td
            colSpan={5}
            className="pb-3"
            style={{ paddingLeft: `${nivel * 1.25}rem` }}
          >
            <NotaDeUnDocumento
              doc={d}
              onCerrar={() => setAnulando(null)}
              onEmitida={() => {
                setAnulando(null);
                void refrescar();
              }}
            />
          </td>
        </tr>
      )}
      {filtro !== "notas" &&
        [...(hijos.get(d.id) ?? [])]
          .sort((a, b) => a.id - b.id)
          .map((h) => fila(h, nivel + 1))}
    </Fragment>
  );

  const r = lista.data?.resumen;
  const nombreDelMes = meses.find((m) => m.value === mes)?.label ?? mes;

  return (
    // Abajo, espacio para que el botón de BelIA no tape las acciones de la
    // última fila.
    <div className="max-w-5xl space-y-4 p-4 pb-24 sm:p-6 sm:pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Facturación</h1>
        <div className="flex items-center gap-2">
          <div className="w-48">
            <SelectWithSearch
              options={meses}
              value={mes}
              onChange={(v) => v && setMes(v)}
              tamano="sm"
            />
          </div>
          <button
            type="button"
            disabled={!docs.length}
            onClick={() => descargarReporte(mes, docs)}
            className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-xs rounded-lg font-semibold hover:bg-gray-50 disabled:opacity-50"
          >
            <Download size={13} /> Reporte (CSV)
          </button>
        </div>
      </div>

      {lista.data?.ambiente === "simulado" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Modo simulado: facturacion.cl todavía no está conectado. Los
          documentos se arman y se numeran, pero no sale nada al SII.
        </p>
      )}

      {r && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs text-gray-500">Facturado en {nombreDelMes}</p>
            <p className="text-2xl font-semibold text-gray-900">
              {clp(r.facturado)}
            </p>
            <p className="text-xs text-gray-500">neto de notas de crédito</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs text-gray-500">Documentos</p>
            <p className="text-2xl font-semibold text-gray-900">
              {r.facturas + r.boletas + r.notas}
            </p>
            <p className="text-xs text-gray-500">
              {cuantas(r.facturas, "factura")} · {cuantas(r.boletas, "boleta")}{" "}
              · {cuantas(r.notas, "nota")}
            </p>
          </div>
          <div
            className={`rounded-lg border px-4 py-3 ${r.porConfirmar ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-white"}`}
          >
            <p className="text-xs text-gray-500">Por confirmar</p>
            <p
              className={`text-2xl font-semibold ${r.porConfirmar ? "text-amber-800" : "text-gray-900"}`}
            >
              {r.porConfirmar}
            </p>
            <p className="text-xs text-gray-500">
              {r.porConfirmar
                ? "se cortaron al mandarlos: «Comprobar»"
                : "todo con respuesta"}
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-4 border-b border-gray-200">
        {FILTROS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFiltro(f.key)}
            className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${filtro === f.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-600 hover:text-gray-900"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {lista.isPending ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : lista.isError ? (
        <p className="text-sm text-red-600">No se pudo cargar la lista.</p>
      ) : raices.length === 0 ? (
        <p className="text-sm text-gray-500">Nada emitido en {nombreDelMes}.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="pb-2 font-medium">Documento</th>
                <th className="pb-2 font-medium">Cliente</th>
                <th className="pb-2 pr-4 text-right font-medium">Total</th>
                <th className="pb-2 font-medium">Estado</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>{raices.map((d) => fila(d, 0))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
