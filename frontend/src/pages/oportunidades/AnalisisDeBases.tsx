import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { toast } from "../../components/toast/Toast";
import {
  getAdjuntos,
  getAnalisis,
  pedirAnalisis,
  type ResultadoDeBases,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatCurrency } from "../../utils/currencies";
import { formatMomento } from "../../utils/dates";
import {
  criteriosPorPeso,
  requisitosPorTipo,
  SE_HACE_EN_EL_COMPLEJO,
  textoDeCosto,
} from "./oportunidades.utils";

// LA IA LEE LAS BASES (doc 17, sprint 3, paso 1). El botón manda las bases y
// anexos subidos a Opus 5.5. El análisis corre por detrás (uno a tres
// minutos) y la pantalla pregunta cada 5 segundos. Los criterios van
// arriba, por peso: Felipe, 17-10, "destacar criterios es importante".

export default function AnalisisDeBases({
  oportunidadId,
}: {
  readonly oportunidadId: number;
}) {
  const qc = useQueryClient();
  const clave = ["oportunidades", "analisis", oportunidadId];
  const { data: adjuntos = [] } = useQuery({
    queryKey: ["oportunidades", "adjuntos", oportunidadId, "bases"],
    queryFn: () => getAdjuntos(oportunidadId, "bases"),
  });
  const { data: analisis, isPending } = useQuery({
    queryKey: clave,
    queryFn: () => getAnalisis(oportunidadId),
    refetchInterval: (q) =>
      q.state.data?.estado === "procesando" ? 5000 : false,
  });

  const pedir = useMutation({
    mutationFn: () => pedirAnalisis(oportunidadId),
    onSuccess: (fila) => qc.setQueryData(clave, fila),
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo pedir el análisis.")),
  });

  const procesando = analisis?.estado === "procesando" || pedir.isPending;
  const r = analisis?.estado === "listo" ? analisis.resultado : null;

  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-sm font-semibold text-gray-900">
            Lo que piden las bases
          </h2>
          <p className="text-xs text-gray-500">
            La IA lee las bases y anexos que subiste: criterios, requisitos,
            fechas, garantías y alertas. La IA propone; revisa siempre las
            bases.
          </p>
        </div>
        <button
          type="button"
          onClick={() => pedir.mutate()}
          disabled={procesando || adjuntos.length === 0}
          title={adjuntos.length === 0 ? "Sube primero las bases" : undefined}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {procesando ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          {r || analisis?.estado === "error"
            ? "Volver a analizar"
            : "Analizar bases con IA"}
        </button>
      </div>

      {isPending ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : procesando ? (
        <p className="text-sm text-gray-600">
          Leyendo las bases… suele tardar entre 1 y 3 minutos. Puedes seguir en
          otra pantalla.
        </p>
      ) : analisis?.estado === "error" ? (
        <p className="text-sm text-red-600">{analisis.error}</p>
      ) : !r ? (
        <p className="text-sm text-gray-500">
          {adjuntos.length === 0
            ? "Sube las bases (arriba) y después analízalas."
            : "Todavía no se analizan."}
        </p>
      ) : (
        <Resultado r={r} />
      )}

      {analisis && analisis.estado !== "procesando" && (
        <p className="text-xs text-gray-400">
          {analisis.estado === "listo" ? "Analizado" : "Intentado"} el{" "}
          {formatMomento(
            analisis.terminado_en ?? analisis.creado_en,
            "diaHora",
          )}
          {analisis.modelo ? ` con ${analisis.modelo}` : ""}
          {analisis.archivos.length > 0 &&
            ` · leyó ${analisis.archivos.length} ${analisis.archivos.length === 1 ? "archivo" : "archivos"}`}
          {analisis.costo_usd != null &&
            ` · costó ${textoDeCosto(analisis.costo_usd)}`}
          {analisis.no_leidos.length > 0 &&
            ` · no leyó: ${analisis.no_leidos.map((n) => `${n.nombre} (${n.motivo})`).join("; ")}`}
        </p>
      )}
    </section>
  );
}

function Resultado({ r }: { readonly r: ResultadoDeBases }) {
  const criterios = criteriosPorPeso(r.criterios);
  return (
    <div className="space-y-5">
      {criterios.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">
            Criterios de evaluación
          </h3>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Criterio</th>
                  <th className="px-3 py-2 font-medium">Cómo se evalúa</th>
                  <th className="px-3 py-2 font-medium text-right">Peso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {criterios.map((c, i) => (
                  <tr key={`${c.nombre}-${i}`}>
                    <td className="px-3 py-2 font-semibold text-gray-900">
                      {c.nombre}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {c.como_se_evalua || "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {c.peso ? (
                        <span className="inline-block px-2 py-0.5 text-sm font-bold rounded bg-gray-800 text-white">
                          {c.peso}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm text-gray-800">{r.resumen}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="p-3 rounded-lg bg-gray-50">
            <p className="text-xs text-gray-500">Lugar</p>
            <p className="text-sm font-semibold text-gray-900">
              {r.lugar || "No lo dicen"}
            </p>
            <p className="text-xs text-gray-500">
              {SE_HACE_EN_EL_COMPLEJO[r.se_puede_en_el_complejo] ?? ""}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-gray-50">
            <p className="text-xs text-gray-500">Presupuesto según las bases</p>
            <p className="text-sm font-semibold text-gray-900">
              {r.monto > 0 ? formatCurrency(r.monto, "CLP") : "No lo dicen"}
            </p>
            {r.monto_detalle && (
              <p className="text-xs text-gray-500">{r.monto_detalle}</p>
            )}
          </div>
        </div>
      </div>

      {r.alertas.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
            <AlertTriangle size={14} /> Ojo
          </p>
          <ul className="list-disc pl-5 text-sm text-amber-900 space-y-0.5">
            {r.alertas.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {r.requisitos.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">
            Lo que hay que presentar ({r.requisitos.length})
          </h3>
          {requisitosPorTipo(r.requisitos).map(([tipo, lista]) => (
            <div key={tipo} className="space-y-1">
              <p className="text-xs font-semibold text-gray-500">{tipo}</p>
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {lista.map((q, i) => (
                  <li
                    key={`${q.que}-${i}`}
                    className="px-3 py-2 flex flex-wrap items-baseline justify-between gap-2"
                  >
                    <span className="text-sm text-gray-800">
                      {q.que}
                      {!q.obligatorio && (
                        <span className="ml-1.5 text-xs text-gray-400">
                          (opcional)
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-gray-400">
                      {q.documento}
                      {q.pagina > 0 && ` · pág. ${q.pagina}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {r.fechas.length > 0 && (
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-gray-900">Fechas</h3>
            <dl className="text-sm space-y-0.5">
              {r.fechas.map((f, i) => (
                <div key={i} className="flex justify-between gap-3">
                  <dt className="text-gray-500">{f.que}</dt>
                  <dd className="text-gray-900 text-right">{f.cuando}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {r.garantias.length > 0 && (
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-gray-900">Garantías</h3>
            <ul className="list-disc pl-5 text-sm text-gray-700 space-y-0.5">
              {r.garantias.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
