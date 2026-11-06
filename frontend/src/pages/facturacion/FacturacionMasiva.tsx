import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { X } from "lucide-react";
import ConfirmInline from "../../components/ConfirmInline";
import { toast } from "../../components/toast/Toast";
import { marcaDelAmbiente } from "../../constants/facturacion";
import {
  emitirDte,
  type DocumentoTributario,
  type EventoPorFacturar,
} from "../../services/facturas.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { loQueLeFalta, revisarUnoParaLaMasiva } from "./revisarUnoParaLaMasiva";

// LA FACTURACIÓN MASIVA DE «POR FACTURAR» (doc 19 §9.21; Felipe, 06-11:
// *"hacer una facturación masiva"*). De los eventos marcados, BelIA arma
// el DTE de cada uno como lo haría «Emitir DTE» (sus OC de Documentos, la
// factura o la boleta, desde la OC o la cotización). Los que quedan listos
// se emiten juntos, uno tras otro, con una sola confirmación; los que no,
// dicen qué les falta y se facturan uno por uno. Si uno se corta o no sale,
// se detiene ahí, como las boletas de un cobro: lo emitido queda emitido.

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const NOMBRE = { 33: "Factura", 39: "Boleta" } as const;

type Resultado =
  | { como: "emitido"; doc: DocumentoTributario }
  | { como: "por_confirmar" }
  | { como: "error"; texto: string };

export default function FacturacionMasiva({
  eventos,
  onCerrar,
  onEmitidos,
}: {
  readonly eventos: EventoPorFacturar[];
  readonly onCerrar: () => void;
  readonly onEmitidos: () => void;
}) {
  const revisados = useQueries({
    queries: eventos.map((e) => ({
      queryKey: ["facturacion", "masiva", e.id],
      queryFn: () => revisarUnoParaLaMasiva(e.id),
      gcTime: 0,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      retry: false,
    })),
  });
  const [resultados, setResultados] = useState<Record<string, Resultado>>({});
  const [confirmando, setConfirmando] = useState(false);
  const [emitiendo, setEmitiendo] = useState(false);

  const revisando = revisados.some((r) => r.isPending);
  const listos = eventos
    .map((e, i) => ({ e, r: revisados[i].data }))
    .filter(
      (x): x is { e: EventoPorFacturar; r: NonNullable<typeof x.r> } =>
        !!x.r && x.r.vista.ok && !resultados[x.e.id],
    );
  const total = listos.reduce((s, x) => s + (x.r.vista.montos?.total ?? 0), 0);

  const emitir = async () => {
    setConfirmando(false);
    setEmitiendo(true);
    let emitidos = 0;
    for (const { e, r } of listos) {
      try {
        const doc = await emitirDte(e.id, r.pedida);
        if (doc.estado === "por_confirmar") {
          setResultados((x) => ({ ...x, [e.id]: { como: "por_confirmar" } }));
          toast.warn(
            `Se cortó la conexión con facturacion.cl en el #${e.numero}: queda por confirmar. Se detuvo ahí.`,
            { sticky: true },
          );
          break;
        }
        emitidos++;
        setResultados((x) => ({ ...x, [e.id]: { como: "emitido", doc } }));
      } catch (error) {
        setResultados((x) => ({
          ...x,
          [e.id]: {
            como: "error",
            texto: humanizeApiError(error, "No se pudo emitir."),
          },
        }));
        toast.error(`El #${e.numero} no salió: se detuvo ahí.`);
        break;
      }
    }
    setEmitiendo(false);
    if (emitidos)
      toast.success(
        `${emitidos} ${emitidos === 1 ? "documento emitido" : "documentos emitidos"}.`,
      );
    onEmitidos();
  };

  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-violet-900">
          Facturar {eventos.length}{" "}
          {eventos.length === 1 ? "evento" : "eventos"}
        </p>
        <button
          type="button"
          onClick={onCerrar}
          title="Cerrar sin emitir"
          className="text-gray-400 hover:text-gray-600"
        >
          <X size={16} />
        </button>
      </div>
      <table className="w-full rounded-lg bg-white text-sm">
        <tbody className="divide-y divide-gray-100">
          {eventos.map((e, i) => {
            const q = revisados[i];
            const resultado = resultados[e.id];
            const falta = q.data ? loQueLeFalta(q.data.vista) : null;
            return (
              <tr key={e.id}>
                <td className="px-3 py-1.5 font-semibold text-gray-900">
                  #{e.numero}
                </td>
                <td className="py-1.5 pr-2 text-gray-700">
                  {e.cliente ?? "—"}
                </td>
                <td className="py-1.5 pr-2 text-gray-600">
                  {q.data ? NOMBRE[q.data.tipo] : ""}
                </td>
                <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                  {q.data?.vista.montos ? clp(q.data.vista.montos.total) : ""}
                </td>
                <td className="py-1.5 pr-3 text-right text-xs">
                  {resultado?.como === "emitido" ? (
                    <span className="font-semibold text-green-700">
                      {NOMBRE[resultado.doc.tipo as 33 | 39] ?? "Documento"} N°{" "}
                      {resultado.doc.folio} emitida
                      {marcaDelAmbiente(resultado.doc.ambiente)}
                    </span>
                  ) : resultado?.como === "por_confirmar" ? (
                    <span className="font-semibold text-amber-700">
                      Por confirmar: no la emitas de nuevo
                    </span>
                  ) : resultado?.como === "error" ? (
                    <span className="text-red-600">{resultado.texto}</span>
                  ) : q.isPending ? (
                    <span className="text-gray-400">BelIA está armando…</span>
                  ) : q.isError ? (
                    <span className="text-red-600">
                      {humanizeApiError(q.error, "No se pudo armar.")}
                    </span>
                  ) : falta ? (
                    <span className="text-amber-700">
                      {falta}: factúralo uno por uno
                    </span>
                  ) : (
                    <span className="font-semibold text-green-700">Lista</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {confirmando ? (
          <ConfirmInline
            question={`¿Emitir ${listos.length} ${listos.length === 1 ? "documento" : "documentos"} por ${clp(total)} en total? Emitidos no se borran.`}
            yesLabel="Sí, emitir"
            tono="normal"
            onYes={() => void emitir()}
            onNo={() => setConfirmando(false)}
          />
        ) : (
          <button
            type="button"
            disabled={revisando || emitiendo || listos.length === 0}
            onClick={() => setConfirmando(true)}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {emitiendo
              ? "Emitiendo…"
              : revisando
                ? "Revisando…"
                : `Emitir ${listos.length === 1 ? "la lista" : `las ${listos.length} listas`}`}
          </button>
        )}
      </div>
    </div>
  );
}
