import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { Plus } from "lucide-react";
import Estrellas from "../../components/Estrellas";
import { toast } from "../../components/toast/Toast";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import { createReview, getReviews } from "../../services/people.service";
import { eventosQueryOptions } from "./FichasTab";
import type { Persona } from "../../types/people.types";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatISOUTCDateToString } from "../../utils/dates";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
);

/** El color de una nota: verde arriba, ámbar al medio, rojo abajo. Es
 *  el mismo semáforo que uno haría con la mano. */
const colorDeNota = (n: number) =>
  n >= 4.5 ? "#059669" : n >= 3.5 ? "#2563eb" : n >= 2.5 ? "#d97706" : "#dc2626";

// CÓMO TRABAJA ESTA PERSONA — sus evaluaciones
//
// Tres reglas de la arquitectura que esta pantalla respeta:
//
//  · Se muestra el PROMEDIO SIMPLE, sin fórmulas ponderadas escondidas.
//  · "Sin evaluar" NO es lo mismo que malo: de 186 personas, 98 salieron
//    a $100.000 o menos en todo el historial, así que media lista va a
//    estar sin estrellas por mucho tiempo. No se le pone un cero.
//  · Una NOTA puede ir sin estrella ("solo fines de semana", "no
//    maneja"): son datos útiles que no son una calificación, y entran
//    igual al registro.
//
// La tendencia importa más que el promedio: lo que se quiere ver es a
// quién va bajando, no quién tiene 4,2.

