import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Scale, Sparkles, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import ConfirmInline from "../../components/ConfirmInline";
import { toast } from "../../components/toast/Toast";
import { useArrastreDeArchivos } from "../../hooks/useArrastreDeArchivos";
import {
  type ComparacionDeOfertas as Comparacion,
  getComparacion,
  type OferenteComparado,
  pedirComparacion,
  subirOfertaDeCompetidor,
} from "../../services/comparacion.service";
import {
  type AdjuntoDeOportunidad,
  borrarAdjunto,
  getAdjuntos,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";
import IncumplimientosGraves from "./IncumplimientosGraves";
import { tamanoLegible, textoDeCosto } from "./oportunidades.utils";

// LA COMPARACIÓN DE OFERTAS (decisión 41 del doc 17, 19-10). Felipe: "para
// poder descargar toda la información que haya subido otro posible
// competidor y analizar la probabilidad de quién se va a adjudicar la
// licitación en base a los criterios de evaluación... cargamos ambas
// ofertas, la mía va a salir de acá, la otra la descargo y la sumo". Tu
// oferta sale de «Mi postulación»; las de los demás se suben aquí, cada
// una con el nombre de su oferente. La IA pone la nota de cada criterio y
// el motor calcula los puntajes con los pesos de las bases. Desde la
// decisión 59, cada oferta muestra sus incumplimientos graves y, en la de un
// competidor, el reclamo para el Centro de Ayuda (`IncumplimientosGraves`).

const CUMPLE: Record<
  OferenteComparado["cumple_bases"],
  { texto: string; clases: string }
> = {
  si: { texto: "Cumple las bases", clases: "bg-green-100 text-green-800" },
  no: { texto: "Queda fuera de bases", clases: "bg-red-100 text-red-800" },
  dudoso: { texto: "Por confirmar", clases: "bg-amber-100 text-amber-800" },
};

const claveDeLaComparacion = (id: number) => [
  "oportunidades",
  "comparacion",
  id,
];
const claveDeLaCompetencia = (id: number) => [
  "oportunidades",
  "adjuntos",
  id,
  "competencia",
];

export default function ComparacionDeOfertas({
  oportunidadId,
  adjudicada,
}: {
  readonly oportunidadId: number;
  /** Ya adjudicada: no se ofrece el reclamo, sino el camino del Tribunal. */
  readonly adjudicada: boolean;
}) {
  const qc = useQueryClient();
  const { data: competencia = [] } = useQuery({
    queryKey: claveDeLaCompetencia(oportunidadId),
    queryFn: () => getAdjuntos(oportunidadId, "competencia"),
  });
  const { data: mias = [] } = useQuery({
    queryKey: ["oportunidades", "adjuntos", oportunidadId, "postulacion"],
    queryFn: () => getAdjuntos(oportunidadId, "postulacion"),
  });
  const { data: trabajo } = useQuery({
    queryKey: claveDeLaComparacion(oportunidadId),
    queryFn: () => getComparacion(oportunidadId),
    refetchInterval: (q) =>
      q.state.data?.estado === "procesando" ? 5000 : false,
  });

  const comparar = useMutation({
    mutationFn: () => pedirComparacion(oportunidadId),
    onSuccess: (fila) =>
      qc.setQueryData(claveDeLaComparacion(oportunidadId), fila),
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo pedir la comparación.")),
  });

  const procesando = trabajo?.estado === "procesando" || comparar.isPending;
  const r = trabajo?.estado === "listo" ? trabajo.resultado : null;
  const porCompetidor = new Map<string, AdjuntoDeOportunidad[]>();
  for (const a of competencia) {
    const quien = a.competidor?.trim() || "Sin nombre";
    porCompetidor.set(quien, [...(porCompetidor.get(quien) ?? []), a]);
  }

  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-5">
      <div className="space-y-0.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Scale size={15} /> Comparación de ofertas
        </h2>
        <p className="text-xs text-gray-500">
          Baja del cuadro de ofertas de Mercado Público lo que presentaron los
          demás y súbelo aquí, con el nombre de cada oferente. La IA compara
          cada oferta con la tuya según los criterios de evaluación de las
          bases: la nota de cada criterio, el puntaje y quién tiene más
          probabilidades de ganar.
        </p>
      </div>

      <p className="text-sm text-gray-700">
        <span className="font-semibold">Tu oferta:</span>{" "}
        {mias.length > 0
          ? `lo que está en «Mi postulación» (${mias.length} ${mias.length === 1 ? "archivo" : "archivos"}).`
          : "todavía no hay nada en «Mi postulación»: arma o sube lo que presentaste."}
      </p>

      <Competencia
        oportunidadId={oportunidadId}
        porCompetidor={porCompetidor}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => comparar.mutate()}
          disabled={procesando || competencia.length === 0}
          title={
            competencia.length === 0
              ? "Sube primero la oferta de al menos un competidor"
              : undefined
          }
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {procesando ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          {r || trabajo?.estado === "error"
            ? "Volver a comparar"
            : "Comparar con IA"}
        </button>
        {procesando && (
          <p className="text-sm text-gray-600">
            La IA está leyendo las ofertas… suele tardar entre 2 y 5 minutos.
            Puedes seguir en otra pantalla.
          </p>
        )}
      </div>

      {trabajo?.estado === "error" && (
        <p className="text-sm text-red-600">{trabajo.error}</p>
      )}
      {r && <Resultado r={r} adjudicada={adjudicada} />}
      {trabajo && trabajo.estado !== "procesando" && (
        <p className="text-xs text-gray-400">
          {trabajo.estado === "listo" ? "Comparado" : "Intentado"} el{" "}
          {formatMomento(trabajo.terminado_en ?? trabajo.creado_en, "diaHora")}
          {trabajo.modelo ? ` con ${trabajo.modelo}` : ""}
          {trabajo.costo_usd != null &&
            ` · costó ${textoDeCosto(trabajo.costo_usd)}`}
          {trabajo.no_leidos.length > 0 &&
            ` · no leyó: ${trabajo.no_leidos.map((n) => `${n.nombre} (${n.motivo})`).join("; ")}`}
        </p>
      )}
    </section>
  );
}

