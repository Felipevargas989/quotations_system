import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import type { ActiveElement, ChartEvent } from "chart.js";
import { Bar } from "react-chartjs-2";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getHistorial } from "../../services/people.service";
import type { Asignacion, Persona } from "../../types/people.types";
import { hoyEnChile } from "../../utils/dates";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

// LA PLATA DE UNA PERSONA — su año, mes a mes
//
// Felipe (15-08) lo pidió por AÑO CALENDARIO, no por los últimos doce
// meses: *"así puedo gestionar cuánto mensual está proyectado para cada
// staff, hay que cuidar sus ingresos mensuales proyectados"*. Por eso el
// gráfico incluye los meses que vienen —las jornadas ya están
// proyectadas— y no solo lo que ya pasó.
//
// Dos colores: JORNADAS y PROPINAS. Se ve al tiro quién vive de la
// propina y quién del turno. Se pincha un mes y abajo sale su detalle.

const clp = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-CL");
const iso = (v: string | null | undefined) =>
  v ? String(v).slice(0, 10) : "";

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

/** Una línea de plata: una jornada o una propina de un día. */
interface Linea {
  readonly id: string;
  readonly dia: string;
  readonly concepto: "Jornada" | "Propina";
  readonly donde: string;
  readonly monto: number;
  readonly pagado: boolean;
}

const lineasDe = (a: Asignacion): Linea[] => {
  const dia = iso(a.day);
  // El evento cuando lo hay; si no, es una jornada suya, sin evento.
  const donde = a.quotations
    ? `#${String(a.quotations.quotation_number)} · ${a.quotations.clients?.name ?? ""}`
    : "—";
  const salida: Linea[] = [];
  const jornada = Number(a.amount ?? 0);
  if (jornada > 0) {
    salida.push({
      id: `j-${String(a.id)}`,
      dia,
      concepto: "Jornada",
      donde,
      monto: jornada,
      pagado: a.payroll_id !== null,
    });
  }
  const propina = Number(a.tip_amount ?? 0);
  if (propina > 0) {
    salida.push({
      id: `p-${String(a.id)}`,
      dia,
      concepto: "Propina",
      donde,
      monto: propina,
      pagado: a.tip_payroll_id !== null,
    });
  }
  return salida;
};

