import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleHelp, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "../../components/toast/Toast";
import {
  confirmarPregunta,
  getPreguntas,
  type PreguntaALaIA,
  preguntar,
} from "../../services/preguntas.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";
import { entraALaPostulacion } from "./loAclarado";
import { textoDeCosto } from "./oportunidades.utils";

// PREGÚNTALE A LA IA SOBRE ESTAS BASES (doc 17, decisión 67, 22-10).
// Felipe: "no tengo cómo preguntar ni interactuar... la idea es poder
// precisar cosas y que no vuelva a releer todo". Un cuadro bajo el análisis
// de las bases: la pregunta queda "procesando" y la pantalla pregunta cada
// pocos segundos hasta que llega la respuesta, con sus citas (documento y
// página) y lo que costó. El hilo es de la oportunidad: lo ve todo el
// equipo. Las bases van en caché de contexto en el motor; aquí solo se ve
// «con las bases en caché» cuando la respuesta las leyó de ahí.
//
// LO ACLARADO MANDA (decisión 68, 22-10). Felipe: "una sola memoria por
// licitación". Lo que dicen los documentos entra solo a la postulación (la
// oferta, los documentos y la validación lo leen); una deducción o lo que
// no está entra solo cuando se anota lo que confirmó el comprador, en la
// línea bajo la respuesta.

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
  plegada = false,
}: {
  readonly oportunidadId: number;
  /** Dentro de un plegable con su título (decisión 80): sin título ni
   *  raya arriba. */
  readonly plegada?: boolean;
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

  const aclaradas = hilo.filter(entraALaPostulacion).length;
  const recientes = [...hilo].reverse();
  const visibles = todas ? recientes : recientes.slice(0, DE_PARTIDA);
  const ocultas = recientes.length - visibles.length;

  return (
    <div
      className={
        plegada ? "space-y-3" : "pt-4 border-t border-gray-100 space-y-3"
      }
    >
      <div className="space-y-0.5">
        {!plegada && (
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <CircleHelp size={15} /> Pregúntale a la IA sobre estas bases
          </h3>
        )}
        <p className="text-xs text-gray-500">
          Responde con las bases y el análisis a la vista, citando documento y
          página. Lo que preguntes queda aquí, para todo el equipo.
        </p>
        {aclaradas > 0 && (
          <p className="text-xs text-green-700">
            La postulación usa {aclaradas}{" "}
            {aclaradas === 1 ? "aclaración" : "aclaraciones"}: lo que dicen los
            documentos y lo que confirmó el comprador.
          </p>
        )}
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
            <Pregunta
              key={p.id}
              p={p}
              onConfirmado={(nueva) =>
                qc.setQueryData<PreguntaALaIA[]>(clave, (viejo = []) =>
                  viejo.map((x) => (x.id === nueva.id ? nueva : x)),
                )
              }
            />
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

function Pregunta({
  p,
  onConfirmado,
}: {
  readonly p: PreguntaALaIA;
  readonly onConfirmado: (nueva: PreguntaALaIA) => void;
}) {
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
          <LoQueConfirmo p={p} onConfirmado={onConfirmado} />
        </div>
      )}
    </li>
  );
}

/** Lo que confirmó el comprador (decisión 68): con eso, la respuesta entra
 *  a la postulación. Lo que dicen los documentos entra solo, y se puede
 *  corregir con lo que dijo el comprador. */
function LoQueConfirmo({
  p,
  onConfirmado,
}: {
  readonly p: PreguntaALaIA;
  readonly onConfirmado: (nueva: PreguntaALaIA) => void;
}) {
  const confirmado = p.confirmado?.trim() ?? "";
  const [editando, setEditando] = useState(
    !confirmado && p.seguridad !== "alta",
  );
  const [texto, setTexto] = useState(confirmado);
  const guardar = useMutation({
    mutationFn: (valor: string) =>
      confirmarPregunta(p.oportunidad_id, p.id, valor),
    onSuccess: (nueva) => {
      onConfirmado(nueva);
      setEditando(!nueva.confirmado?.trim() && nueva.seguridad !== "alta");
    },
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo guardar lo confirmado.")),
  });

  if (!editando) {
    return confirmado ? (
      <p className="text-xs text-green-800">
        <span className="font-semibold">Lo confirmó el comprador:</span>{" "}
        {confirmado} · entra a la postulación ·{" "}
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="font-semibold text-blue-700 hover:underline"
        >
          Cambiar
        </button>
      </p>
    ) : (
      <p className="text-xs text-green-800">
        Lo dicen los documentos: entra a la postulación ·{" "}
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="font-semibold text-blue-700 hover:underline"
        >
          Corregir con lo que dijo el comprador
        </button>
      </p>
    );
  }
  return (
    <div className="space-y-1">
      {!confirmado && p.seguridad !== "alta" && (
        <p className="text-xs text-amber-800">
          No entra a la postulación hasta que anotes lo que confirmó el
          comprador (en el foro o por teléfono).
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Lo que confirmó el comprador"
          aria-label="Lo que confirmó el comprador"
          maxLength={MAX_LARGO}
          className="flex-1 min-w-[14rem] px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => guardar.mutate(texto.trim())}
          disabled={guardar.isPending}
          className="px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          Guardar
        </button>
        {(confirmado || p.seguridad === "alta") && (
          <button
            type="button"
            onClick={() => {
              setTexto(confirmado);
              setEditando(false);
            }}
            className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-800"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}