export default function EvaluacionesDePersona({
  persona,
}: {
  readonly persona: Persona;
}) {
  const qc = useQueryClient();
  const [evaluando, setEvaluando] = useState(false);
  const [estrellas, setEstrellas] = useState<number | null>(null);
  const [nota, setNota] = useState("");
  const [evento, setEvento] = useState("");

  const { data: evaluaciones = [], isLoading } = useQuery({
    queryKey: ["people", "reviews", persona.id],
    queryFn: () => getReviews(persona.id),
  });
  const { data: eventos = [] } = useQuery(eventosQueryOptions);

  const nombreEvento = useMemo(() => {
    const m = new Map(
      eventos.map((q) => [q.id, `N° ${String(q.numero)} · ${q.cliente}`]),
    );
    return (id: string | null) => (id ? (m.get(id) ?? "Evento") : null);
  }, [eventos]);

  // El promedio SIMPLE, solo sobre las que llevan estrella.
  const conEstrella = evaluaciones.filter((e) => e.stars !== null);
  const promedio =
    conEstrella.length > 0
      ? conEstrella.reduce((t, e) => t + (e.stars ?? 0), 0) / conEstrella.length
      : null;

  // La tendencia va de la más vieja a la más nueva.
  const tendencia = [...conEstrella].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  const guardar = useMutation({
    mutationFn: () =>
      createReview({
        person_id: persona.id,
        quotation_id: evento || null,
        stars: estrellas,
        note: nota.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Evaluación guardada.");
      setEvaluando(false);
      setEstrellas(null);
      setNota("");
      setEvento("");
      void qc.invalidateQueries({ queryKey: ["people", "reviews"] });
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  if (isLoading) {
    return <p className="text-sm text-gray-500">Cargando sus evaluaciones…</p>;
  }

  return (
    <div className="space-y-5">
      {/* El promedio, grande. Sin evaluar se dice, no se castiga. */}
      <div className="flex items-center justify-between gap-4 flex-wrap border border-gray-200 rounded-xl px-4 py-3">
        <div className="flex items-center gap-3">
          {promedio === null ? (
            <div>
              <p className="text-lg font-semibold text-gray-500">Sin evaluar</p>
              <p className="text-xs text-gray-400">
                No es lo mismo que mala: todavía nadie la ha evaluado.
              </p>
            </div>
          ) : (
            <>
              <span className="text-3xl font-bold text-gray-900 tabular-nums">
                {promedio.toLocaleString("es-CL", {
                  maximumFractionDigits: 1,
                })}
              </span>
              <div>
                <Estrellas value={promedio} />
                <p className="text-xs text-gray-500 mt-0.5">
                  promedio de {conEstrella.length}{" "}
                  {conEstrella.length === 1 ? "evaluación" : "evaluaciones"}
                </p>
              </div>
            </>
          )}
        </div>
        {!evaluando && (
          <button
            type="button"
            onClick={() => setEvaluando(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Evaluar
          </button>
        )}
      </div>

      {/* Evaluar desde acá, sin esperar a cerrar una ficha. */}
      {evaluando && (
        <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-gray-900">
              ¿Qué tal trabajó?
            </span>
            <Estrellas
              value={estrellas}
              onChange={(n) => setEstrellas(estrellas === n ? null : n)}
            />
            <span className="text-xs text-gray-500">
              o deja solo una nota, sin estrellas
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Solo fines de semana · no maneja · llegó tarde…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              aria-label="Nota de la evaluación"
            />
            <SelectWithSearch
              options={eventos.map((q) => ({
                value: q.id,
                label: `N° ${String(q.numero)} · ${q.cliente}`,
              }))}
              value={evento}
              onChange={setEvento}
              placeholder="¿En qué evento? (opcional)"
              mostrarConteo={false}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEvaluando(false);
                setEstrellas(null);
                setNota("");
                setEvento("");
              }}
              className="px-3 py-2 text-sm text-gray-600 hover:bg-white rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => guardar.mutate()}
              disabled={(!estrellas && !nota.trim()) || guardar.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
            >
              {guardar.isPending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      )}

      {/* La tendencia: lo que importa es si va bajando. */}
      {tendencia.length >= 2 && (
        <div className="border border-gray-200 rounded-xl p-4">
          <div className="flex items-baseline justify-between mb-1">
            <p className="text-sm font-medium text-gray-900">
              Cómo ha ido en el tiempo
            </p>
            {/* La comparación que de verdad importa: sus últimas tres
                contra el resto. Un promedio alto puede esconder una
                caída, y es justo lo que hay que ver a tiempo. */}
            {tendencia.length >= 4 &&
              (() => {
                const ultimas = tendencia.slice(-3);
                const antes = tendencia.slice(0, -3);
                const prom = (xs: typeof tendencia) =>
                  xs.reduce((t, e) => t + (e.stars ?? 0), 0) / xs.length;
                const dif = prom(ultimas) - prom(antes);
                if (Math.abs(dif) < 0.5) {
                  return (
                    <span className="text-xs text-gray-500">
                      se mantiene pareja
                    </span>
                  );
                }
                return (
                  <span
                    className={`text-xs font-medium ${
                      dif > 0 ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {dif > 0 ? "va subiendo" : "va bajando"} ·{" "}
                    {dif > 0 ? "+" : ""}
                    {dif.toLocaleString("es-CL", {
                      maximumFractionDigits: 1,
                    })}{" "}
                    en las últimas 3
                  </span>
                );
              })()}
          </div>
          <div className="h-40">
            <Line
              data={{
                labels: tendencia.map((e) =>
                  new Date(`${e.created_at.slice(0, 10)}T12:00:00Z`)
                    .toLocaleDateString("es-CL", {
                      day: "numeric",
                      month: "short",
                      timeZone: "UTC",
                    })
                    .replace(".", ""),
                ),
                datasets: [
                  {
                    data: tendencia.map((e) => e.stars ?? 0),
                    borderColor: "#2563eb",
                    borderWidth: 2,
                    // Recta entre evaluaciones: la curva sugería notas
                    // intermedias que nunca existieron.
                    tension: 0,
                    fill: true,
                    backgroundColor: "rgba(37, 99, 235, 0.08)",
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointBackgroundColor: tendencia.map((e) =>
                      colorDeNota(e.stars ?? 0),
                    ),
                    pointBorderColor: "#fff",
                    pointBorderWidth: 2,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 8, right: 8 } },
                scales: {
                  y: {
                    // De 1 a 5: nadie da cero estrellas, y arrancar en 0
                    // aplastaba toda la variación contra el techo.
                    min: 1,
                    max: 5,
                    ticks: {
                      stepSize: 1,
                      callback: (v) => `${String(v)} ★`,
                      color: "#9ca3af",
                      font: { size: 11 },
                    },
                    grid: { color: "#f3f4f6" },
                    border: { display: false },
                  },
                  x: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: { color: "#9ca3af", font: { size: 11 } },
                  },
                },
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    displayColors: false,
                    callbacks: {
                      label: (ctx: { dataIndex: number; parsed: { y: number } }) => {
                        const e = tendencia[ctx.dataIndex];
                        const estrellas = `${String(ctx.parsed.y)} de 5`;
                        return e.note ? [estrellas, e.note] : estrellas;
                      },
                    },
                  },
                },
              }}
            />
          </div>
        </div>
      )}

      {/* El registro completo, incluidas las notas sin estrella. */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1.5">
          Registro
        </h3>
        {evaluaciones.length === 0 ? (
          <p className="text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-6 text-center">
            Todavía no tiene evaluaciones. Se evalúa al cerrar la ficha de un
            evento, o acá con el botón de arriba.
          </p>
        ) : (
          <ul className="border border-gray-200 rounded-xl divide-y divide-gray-100">
            {evaluaciones.map((e) => (
              <li key={e.id} className="px-4 py-2.5">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-gray-500 tabular-nums w-24">
                    {formatISOUTCDateToString(e.created_at.slice(0, 10))}
                  </span>
                  {e.stars !== null ? (
                    <Estrellas value={e.stars} tamano="sm" />
                  ) : (
                    <span className="text-xs text-gray-400">solo una nota</span>
                  )}
                  {nombreEvento(e.quotation_id) && (
                    <span className="text-xs text-gray-500">
                      {nombreEvento(e.quotation_id)}
                    </span>
                  )}
                </div>
                {e.note && (
                  <p className="text-sm text-gray-700 mt-0.5">{e.note}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
