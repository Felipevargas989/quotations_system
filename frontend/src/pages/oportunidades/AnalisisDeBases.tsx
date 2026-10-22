import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Sparkles,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "../../components/toast/Toast";
import {
  type FichaDeOportunidad,
  getAdjuntos,
  getAnalisis,
  pedirAnalisis,
  type ResultadoDeBases,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";
import DocumentosAPresentar from "./DocumentosAPresentar";
import ExigenciasDeLaLicitacion from "./ExigenciasDeLaLicitacion";
import FormulariosDelAnalisis from "./FormulariosDelAnalisis";
import PreguntasALaIA from "./PreguntasALaIA";
import {
  alertasDelAnalisis,
  criteriosPorPeso,
  pesoComoNumero,
  textoDeCosto,
} from "./oportunidades.utils";

// LA IA LEE LAS BASES (doc 17, sprint 3, paso 1). El botón manda las bases y
// anexos subidos a Opus 5.5. El análisis corre por detrás (uno a tres
// minutos) y la pantalla pregunta cada 5 segundos.
//
// Ordenado el 17-10 (Felipe: "quedó muy desordenado... difícil de leer"):
// cómo te evalúan (barras por peso: "destacar criterios es importante"),
// lo que te deja fuera arriba (máximo 5), lo demás plegado, una sola lista
// de lo que hay que presentar con el estado de la validación al lado, y las
// fechas clave. Presupuesto, fecha del evento y lugar suben a "en una
// mirada", arriba de la ficha.
//
// Reordenado el 19-10 (Felipe: "lo que pide la licitación con el listado de
// documentos"): resumen, cómo te evalúan, lo que te deja fuera, los
// formularios, las EXIGENCIAS (con ✓ lo tengo / ✗ no puedo) y los
// DOCUMENTOS A PRESENTAR (cruzados con tu carpeta); después las fechas.
// «¿Puedo cumplir?» y la lista mezclada de lo que hay que presentar se
// juntaron en esas dos.

export default function AnalisisDeBases({
  oportunidadId,
  ficha,
}: {
  readonly oportunidadId: number;
  readonly ficha: Pick<
    FichaDeOportunidad,
    "estado" | "exigencias_marcadas" | "proceso"
  >;
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
            Análisis de las bases
          </h2>
          <p className="text-xs text-gray-500">
            La IA lee las bases y anexos que subiste. La IA propone; revisa
            siempre las bases.
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
        <Resultado r={r} oportunidadId={oportunidadId} ficha={ficha} />
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

      {adjuntos.length > 0 && <PreguntasALaIA oportunidadId={oportunidadId} />}
    </section>
  );
}

function Resultado({
  r,
  oportunidadId,
  ficha,
}: {
  readonly r: ResultadoDeBases;
  readonly oportunidadId: number;
  readonly ficha: Pick<
    FichaDeOportunidad,
    "estado" | "exigencias_marcadas" | "proceso"
  >;
}) {
  const { dejanFuera, condiciones, separadas } = alertasDelAnalisis(r);
  return (
    <div className="space-y-5">
      {r.resumen && <p className="text-sm text-gray-800">{r.resumen}</p>}

      {r.criterios.length > 0 && <Criterios criterios={r.criterios} />}

      {dejanFuera.length > 0 && (
        <div className="p-3 rounded-lg border border-red-200 bg-red-50/60 space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-red-800">
            <AlertTriangle size={14} /> Lo que te puede dejar fuera
          </p>
          <ul className="divide-y divide-red-100 text-sm text-red-900">
            {dejanFuera.map((a, i) => (
              <li key={i} className="py-1.5">
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(r.formularios?.length ?? 0) > 0 && (
        <FormulariosDelAnalisis formularios={r.formularios ?? []} />
      )}

      <ExigenciasDeLaLicitacion
        oportunidadId={oportunidadId}
        r={r}
        marcas={ficha.exigencias_marcadas ?? {}}
        postulada={["postulada", "ganada"].includes(ficha.estado)}
      />

      <DocumentosAPresentar
        oportunidadId={oportunidadId}
        r={r}
        cierre={ficha.proceso.fecha_cierre ?? null}
      />

      {condiciones.length > 0 && (
        <Plegable
          titulo={
            separadas
              ? `Otras condiciones (${condiciones.length}): multas, pago, subcontratación…`
              : `Avisos (${condiciones.length}). Vuelve a analizar para separar lo que te deja fuera.`
          }
        >
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-0.5">
            {condiciones.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Plegable>
      )}

      {r.fechas.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">Fechas clave</h3>
          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {r.fechas.map((f, i) => (
              <div key={i} className="p-2 rounded-lg bg-gray-50">
                <dt className="text-xs text-gray-500">{f.que}</dt>
                <dd className="text-sm font-medium text-gray-900">
                  {f.cuando}
                </dd>
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
  );
}

/** Cómo te evalúan: una barra por criterio, del más pesado al más liviano,
 *  y el detalle de cada uno plegado. */
function Criterios({
  criterios,
}: {
  readonly criterios: ResultadoDeBases["criterios"];
}) {
  const ordenados = criteriosPorPeso(criterios);
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900">Cómo te evalúan</h3>
      <ul className="space-y-1.5">
        {ordenados.map((c, i) => {
          const peso = pesoComoNumero(c.peso);
          return (
            <li
              key={`${c.nombre}-${i}`}
              className="grid grid-cols-[minmax(0,18rem)_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm"
            >
              <span className="truncate text-gray-900" title={c.nombre}>
                {c.nombre}
              </span>
              <span className="h-2 rounded bg-gray-100">
                <span
                  className="block h-2 rounded bg-blue-600"
                  style={{ width: `${Math.min(100, Math.max(0, peso))}%` }}
                />
              </span>
              <span className="text-right font-bold text-gray-900">
                {c.peso || "—"}
              </span>
            </li>
          );
        })}
      </ul>
      <Plegable titulo="Ver cómo se calcula cada uno">
        <dl className="space-y-1.5 text-sm">
          {ordenados.map((c, i) => (
            <div key={`${c.nombre}-${i}`}>
              <dt className="font-medium text-gray-900">
                {c.nombre}
                {c.peso && ` (${c.peso})`}
              </dt>
              <dd className="text-gray-600">{c.como_se_evalua || "—"}</dd>
            </div>
          ))}
        </dl>
      </Plegable>
    </div>
  );
}

function Plegable({
  titulo,
  children,
}: {
  readonly titulo: string;
  readonly children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
      >
        {abierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {titulo}
      </button>
      {abierto && children}
    </div>
  );
}
