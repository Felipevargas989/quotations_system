import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { Lock, RotateCcw } from "lucide-react";
import { toast } from "../../components/toast/Toast";
import {
  getGraficosHistorico,
  getLiquidacionesPendientes,
  getPools,
  getSheets,
  reabrirLiquidacion,
} from "../../services/people.service";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const MES_CORTO = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];
const etiquetaMes = (mes: string) =>
  `${MES_CORTO[Number(mes.slice(5)) - 1]} ${mes.slice(2, 4)}`;
import type { Pozo } from "../../types/people.types";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatISOUTCDateToString } from "../../utils/dates";
import { clp } from "../postventa/PostVentaPage";
import { eventosQueryOptions } from "./FichasTab";

/**
 * EL HISTÓRICO DE PAGOS (Felipe, 24-08): "así la pestaña Liquidación es
 * puramente operativa". Todo lo resuelto vive acá y NADA desaparece:
 * los días "sin propina" quedan con su marca y su reabrir (antes se
 * esfumaban y un error no tenía arreglo), lo repartido espera la nómina
 * en verde, y lo que ya entró a una nómina queda con candado — lo
 * pagado no se toca. Los cierres administrativos del arranque
 * (migración 86) no son historia de nadie y no se listan.
 */
export default function HistoricoTab() {
  const { data: eventos = [] } = useQuery(eventosQueryOptions);
  const { data: sheets = [] } = useQuery({
    queryKey: ["people", "sheets"],
    queryFn: getSheets,
  });
  const { data: pools = [] } = useQuery({
    queryKey: ["people", "pools"],
    queryFn: getPools,
  });
  const { data: pendientes = [] } = useQuery({
    queryKey: ["people", "liquidaciones-pendientes"],
    queryFn: getLiquidacionesPendientes,
    staleTime: 0,
  });
  const qc = useQueryClient();
  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ["people"] });
  };

  const [confirmando, setConfirmando] = useState<string | null>(null);
  const reabrir = useMutation({
    mutationFn: (origen: { quotation_id?: string; day?: string }) =>
      reabrirLiquidacion(origen),
    onSuccess: (r) => {
      toast.success(
        r.reabierto === "dia"
          ? "Día reabierto: aparece de nuevo en Liquidación."
          : "Evento reabierto: aparece de nuevo en Liquidación.",
      );
      setConfirmando(null);
      refrescar();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  // Los días con plata esperando nómina y los eventos pendientes, para
  // pintar el estado sin preguntarle más al servidor.
  const diasEsperando = useMemo(
    () =>
      new Set(
        pendientes
          .filter((l) => l.tipo === "dia" && l.day)
          .map((l) => String(l.day).slice(0, 10)),
      ),
    [pendientes],
  );
  const eventosEsperando = useMemo(
    () =>
      new Map(
        pendientes
          .filter((l) => l.tipo === "evento" && l.quotation_id)
          .map((l) => [l.quotation_id, l.total]),
      ),
    [pendientes],
  );

  const diasResueltos = useMemo(
    () =>
      pools
        .filter((p) => p.day && !p.quotation_id && p.distributed_at)
        .sort((a, b) => String(b.day).localeCompare(String(a.day))),
    [pools],
  );

  const eventosLiquidados = useMemo(() => {
    const cerradas = new Map(
      sheets
        .filter((s) => s.closed_at && !s.cierre_administrativo)
        .map((s) => [s.quotation_id, s]),
    );
    return eventos
      .filter((q) => cerradas.has(q.id))
      .map((q) => ({ ...q, enNomina: !!cerradas.get(q.id)?.en_nomina }))
      .sort((a, b) => b.inicio.localeCompare(a.inicio));
  }, [eventos, sheets]);

  const totalDe = (p: Pozo) =>
    Number(p.first_amount) + Number(p.second_amount);

  const BotonReabrir = ({
    clave,
    onConfirmar,
  }: {
    readonly clave: string;
    readonly onConfirmar: () => void;
  }) =>
    confirmando === clave ? (
      <span className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onConfirmar}
          disabled={reabrir.isPending}
          className="text-xs px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {reabrir.isPending ? "Reabriendo…" : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmando(null)}
          className="text-xs px-2 py-1 rounded-md text-gray-500 hover:bg-gray-100"
        >
          Cancelar
        </button>
      </span>
    ) : (
      <button
        type="button"
        onClick={() => setConfirmando(clave)}
        title="Vuelve a Liquidación para corregirlo"
        className="shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded-md text-gray-500 border border-gray-200 hover:bg-gray-50"
      >
        <RotateCcw className="w-3 h-3" /> Reabrir
      </button>
    );

  const Candado = () => (
    <span
      title="Ya está en una nómina: lo pagado no se toca"
      className="shrink-0 flex items-center gap-1 text-xs text-gray-400"
    >
      <Lock className="w-3 h-3" /> en nómina
    </span>
  );

  const { data: graficos } = useQuery({
    queryKey: ["people", "historico-graficos"],
    queryFn: getGraficosHistorico,
  });

  return (
    <div className="space-y-4">
      {/* ---------- Los gráficos ---------- */}
      {graficos && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              En nóminas por mes
            </h3>
            <Bar
              data={{
                labels: graficos.porMes.map((m) => etiquetaMes(m.mes)),
                datasets: [
                  {
                    label: "Jornadas",
                    data: graficos.porMes.map((m) => m.jornadas),
                    backgroundColor: "#3b82f6",
                    stack: "a",
                  },
                  {
                    label: "Propinas",
                    data: graficos.porMes.map((m) => m.propinas),
                    backgroundColor: "#10b981",
                    stack: "a",
                  },
                ],
              }}
              options={{
                responsive: true,
                plugins: { legend: { position: "bottom" } },
                scales: {
                  x: { stacked: true, grid: { display: false } },
                  y: { stacked: true, ticks: { callback: (v) => clp(Number(v)) } },
                },
              }}
            />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              Quiénes más reciben{" "}
              <span className="font-normal text-gray-500">(6 meses)</span>
            </h3>
            {graficos.top.length === 0 ? (
              <p className="text-sm text-gray-500 py-8 text-center">
                Todavía no hay pagos en nóminas.
              </p>
            ) : (
              <Bar
                data={{
                  labels: graficos.top.map((t) => t.nombre),
                  datasets: [
                    {
                      label: "Jornadas + propinas",
                      data: graficos.top.map((t) => t.total),
                      backgroundColor: "#3b82f6",
                    },
                  ],
                }}
                options={{
                  indexAxis: "y",
                  responsive: true,
                  plugins: { legend: { display: false } },
                  scales: {
                    x: { ticks: { callback: (v) => clp(Number(v)) } },
                    y: { grid: { display: false } },
                  },
                }}
              />
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              Propina promedio por día{" "}
              <span className="font-normal text-gray-500">
                (solo días con propina)
              </span>
            </h3>
            <Bar
              data={{
                labels: graficos.promedioDia.map((m) => etiquetaMes(m.mes)),
                datasets: [
                  {
                    label: "Promedio",
                    data: graficos.promedioDia.map((m) => m.promedio),
                    backgroundColor: "#10b981",
                  },
                ],
              }}
              options={{
                responsive: true,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      afterLabel: (ctx) => {
                        const d = graficos.promedioDia[ctx.dataIndex]?.dias ?? 0;
                        return `${String(d)} ${d === 1 ? "día" : "días"} con propina`;
                      },
                    },
                  },
                },
                scales: {
                  x: { grid: { display: false } },
                  y: { ticks: { callback: (v) => clp(Number(v)) } },
                },
              }}
            />
          </div>
        </div>
      )}

      {/* ---------- Eventos ---------- */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Eventos liquidados</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Tu historial. En verde lo que espera la nómina; con candado lo
            que ya entró a una.
          </p>
        </div>
        {eventosLiquidados.length === 0 ? (
          <p className="text-sm text-gray-500 p-6 text-center">
            Todavía no liquidas ningún evento.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {eventosLiquidados.map((q) => {
              const esperando = eventosEsperando.get(q.id);
              return (
                <li
                  key={q.id}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <span className="flex-1 min-w-0 truncate text-sm text-gray-900">
                    N° {q.numero} · {q.cliente}
                  </span>
                  <span className="text-xs text-gray-500 tabular-nums shrink-0">
                    {formatISOUTCDateToString(q.inicio)}
                  </span>
                  {esperando !== undefined && (
                    <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 tabular-nums">
                      esperando nómina · {clp(esperando)}
                    </span>
                  )}
                  {/* EN NÓMINA NO HAY VUELTA ATRÁS (Felipe, 24-08):
                      candado, sin botón. El backend además lo rechaza. */}
                  {q.enNomina ? (
                    <Candado />
                  ) : (
                    <BotonReabrir
                      clave={`ev-${q.id}`}
                      onConfirmar={() =>
                        reabrir.mutate({ quotation_id: q.id })
                      }
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ---------- Restaurante ---------- */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Días de restaurante</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Cada día resuelto, incluidos los marcados sin propina — nada
            desaparece.
          </p>
        </div>
        {diasResueltos.length === 0 ? (
          <p className="text-sm text-gray-500 p-6 text-center">
            Todavía no resuelves ningún día.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {diasResueltos.map((p) => {
              const d = String(p.day).slice(0, 10);
              const total = totalDe(p);
              const esperando = diasEsperando.has(d);
              const enNomina = total > 0 && !esperando;
              return (
                <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex-1 min-w-0 text-sm text-gray-900 tabular-nums">
                    {formatISOUTCDateToString(d)}
                  </span>
                  {total <= 0 ? (
                    <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                      sin propina
                    </span>
                  ) : (
                    <span
                      className={`shrink-0 text-xs px-2 py-0.5 rounded-full border tabular-nums ${
                        esperando
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-gray-50 text-gray-600 border-gray-200"
                      }`}
                    >
                      {clp(total)}
                      {esperando && " · esperando nómina"}
                    </span>
                  )}
                  {enNomina ? (
                    <Candado />
                  ) : (
                    <BotonReabrir
                      clave={`dia-${d}`}
                      onConfirmar={() => reabrir.mutate({ day: d })}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