/** Las ofertas de los demás: agregar una (nombre + archivos) y verlas. */
function Competencia({
  oportunidadId,
  porCompetidor,
}: {
  readonly oportunidadId: number;
  readonly porCompetidor: Map<string, AdjuntoDeOportunidad[]>;
}) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState("");
  const [borrando, setBorrando] = useState<number | null>(null);
  const elegir = useRef<HTMLInputElement>(null);
  const refrescar = () =>
    qc.invalidateQueries({ queryKey: claveDeLaCompetencia(oportunidadId) });

  const subir = useMutation({
    mutationFn: async (archivos: File[]) => {
      for (const a of archivos) {
        await subirOfertaDeCompetidor(oportunidadId, a, nombre.trim());
      }
      return archivos.length;
    },
    onSuccess: (n) => {
      toast.success(n === 1 ? "Archivo subido." : `${n} archivos subidos.`);
      void refrescar();
    },
    onError: (e) => {
      toast.error(humanizeApiError(e, "No se pudo subir."));
      void refrescar();
    },
  });
  const borrar = useMutation({
    mutationFn: (adjuntoId: number) => borrarAdjunto(oportunidadId, adjuntoId),
    onSuccess: () => {
      setBorrando(null);
      void refrescar();
    },
    onError: (e) => toast.error(humanizeApiError(e, "No se pudo eliminar.")),
  });

  const sinNombre = nombre.trim() === "";
  const recibir = (archivos: File[]) => {
    if (sinNombre) {
      toast.error("Escribe primero de qué oferente es la oferta.");
      return;
    }
    subir.mutate(archivos);
  };
  const { arrastrando, zona } = useArrastreDeArchivos(recibir, {
    desactivado: subir.isPending,
  });

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">
        La competencia ({porCompetidor.size})
      </h3>
      {[...porCompetidor].map(([quien, archivos]) => (
        <div
          key={quien}
          className="p-3 rounded-lg border border-gray-200 space-y-1"
        >
          <p className="text-sm font-semibold text-gray-800">{quien}</p>
          <ul className="space-y-1">
            {archivos.map((a) => (
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
        </div>
      ))}

      <div
        {...zona}
        className={`p-4 rounded-lg border-2 border-dashed space-y-2 ${
          arrastrando ? "border-blue-400 bg-blue-50" : "border-gray-200"
        }`}
      >
        <label className="block text-xs font-semibold text-gray-600">
          De qué oferente es la oferta
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Por ejemplo, Sol de Quillón SpA"
            maxLength={200}
            className="mt-1 w-full px-3 py-2 text-sm font-normal text-gray-900 border border-gray-300 rounded-lg"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => elegir.current?.click()}
            disabled={sinNombre || subir.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            {subir.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Upload size={14} />
            )}
            Elegir sus archivos
          </button>
          <p className="text-xs text-gray-500">
            o arrástralos aquí · PDF o Word (la IA lee esos), hasta 30 MB cada
            uno
          </p>
        </div>
        <input
          ref={elegir}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const archivos = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (archivos.length > 0) recibir(archivos);
          }}
        />
      </div>
    </div>
  );
}

