import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
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
import { toast } from "../../components/toast/Toast";
import {
  getGraficosHistorico,
  getPayroll,
  getPayrolls,
  getPools,
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
import { eventosQueryOptions } from "./FichasTab";
import {
  estadoDelConcepto,
  porConceptoDe,
  type PorConcepto,
} from "./porConcepto";
import type { Nomina } from "../../types/people.types";
import { clp } from "../postventa/PostVentaPage";

/**
 * EL HISTÓRICO DE PAGOS — lo que YA SE PAGÓ (Felipe, 08-09-2026; los
 * tres estados del doc 10: Liquidación valida, Nómina deja listo para
 * pagar, Histórico cuenta la historia). Nóminas abiertas por lo que
 * pagaron — eventos y días de staff con su sello "Pagado el…" —, cero
 * botones: un pago es un hito y no se reabre.
 * Lo liquidado que espera nómina y lo en-nómina-sin-pagar NO se ven
 * acá: viven en Nómina. La única excepción son los días de staff
 * marcados SIN PROPINA: pasan de Liquidación derecho al histórico
 * (no hay pago que hacer) y se pueden devolver a Liquidación para
 * corregir un marcado por error — no toca dinero.
 */
export default function HistoricoTab() {
  const { data: nominas = [] } = useQuery({
    queryKey: ["people", "payrolls"],
    queryFn: getPayrolls,
  });
  const { data: pools = [] } = useQuery({
    queryKey: ["people", "pools"],
    queryFn: getPools,
  });
  const qc = useQueryClient();
  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ["people"] });
  };

  const [confirmando, setConfirmando] = useState<string | null>(null);
  const devolver = useMutation({
    mutationFn: (origen: { day: string }) => reabrirLiquidacion(origen),
    onSuccess: () => {
      toast.success("El día volvió a Liquidación.");
      setConfirmando(null);
      refrescar();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  // Solo las nóminas con al menos una persona pagada, la más nueva
  // primero. Una nómina en el banco sin pagos todavía es de Nómina.
  const nominasConPagos = useMemo(
    () =>
      nominas
        .filter((n) => (n.pagadas ?? 0) > 0)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [nominas],
  );

  // PRECARGA (Felipe, 08-09: "se demora en cargar cuando pincho"): los
  // detalles de las nóminas con pagos se piden todos al abrir la
  // pestaña — son pocos y chicos — y al desplegar una ya está en caché.
  useEffect(() => {
    for (const n of nominasConPagos) {
      void qc.prefetchQuery({
        queryKey: ["people", "payroll", n.id],
        queryFn: () => getPayroll(n.id),
        staleTime: 60_000,
      });
    }
  }, [nominasConPagos, qc]);

  const totalDe = (p: Pozo) =>
    Number(p.first_amount) + Number(p.second_amount);
  const diasSinPropina = useMemo(
    () =>
      pools
        .filter(
          (p) => p.day && !p.quotation_id && p.distributed_at && totalDe(p) <= 0,
        )
        .sort((a, b) => String(b.day).localeCompare(String(a.day))),
    [pools],
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

      {/* ---------- Pagos, nómina por nómina ---------- */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Pagos</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Nómina por nómina, qué eventos y días de staff se pagaron. Lo que
            espera pago vive en la pestaña Nómina.
          </p>
        </div>
        {nominasConPagos.length === 0 ? (
          <p className="text-sm text-gray-500 p-6 text-center">
            Todavía no hay pagos hechos.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {nominasConPagos.map((n) => (
              <NominaPagada key={n.id} nomina={n} />
            ))}
          </ul>
        )}
      </div>

      {/* ---------- Días sin propina ---------- */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Días sin propina</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Días de staff resueltos sin propina: no hubo pago, por
            eso no pasan por nómina. Devolverlos a Liquidación no toca
            dinero.
          </p>
        </div>
        {diasSinPropina.length === 0 ? (
          <p className="text-sm text-gray-500 p-6 text-center">
            Ningún día marcado sin propina.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {diasSinPropina.map((p) => {
              const d = String(p.day).slice(0, 10);
              return (
                <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex-1 min-w-0 text-sm text-gray-900 tabular-nums">
                    {formatISOUTCDateToString(d)}
                  </span>
                  <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                    sin propina
                  </span>
                  {confirmando === d ? (
                    <span className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => devolver.mutate({ day: d })}
                        disabled={devolver.isPending}
                        className="text-xs px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {devolver.isPending ? "Devolviendo…" : "Sí, devolver"}
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
                      onClick={() => setConfirmando(d)}
                      title="Vuelve a Liquidación para corregirlo. No hubo pago: no toca dinero."
                      className="shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded-md text-gray-500 border border-gray-200 hover:bg-gray-50"
                    >
                      <RotateCcw className="w-3 h-3" /> Devolver a Liquidación
                    </button>
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

/** Una nómina del histórico: cabecera plegada; al abrirla se lee su
 *  detalle y se lista QUÉ PAGÓ — eventos y días de staff, cada uno con
 *  su gente, sus montos y su sello. Las personas no van acá: viven en
 *  Nómina de pago (Felipe, 08-09: "el detalle de cada nómina vive
 *  correctamente en la pestaña nómina"). */
function NominaPagada({ nomina }: { readonly nomina: Nomina }) {
  const [abierta, setAbierta] = useState(false);
  const { data: detalle, isLoading } = useQuery({
    queryKey: ["people", "payroll", nomina.id],
    queryFn: () => getPayroll(nomina.id),
    enabled: abierta,
    staleTime: 60_000,
  });
  const { data: eventos = [] } = useQuery(eventosQueryOptions);
  const nombre = useMemo(() => {
    // El mismo nombre que la lista por pagar de Nómina: número, cliente
    // y fecha, para que dos eventos del mismo día se distingan.
    const m = new Map(
      eventos.map((q) => [
        q.id,
        `N° ${String(q.numero)} · ${q.cliente} · ${formatISOUTCDateToString(q.inicio)}`,
      ]),
    );
    return (c: PorConcepto) =>
      c.quotation_id
        ? (m.get(c.quotation_id) ?? "Evento")
        : `Staff · ${formatISOUTCDateToString(c.day ?? "")}`;
  }, [eventos]);
  const conceptos = useMemo(
    () => (detalle ? porConceptoDe(detalle) : []),
    [detalle],
  );
  // SOLO NOMBRE Y TOTAL (Felipe, 08-09: "el resto de los datos solo
  // ensucia"). La cabecera ya dice Pagada/Parcial; por fila se marca
  // únicamente la excepción — lo que todavía no se pagó del todo.
  const sello = (c: PorConcepto) => {
    const estado = estadoDelConcepto(c);
    if (estado === "parcial") return { texto: "Parcial", clase: "bg-amber-50 text-amber-700 border-amber-200" };
    if (estado === "pendiente") return { texto: "Sin pagar", clase: "bg-gray-50 text-gray-500 border-gray-200" };
    return null;
  };
  const Flecha = abierta ? ChevronDown : ChevronRight;
  return (
    <li>
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50"
      >
        <Flecha className="w-4 h-4 text-gray-400 shrink-0" />
        <span className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">
          {nomina.label}
        </span>
        <span className="shrink-0 text-xs text-gray-500 tabular-nums">
          {nomina.pagadas ?? 0} de {nomina.personas ?? 0} pagadas
        </span>
        <span
          className={`shrink-0 text-xs px-2 py-0.5 rounded-full border ${
            nomina.estado === "pagada"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-amber-50 text-amber-700 border-amber-200"
          }`}
        >
          {nomina.estado === "pagada" ? "Pagada" : "Parcial"}
        </span>
        {nomina.total !== undefined && (
          <span className="shrink-0 text-sm font-semibold text-gray-900 tabular-nums">
            {clp(nomina.total)}
          </span>
        )}
      </button>
      {abierta && (
        <div className="px-4 pb-3">
          {isLoading ? (
            <p className="text-xs text-gray-500 py-2">Cargando…</p>
          ) : conceptos.length === 0 ? (
            <p className="text-xs text-gray-500 py-2">
              Esta nómina no tiene eventos ni días de staff.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 text-sm">
              {conceptos.map((c) => {
                const s = sello(c);
                return (
                  <li key={c.llave} className="flex items-center gap-3 py-1.5 pl-7">
                    <span className="flex-1 min-w-0 truncate text-gray-900">
                      {nombre(c)}
                    </span>
                    {s && (
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full border ${s.clase}`}>
                        {s.texto}
                      </span>
                    )}
                    <span className="shrink-0 font-semibold text-gray-900 tabular-nums">
                      {clp(c.totalJornada + c.totalPropina)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