export default function PagosDePersona({
  persona,
}: {
  readonly persona: Persona;
}) {
  const anoDeHoy = Number(hoyEnChile().slice(0, 4));
  const mesDeHoy = Number(hoyEnChile().slice(5, 7)) - 1;
  const [ano, setAno] = useState(anoDeHoy);
  const [mesAbierto, setMesAbierto] = useState<number | null>(null);

  const { data: historial = [], isLoading } = useQuery({
    queryKey: ["people", "historial", persona.id],
    queryFn: () => getHistorial(persona.id),
  });

  const lineas = useMemo(
    () => historial.flatMap(lineasDe),
    [historial],
  );

  // Los tres números de arriba.
  const seLeDebe = lineas
    .filter((l) => !l.pagado)
    .reduce((t, l) => t + l.monto, 0);
  const pagadoEsteAno = lineas
    .filter((l) => l.pagado && l.dia.startsWith(String(anoDeHoy)))
    .reduce((t, l) => t + l.monto, 0);
  const total = lineas.reduce((t, l) => t + l.monto, 0);

  // El año elegido, mes a mes.
  const porMes = useMemo(() => {
    const jornadas = Array.from({ length: 12 }, () => 0);
    const propinas = Array.from({ length: 12 }, () => 0);
    for (const l of lineas) {
      if (!l.dia.startsWith(String(ano))) continue;
      const mes = Number(l.dia.slice(5, 7)) - 1;
      if (l.concepto === "Jornada") jornadas[mes] += l.monto;
      else propinas[mes] += l.monto;
    }
    return { jornadas, propinas };
  }, [lineas, ano]);

  // Un mes es "lo que viene" si aún no empieza; el mes en curso cuenta
  // como real, porque ya se está trabajando.
  const esFuturo = (mes: number) =>
    ano > anoDeHoy || (ano === anoDeHoy && mes > mesDeHoy);

  const delMes = useMemo(() => {
    if (mesAbierto === null) return [];
    const prefijo = `${String(ano)}-${String(mesAbierto + 1).padStart(2, "0")}`;
    return lineas
      .filter((l) => l.dia.startsWith(prefijo))
      .sort((a, b) => a.dia.localeCompare(b.dia));
  }, [lineas, ano, mesAbierto]);

  const anosConDatos = [
    ...new Set(lineas.map((l) => Number(l.dia.slice(0, 4)))),
  ].filter((a) => Number.isFinite(a) && a > 2000);
  const hayAlgo = lineas.length > 0;

  if (isLoading) {
    return <p className="text-sm text-gray-500">Cargando su historial…</p>;
  }

  return (
    <div className="space-y-5">
      {/* Los tres números: lo que se le debe es la pregunta que le van
          a hacer a Felipe, así que va primero y destacado. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          className={`border rounded-lg px-3 py-2 ${
            seLeDebe > 0
              ? "border-amber-200 bg-amber-50"
              : "border-gray-200"
          }`}
        >
          <p className="text-xs text-gray-500">Se le debe</p>
          <p
            className={`text-lg font-bold ${
              seLeDebe > 0 ? "text-amber-800" : "text-gray-400"
            }`}
          >
            {seLeDebe > 0 ? clp(seLeDebe) : "nada pendiente"}
          </p>
        </div>
        <div className="border border-gray-200 rounded-lg px-3 py-2">
          <p className="text-xs text-gray-500">Pagado el {anoDeHoy}</p>
          <p className="text-lg font-bold text-gray-900">
            {clp(pagadoEsteAno)}
          </p>
        </div>
        <div className="border border-gray-200 rounded-lg px-3 py-2">
          <p className="text-xs text-gray-500">Total histórico</p>
          <p className="text-lg font-bold text-gray-900">{clp(total)}</p>
        </div>
      </div>

      {!hayAlgo ? (
        <p className="text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-6 text-center">
          Todavía no tiene jornadas ni propinas con monto.
        </p>
      ) : (
        <>
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setAno(ano - 1);
                    setMesAbierto(null);
                  }}
                  aria-label="Año anterior"
                  className="p-1 text-gray-500 hover:bg-gray-100 rounded"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-semibold text-gray-900 tabular-nums w-12 text-center">
                  {ano}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAno(ano + 1);
                    setMesAbierto(null);
                  }}
                  aria-label="Año siguiente"
                  className="p-1 text-gray-500 hover:bg-gray-100 rounded"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                {anosConDatos.length > 0 && (
                  <span className="ml-2 text-xs text-gray-400">
                    con datos: {anosConDatos.sort((a, b) => a - b).join(" · ")}
                  </span>
                )}
              </div>
              <span className="text-sm text-gray-600">
                {clp(
                  porMes.jornadas.reduce((t, n) => t + n, 0) +
                    porMes.propinas.reduce((t, n) => t + n, 0),
                )}{" "}
                en el año
              </span>
            </div>

            <div className="h-56">
              <Bar
                data={{
                  labels: MESES,
                  datasets: [
                    {
                      label: "Jornadas",
                      data: porMes.jornadas,
                      // LO PASADO EN COLOR FIRME, LO QUE VIENE PÁLIDO
                      // (Felipe, 15-08): un mes proyectado no es plata
                      // que ya se movió, y no puede verse igual.
                      backgroundColor: MESES.map((_, m) =>
                        esFuturo(m) ? "#93c5fd" : "#2563eb",
                      ),
                    },
                    {
                      label: "Propinas",
                      data: porMes.propinas,
                      backgroundColor: MESES.map((_, m) =>
                        esFuturo(m) ? "#6ee7b7" : "#10b981",
                      ),
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  // El clic agarra la COLUMNA entera del mes, no solo la
                  // barra: antes había que pegarle justo y en un mes sin
                  // plata no pasaba nada (Felipe, 15-08).
                  interaction: { mode: "index", intersect: false },
                  onClick: (_e: ChartEvent, els: ActiveElement[]) => {
                    if (els.length > 0) setMesAbierto(els[0].index);
                  },
                  scales: {
                    x: { stacked: true, grid: { display: false } },
                    y: {
                      stacked: true,
                      ticks: {
                        callback: (v) => clp(Number(v)),
                      },
                    },
                  },
                  plugins: {
                    legend: { position: "bottom" },
                    tooltip: {
                      callbacks: {
                        label: (ctx: { dataset: { label?: string }; parsed: { y: number } }) =>
                          `${ctx.dataset.label ?? ""}: ${clp(ctx.parsed.y)}`,
                      },
                    },
                  },
                }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Pincha un mes para ver su detalle. En color firme lo que ya
              pasó; en pálido, lo <strong>proyectado</strong>.
            </p>
          </div>

          {mesAbierto !== null && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                <span className="text-sm font-medium text-gray-900">
                  {MESES[mesAbierto]} {ano}
                </span>
                <button
                  type="button"
                  onClick={() => setMesAbierto(null)}
                  className="text-xs text-gray-500 hover:text-gray-800"
                >
                  cerrar
                </button>
              </div>
              {delMes.length === 0 ? (
                <p className="text-sm text-gray-500 px-4 py-6 text-center">
                  Ese mes no tiene jornadas ni propinas con monto.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-gray-400 border-b border-gray-100">
                      <th className="px-4 py-2 font-medium w-24">Día</th>
                      <th className="px-4 py-2 font-medium w-28">Concepto</th>
                      <th className="px-4 py-2 font-medium">Dónde</th>
                      <th className="px-4 py-2 font-medium w-28 text-right">
                        Monto
                      </th>
                      <th className="px-4 py-2 font-medium w-24 text-right">
                        Estado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {delMes.map((l) => (
                      <tr key={l.id}>
                        <td className="px-4 py-2 tabular-nums text-gray-600">
                          {new Date(`${l.dia}T12:00:00Z`).toLocaleDateString(
                            "es-CL",
                            { day: "numeric", month: "short", timeZone: "UTC" },
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              l.concepto === "Propina"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-blue-50 text-blue-700"
                            }`}
                          >
                            {l.concepto}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-700">{l.donde}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium">
                          {clp(l.monto)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {l.pagado ? (
                            <span className="text-xs text-emerald-700">
                              pagado
                            </span>
                          ) : (
                            <span className="text-xs text-amber-700">
                              pendiente
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t border-gray-200 font-bold">
                      <td colSpan={3} className="px-4 py-2">
                        Total del mes
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {clp(delMes.reduce((t, l) => t + l.monto, 0))}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
