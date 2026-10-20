import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Loader2, Sparkles, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import ConfirmInline from "../../components/ConfirmInline";
import { toast } from "../../components/toast/Toast";
import {
  getAprendizajes,
  pedirAprendizaje,
  type TipoDeDecision,
} from "../../services/aprendizajes.service";
import {
  borrarAdjunto,
  getAdjuntos,
  subirAdjunto,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";
import { tamanoLegible, textoDeCosto } from "./oportunidades.utils";

// LO QUE APRENDEMOS DE LA COMISIÓN (decisión 60 del doc 17, 20-10). Felipe:
// "las que vayamos licitando, vamos a ver si ganamos o perdemos, ir
// revisando las actas de adjudicación e ir entrenando la IA para que vaya
// afinando el ojo". Se sube el acta de evaluación y «Aprender del acta»
// anota cómo decidió la comisión y si la comparación acertó. Esa base solo
// la usa la comparación, para predecir: al postular mandan las bases.

const TIPO: Record<TipoDeDecision, { texto: string; clases: string }> = {
  estricta: { texto: "Estricta", clases: "bg-blue-50 text-blue-800" },
  flexible: { texto: "Flexible", clases: "bg-amber-100 text-amber-800" },
  contra_las_bases: {
    texto: "Contra las bases",
    clases: "bg-red-100 text-red-800",
  },
};

const PREDICCION = {
  acerto: { texto: "La comparación acertó", clases: "text-green-700" },
  fallo: { texto: "La comparación falló", clases: "text-red-700" },
  sin_prediccion: {
    texto: "No había comparación",
    clases: "text-gray-600",
  },
} as const;

const claveDelEstado = (id: number) => ["oportunidades", "aprendizajes", id];
const claveDeLasActas = (id: number) => [
  "oportunidades",
  "adjuntos",
  id,
  "acta",
];

const Decision = ({
  tipo,
  situacion,
  decision,
  codigo,
}: {
  readonly tipo: TipoDeDecision;
  readonly situacion: string;
  readonly decision: string;
  readonly codigo?: string;
}) => (
  <li className="text-sm text-gray-800">
    <span
      className={`mr-1.5 px-1.5 py-0.5 text-xs font-semibold rounded ${TIPO[tipo].clases}`}
    >
      {TIPO[tipo].texto}
    </span>
    {codigo && <span className="text-xs text-gray-400">{codigo} · </span>}
    {situacion} <span className="text-gray-500">→</span> {decision}
  </li>
);

export default function AprenderDelActa({
  oportunidadId,
}: {
  readonly oportunidadId: number;
}) {
  const qc = useQueryClient();
  const elegir = useRef<HTMLInputElement>(null);
  const [borrando, setBorrando] = useState<number | null>(null);
  const { data: estado } = useQuery({
    queryKey: claveDelEstado(oportunidadId),
    queryFn: () => getAprendizajes(oportunidadId),
    refetchInterval: (q) =>
      q.state.data?.trabajo?.estado === "procesando" ? 5000 : false,
  });
  const { data: actas = [] } = useQuery({
    queryKey: claveDeLasActas(oportunidadId),
    queryFn: () => getAdjuntos(oportunidadId, "acta"),
  });
  const refrescarActas = () =>
    qc.invalidateQueries({ queryKey: claveDeLasActas(oportunidadId) });

  const subir = useMutation({
    mutationFn: async (archivos: File[]) => {
      for (const a of archivos) await subirAdjunto(oportunidadId, a, "acta");
      return archivos.length;
    },
    onSuccess: (n) => {
      toast.success(n === 1 ? "Acta subida." : `${n} archivos subidos.`);
      void refrescarActas();
    },
    onError: (e) => {
      toast.error(humanizeApiError(e, "No se pudo subir el acta."));
      void refrescarActas();
    },
  });
  const borrar = useMutation({
    mutationFn: (adjuntoId: number) => borrarAdjunto(oportunidadId, adjuntoId),
    onSuccess: () => {
      setBorrando(null);
      void refrescarActas();
    },
    onError: (e) => toast.error(humanizeApiError(e, "No se pudo eliminar.")),
  });
  const aprender = useMutation({
    mutationFn: () => pedirAprendizaje(oportunidadId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: claveDelEstado(oportunidadId) }),
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo leer el acta.")),
  });

  const trabajo = estado?.trabajo ?? null;
  const procesando = trabajo?.estado === "procesando" || aprender.isPending;
  const r = trabajo?.estado === "listo" ? trabajo.resultado : null;
  const comision = estado?.comision ?? [];

  return (
    <div className="border-t border-gray-100 pt-4 space-y-3">
      <div className="space-y-0.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <GraduationCap size={15} /> Lo que aprendemos de la comisión
        </h3>
        <p className="text-xs text-gray-500">
          Cuando adjudiquen, sube el acta de evaluación (la bajas de Mercado
          Público). La IA anota cómo decidió la comisión y si la comparación
          acertó, y eso afina las próximas predicciones. Al postular, mandan las
          bases.
        </p>
      </div>

      {comision.length > 0 && (
        <details className="space-y-1">
          <summary className="cursor-pointer text-sm font-semibold text-gray-700">
            Cómo ha decidido esta comisión ({comision.length})
          </summary>
          <ul className="mt-1 space-y-1">
            {comision.map((a) => (
              <Decision
                key={a.id}
                tipo={a.tipo}
                situacion={a.situacion}
                decision={a.decision}
                codigo={a.codigo}
              />
            ))}
          </ul>
        </details>
      )}

      <ul className="space-y-1">
        {actas.map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center gap-2 text-sm text-gray-700"
          >
            <span className="min-w-0 break-all">{a.nombre}</span>
            <span className="text-xs text-gray-400">
              {tamanoLegible(a.bytes)}
            </span>
            {borrando === a.id ? (
              <ConfirmInline
                question="¿Eliminar este archivo?"
                onYes={() => borrar.mutate(a.id)}
                onNo={() => setBorrando(null)}
                busy={borrar.isPending}
              />
            ) : (
              <button
                type="button"
                onClick={() => setBorrando(a.id)}
                aria-label={`Eliminar ${a.nombre}`}
                className="text-gray-400 hover:text-red-600"
              >
                <Trash2 size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => elegir.current?.click()}
          disabled={subir.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
        >
          {subir.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Upload size={14} />
          )}
          Subir el acta
        </button>
        <button
          type="button"
          onClick={() => aprender.mutate()}
          disabled={procesando || actas.length === 0}
          title={actas.length === 0 ? "Sube primero el acta" : undefined}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {procesando ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          {r ? "Volver a aprender" : "Aprender del acta"}
        </button>
        {procesando && (
          <p className="text-sm text-gray-600">
            La IA está leyendo el acta… suele tardar uno o dos minutos.
          </p>
        )}
        <input
          ref={elegir}
          type="file"
          multiple
          accept=".pdf,.doc,.docx"
          className="hidden"
          onChange={(e) => {
            const archivos = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (archivos.length > 0) subir.mutate(archivos);
          }}
        />
      </div>

      {trabajo?.estado === "error" && (
        <p className="text-sm text-red-600">{trabajo.error}</p>
      )}
      {r && (
        <div className="p-3 rounded-lg border border-gray-200 space-y-2">
          <p className="text-sm">
            <span
              className={`font-semibold ${PREDICCION[r.prediccion].clases}`}
            >
              {PREDICCION[r.prediccion].texto}
            </span>
            <span className="text-gray-700"> · Ganó: {r.ganador}</span>
          </p>
          {r.por_que && <p className="text-sm text-gray-700">{r.por_que}</p>}
          <p className="text-sm text-gray-700">{r.resumen}</p>
          <ul className="space-y-1">
            {r.aprendizajes.map((a) => (
              <Decision
                key={a.situacion}
                tipo={a.tipo}
                situacion={a.situacion}
                decision={a.decision}
              />
            ))}
          </ul>
          <p className="text-xs text-gray-400">
            {r.guardados === 1
              ? "Quedó 1 decisión nueva en la base"
              : `Quedaron ${r.guardados} decisiones nuevas en la base`}
            {trabajo?.terminado_en
              ? ` · ${formatMomento(trabajo.terminado_en, "diaHora")}`
              : ""}
            {trabajo?.costo_usd != null &&
              ` · costó ${textoDeCosto(trabajo.costo_usd)}`}
          </p>
        </div>
      )}
      {estado && (
        <p className="text-xs text-gray-400">
          La base tiene {estado.total}{" "}
          {estado.total === 1 ? "decisión" : "decisiones"} de comisiones.
        </p>
      )}
    </div>
  );
}
