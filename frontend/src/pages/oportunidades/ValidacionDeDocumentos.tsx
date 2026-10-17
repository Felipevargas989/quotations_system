import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "../../components/toast/Toast";
import {
  getAnalisis,
  getValidacion,
  pedirValidacion,
  type ResultadoDeValidacion,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";
import {
  contarPorEstadoDeValidacion,
  ESTADOS_DE_VALIDACION,
  LISTO_PARA_POSTULAR,
  textoDeCosto,
} from "./oportunidades.utils";

// VALIDAR DOCUMENTOS (doc 17, sprint 3, paso 3; migración 127). Felipe,
// 17-10: "y lo más importante validar documentos". Opus 5.5 toma el
// checklist del último análisis de las bases y revisa, requisito por
// requisito, lo que vas a presentar ("Mi postulación"), tu carpeta de
// documentos (con su vencimiento) y tus datos de "Mi empresa". Corre por
// detrás y la pantalla pregunta cada 5 segundos.

export default function ValidacionDeDocumentos({
  oportunidadId,
}: {
  readonly oportunidadId: number;
}) {
  const qc = useQueryClient();
  const clave = ["oportunidades", "validacion", oportunidadId];
  const { data: analisis } = useQuery({
    queryKey: ["oportunidades", "analisis", oportunidadId],
    queryFn: () => getAnalisis(oportunidadId),
  });
  const { data: validacion, isPending } = useQuery({
    queryKey: clave,
    queryFn: () => getValidacion(oportunidadId),
    refetchInterval: (q) =>
      q.state.data?.estado === "procesando" ? 5000 : false,
  });

  const pedir = useMutation({
    mutationFn: () => pedirValidacion(oportunidadId),
    onSuccess: (fila) => qc.setQueryData(clave, fila),
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo pedir la validación.")),
  });

  const hayAnalisis = analisis?.estado === "listo";
  const procesando = validacion?.estado === "procesando" || pedir.isPending;
  const r = validacion?.estado === "listo" ? validacion.resultado : null;

  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <ShieldCheck size={15} /> Validar documentos
          </h2>
          <p className="text-xs text-gray-500">
            La IA revisa lo que vas a presentar contra lo que piden las bases:
            qué cumple, qué falta, qué está vencido y qué hay que revisar. La IA
            propone; la decisión de subir es tuya.
          </p>
        </div>
        <button
          type="button"
          onClick={() => pedir.mutate()}
          disabled={procesando || !hayAnalisis}
          title={!hayAnalisis ? "Primero analiza las bases" : undefined}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {procesando ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <ShieldCheck size={14} />
          )}
          {r || validacion?.estado === "error"
            ? "Volver a validar"
            : "Validar documentos"}
        </button>
      </div>

      {isPending ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : procesando ? (
        <p className="text-sm text-gray-600">
          Revisando los documentos… suele tardar entre 1 y 3 minutos.
        </p>
      ) : validacion?.estado === "error" ? (
        <p className="text-sm text-red-600">{validacion.error}</p>
      ) : !r ? (
        <p className="text-sm text-gray-500">
          {hayAnalisis
            ? "Sube lo que vas a presentar en «Mi postulación» y valídalo."
            : "Primero analiza las bases: la validación revisa su checklist."}
        </p>
      ) : (
        <Resultado r={r} />
      )}

      {validacion && validacion.estado !== "procesando" && (
        <p className="text-xs text-gray-400">
          {validacion.estado === "listo" ? "Validado" : "Intentado"} el{" "}
          {formatMomento(
            validacion.terminado_en ?? validacion.creado_en,
            "diaHora",
          )}
          {validacion.modelo ? ` con ${validacion.modelo}` : ""}
          {` · revisó ${validacion.archivos.length} ${validacion.archivos.length === 1 ? "archivo" : "archivos"} de la postulación`}
          {validacion.costo_usd != null &&
            ` · costó ${textoDeCosto(validacion.costo_usd)}`}
          {validacion.no_leidos.length > 0 &&
            ` · no leyó: ${validacion.no_leidos.map((n) => n.nombre).join(", ")}`}
        </p>
      )}
    </section>
  );
}

function Resultado({ r }: { readonly r: ResultadoDeValidacion }) {
  const listo = LISTO_PARA_POSTULAR[r.listo];
  const conteo = contarPorEstadoDeValidacion(r.requisitos);
  return (
    <div className="space-y-4">
      <div className={`p-3 rounded-lg border ${listo.clases}`}>
        <p className="text-sm font-semibold">{listo.titulo}</p>
        <p className="text-sm">{r.resumen}</p>
        <p className="mt-1 text-xs">
          {ESTADOS_DE_VALIDACION.filter((e) => conteo[e.value] > 0)
            .map((e) => `${conteo[e.value]} ${e.plural}`)
            .join(" · ")}
        </p>
      </div>

      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {r.requisitos.map((q, i) => {
          const estado =
            ESTADOS_DE_VALIDACION.find((e) => e.value === q.estado) ??
            ESTADOS_DE_VALIDACION[3];
          return (
            <li key={`${q.que}-${i}`} className="px-3 py-2 flex gap-3">
              <span
                className={`shrink-0 mt-0.5 px-2 py-0.5 h-fit text-xs font-semibold rounded ${estado.clases}`}
              >
                {estado.label}
              </span>
              <div className="min-w-0">
                <p className="text-sm text-gray-900">{q.que}</p>
                <p className="text-xs text-gray-500">
                  {q.observacion}
                  {q.donde && ` · ${q.donde}`}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {r.otros_problemas.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-gray-900">
            Otros problemas
          </h3>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-0.5">
            {r.otros_problemas.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