function Resultado({
  r,
  adjudicada,
}: {
  readonly r: Comparacion;
  readonly adjudicada: boolean;
}) {
  const ganador = r.oferentes.find((o) => o.nombre === r.ganador_probable);
  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 space-y-1">
        <p className="text-sm font-semibold text-blue-900">
          Lo más probable: gana {r.ganador_probable}
          {ganador ? ` (${ganador.probabilidad}%)` : ""}
        </p>
        <p className="text-sm text-blue-900">{r.resumen}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
              <th className="py-1.5 pr-3 font-semibold">Criterio</th>
              {r.oferentes.map((o) => (
                <th
                  key={o.nombre}
                  className={`py-1.5 px-2 font-semibold ${o.es_tuya ? "text-blue-700" : ""}`}
                >
                  {o.nombre}
                  {o.es_tuya ? " (tú)" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            <tr>
              <td className="py-1.5 pr-3 text-gray-600">Precio</td>
              {r.oferentes.map((o) => (
                <td key={o.nombre} className="py-1.5 px-2 text-gray-900">
                  {o.precio}
                </td>
              ))}
            </tr>
            <tr>
              <td className="py-1.5 pr-3 text-gray-600">Bases</td>
              {r.oferentes.map((o) => (
                <td key={o.nombre} className="py-1.5 px-2">
                  <span
                    className={`px-1.5 py-0.5 text-xs font-semibold rounded ${CUMPLE[o.cumple_bases].clases}`}
                    title={o.por_que || undefined}
                  >
                    {CUMPLE[o.cumple_bases].texto}
                  </span>
                </td>
              ))}
            </tr>
            {r.criterios.map((c, i) => (
              <tr key={c.nombre}>
                <td className="py-1.5 pr-3 text-gray-700">
                  {c.nombre}{" "}
                  <span className="text-xs text-gray-400">({c.peso}%)</span>
                </td>
                {r.oferentes.map((o) => {
                  const n = o.notas.find((x) => x.criterio === i + 1);
                  return (
                    <td
                      key={o.nombre}
                      className="py-1.5 px-2 text-gray-900"
                      title={n?.fundamento}
                    >
                      {n ? n.nota : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-1.5 pr-3 text-gray-900">Puntaje (de 100)</td>
              {r.oferentes.map((o) => (
                <td key={o.nombre} className="py-1.5 px-2 text-gray-900">
                  {o.puntaje.toLocaleString("es-CL")}
                </td>
              ))}
            </tr>
            <tr className="font-semibold">
              <td className="py-1.5 pr-3 text-gray-900">
                Probabilidad de ganar
              </td>
              {r.oferentes.map((o) => (
                <td key={o.nombre} className="py-1.5 px-2 text-gray-900">
                  {o.probabilidad}%
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {r.oferentes.map((o) => (
          <div
            key={o.nombre}
            className={`p-3 rounded-lg border space-y-2 ${o.es_tuya ? "border-blue-200" : "border-gray-200"}`}
          >
            <p className="text-sm font-semibold text-gray-900">
              {o.nombre}
              {o.es_tuya ? " (tú)" : ""}
            </p>
            {o.por_que && <p className="text-xs text-red-700">{o.por_que}</p>}
            <IncumplimientosGraves oferente={o} adjudicada={adjudicada} />
            <Lista titulo="Le suma" cosas={o.fortalezas} />
            <Lista titulo="Le resta" cosas={o.debilidades} />
            <details className="text-xs text-gray-600">
              <summary className="cursor-pointer font-semibold">
                Por qué cada nota
              </summary>
              <ul className="mt-1 space-y-0.5">
                {o.notas.map((n) => (
                  <li key={n.criterio}>
                    <span className="font-semibold">
                      {r.criterios[n.criterio - 1]?.nombre ??
                        `Criterio ${n.criterio}`}
                      :
                    </span>{" "}
                    {n.nota} · {n.fundamento}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        ))}
      </div>

      <Lista titulo="Para la próxima" cosas={r.para_la_proxima} />
    </div>
  );
}

const Lista = ({
  titulo,
  cosas,
}: {
  readonly titulo: string;
  readonly cosas: readonly string[];
}) =>
  cosas.length === 0 ? null : (
    <div className="space-y-0.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {titulo}
      </p>
      <ul className="list-disc pl-5 text-sm text-gray-800 space-y-0.5">
        {cosas.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  );
