import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleHelp, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "../../components/toast/Toast";
import {
  getPreguntas,
  type PreguntaALaIA,
  preguntar,
} from "../../services/preguntas.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";
import { textoDeCosto } from "./oportunidades.utils";

// PREGÚNTALE A LA IA SOBRE ESTAS BASES (doc 17, decisión 67, 22-10).
// Felipe: "no tengo cómo preguntar ni interactuar... la idea es poder
// precisar cosas y que no vuelva a releer todo". Un cuadro bajo el análisis
// de las bases: la pregunta queda "procesando" y la pantalla pregunta cada
// pocos segundos hasta que llega la respuesta, con sus citas (documento y
// página) y lo que costó. El hilo es de la oportunidad: lo ve todo el
// equipo. Las bases van en caché de contexto en el motor; aquí solo se ve
// «con las bases en caché» cuando la respuesta las leyó de ahí.

export const MIN_LARGO = 3;
export const MAX_LARGO = 600;
/** Cuántas se ven de partida (las más nuevas); el resto, con un clic. */
const DE_PARTIDA = 3;

const SEGURIDAD: Record<NonNullable<PreguntaALaIA["seguridad"]>, string> = {
  alta: "Lo dicen los documentos",
  media: "Es una deducción",
  baja: "No está en los documentos",
};

export default function PreguntasALaIA({
  oportunidadId,
}: {
  readonly oportunidadId: number;
}) {
  const qc = useQueryClient();
  const clave = ["oportunidades", "preguntas", oportunidadId];
  const { data: hilo = [] } = useQuery({
    queryKey: clave,
    queryFn: () => getPreguntas(oportunidadId),
    refetchInterval: (q) =>
      q.state.data?.some((p) => p.estado === "procesando") ? 3000 : false,
  });
  const [texto, setTexto] = useState("");
  const [falta, setFalta] = useState<string | null>(null);
  const [todas, setTodas] = useState(false);

  const enviar = useMutation({
    mutationFn: (pregunta: string) => preguntar(oportunidadId, pregunta),
    onSuccess: (nueva) => {
      qc.setQueryData<PreguntaALaIA[]>(clave, (viejo = []) => [
        ...viejo,
        nueva,
      ]);
      setTexto("");
    },
    onError: (e) => toast.error(humanizeApiError(e, "No se pudo preguntar.")),
  });

  const procesando =
    hilo.some((p) => p.estado === "procesando") || enviar.isPending;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const limpia = texto.trim();
    if (limpia.length < MIN_LARGO) {
      setFalta("Escribe la pregunta primero.");
      return;
    }
    if (limpia.length > MAX_LARGO) {
      setFalta(`La pregunta no puede pasar de ${MAX_LARGO} letras.`);
      return;
    }
    setFalta(null);
    enviar.mutate(limpia);
  };

  const recientes = [...hilo].reverse();
  const visibles = todas ? recientes : recientes.slice(0, DE_PARTIDA);
  const ocultas = recientes.length - visibles.length;

  return (
    <div className="pt-4 border-t border-gray-100 space-y-3">
      <div className="space-y-0.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <CircleHelp size={15} /> Pregúntale a la IA sobre estas bases
        </h3>
        <p className="text-xs text-gray-500">
          Responde con las bases y el análisis a la vista, citando documento y
          página. Lo que preguntes queda aquí, para todo el equipo.
        </p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-wrap gap-2">
        <input
          type="text"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            if (falta) setFalta(null);
          }}
          placeholder="¿Las colaciones son por día o en total?"
          aria-label="Pregunta"
          maxLength={MAX_LARGO}
          className="flex-1 min-w-[16rem] px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={procesando}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {procesando ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : null}
          {procesando ? "Respondiendo…" : "Preguntar"}
        </button>
      </form>
      {falta && <p className="text-xs text-red-600">{falta}</p>}

      {visibles.length > 0 && (
        <ul className="space-y-3">
          {visibles.map((p) => (
            <Pregunta key={p.id} p={p} />
          ))}
        </ul>
      )}
      {ocultas > 0 && (
        <button
          type="button"
          onClick={() => setTodas(true)}
          className="text-xs font-semibold text-blue-700 hover:underline"
        >
          Ver las {ocultas} anteriores
        </button>
      )}
    </div>
  );
}

function Pregunta({ p }: { readonly p: PreguntaALaIA }) {
  return (
    <li className="space-y-1.5">
      <div className="pl-3 border-l-2 border-gray-300">
        <p className="text-xs text-gray-400">
          {p.quien?.full_name ?? "Alguien"} ·{" "}
          {formatMomento(p.creado_en, "diaHora")}
        </p>
        <p className="text-sm text-gray-900">{p.pregunta}</p>
      </div>
      {p.estado === "procesando" ? (
        <p className="flex items-center gap-1.5 text-sm text-gray-600">
          <Loader2 size={14} className="animate-spin" aria-hidden /> Leyendo las
          bases…
        </p>
      ) : p.estado === "error" ? (
        <p className="text-sm text-red-600">
          {p.error ?? "No se pudo responder."}
        </p>
      ) : (
        <div className="p-3 rounded-lg bg-gray-50 space-y-1.5">
          <p className="text-sm text-gray-800 whitespace-pre-line">
            {p.respuesta}
          </p>
          {p.citas.length > 0 && (
            <ul className="text-xs text-gray-600 space-y-0.5">
              {p.citas.map((c, i) => (
                <li key={i}>
                  {c.texto ? `«${c.texto}» — ` : ""}
                  {c.documento}
                  {c.pagina > 0 ? `, pág. ${c.pagina}` : ""}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-gray-400">
            {p.seguridad ? SEGURIDAD[p.seguridad] : "Respondido"}
            {p.modelo ? ` · ${p.modelo}` : ""}
            {p.costo_usd != null ? ` · costó ${textoDeCosto(p.costo_usd)}` : ""}
            {(p.tokens_cache_leida ?? 0) > 0 ? " · con las bases en caché" : ""}
          </p>
        </div>
      )}
    </li>
  );
}
