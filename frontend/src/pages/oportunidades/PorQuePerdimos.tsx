import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "../../components/toast/Toast";
import {
  getPorQue,
  pedirPorQue,
  type PorQuePerdimos as Explicacion,
} from "../../services/comparacion.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";
import { textoDeCosto } from "./oportunidades.utils";

// POR QUÉ PERDIMOS (decisión 97 del doc 17, 27-10). Felipe: "abajo está la
// predicción y luego está el por qué perdimos y si el haber perdido era
// razonable o no". Va debajo de la predicción de «Comparación de ofertas»,
// solo en las perdidas. Eventia lo pide sola cuando ya sabe a quién
// eligieron y tiene la oferta de quien ganó; el botón lo pide de nuevo.
// Es interno: no va en nada que se suba a Mercado Público.

const VEREDICTO: Record<
  Explicacion["razonable"],
  { texto: string; clases: string }
> = {
  si: {
    texto: "Era razonable perder",
    clases: "bg-gray-100 text-gray-800",
  },
  no: {
    texto: "No era razonable perder",
    clases: "bg-red-100 text-red-800",
  },
  dudoso: {
    texto: "No se puede saber si era razonable",
    clases: "bg-amber-100 text-amber-800",
  },
};

const claveDelPorQue = (id: number) => ["oportunidades", "por-que", id];

export default function PorQuePerdimos({
  oportunidadId,
}: {
  readonly oportunidadId: number;
}) {
  const qc = useQueryClient();
  const { data: trabajo } = useQuery({
    queryKey: claveDelPorQue(oportunidadId),
    queryFn: () => getPorQue(oportunidadId),
    refetchInterval: (q) =>
      q.state.data?.estado === "procesando" ? 5000 : false,
  });
  const pedir = useMutation({
    mutationFn: () => pedirPorQue(oportunidadId),
    onSuccess: (fila) => qc.setQueryData(claveDelPorQue(oportunidadId), fila),
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo explicar por qué perdimos.")),
  });
  const procesando = trabajo?.estado === "procesando" || pedir.isPending;
  const r = trabajo?.estado === "listo" ? trabajo.resultado : null;

  return (
    <div className="space-y-3 border-t border-gray-100 pt-4">
      <h3 className="text-sm font-semibold text-gray-900">Por qué perdiste</h3>
      {r ? (
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-1.5">
            <span
              className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${VEREDICTO[r.razonable].clases}`}
            >
              {VEREDICTO[r.razonable].texto}
            </span>
            <p className="text-sm text-gray-900">{r.resumen}</p>
            <p className="text-sm text-gray-700">{r.fundamento}</p>
          </div>
          {r.en_que_se_perdio.length > 0 && (
            <ul className="space-y-1 text-sm text-gray-800">
              {r.en_que_se_perdio.map((c) => (
                <li key={c.criterio}>
                  <span className="font-semibold">{c.criterio}:</span>{" "}
                  {c.que_paso}
                </li>
              ))}
            </ul>
          )}
          {r.para_la_proxima.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Para la próxima
              </p>
              <ul className="list-disc pl-5 text-sm text-gray-800 space-y-0.5">
                {r.para_la_proxima.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        !procesando && (
          <p className="text-sm text-gray-600">
            Cuando se sabe a quién eligieron y está su oferta, Eventia lo
            explica sola. También puedes pedirlo ahora.
          </p>
        )
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => pedir.mutate()}
          disabled={procesando}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50"
        >
          {procesando ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          {r || trabajo?.estado === "error"
            ? "Volver a explicar"
            : "Explicar por qué perdimos"}
        </button>
        {procesando && (
          <p className="text-sm text-gray-600">
            La IA está leyendo las ofertas… suele tardar entre 2 y 5 minutos.
          </p>
        )}
      </div>
      {trabajo?.estado === "error" && (
        <p className="text-sm text-red-600">{trabajo.error}</p>
      )}
      {trabajo && trabajo.estado !== "procesando" && (
        <p className="text-xs text-gray-400">
          {trabajo.estado === "listo" ? "Explicado" : "Intentado"} el{" "}
          {formatMomento(trabajo.terminado_en ?? trabajo.creado_en, "diaHora")}
          {trabajo.modelo ? ` con ${trabajo.modelo}` : ""}
          {trabajo.costo_usd != null &&
            ` · costó ${textoDeCosto(trabajo.costo_usd)}`}
        </p>
      )}
    </div>
  );
}
