import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  DollarSign,
  TrendingUp,
  ClipboardList,
  Building,
  Calendar,
  BarChart3,
  Clock,
} from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { ChevronDown, ChevronRight } from "lucide-react";
import { getCompleteStats } from "../../services/analytics.service";
import { CompleteStatsResponse } from "../../types/analytics.types";
import QuotationStatusStatsComponent from "../analytics/components/QuotationStatusStats";
import EventTypeConversionStatsComponent from "../analytics/components/EventTypeConversionStats";
import EventTypeRevenueStatsComponent from "../analytics/components/EventTypeRevenueStats";
import RevenueByClientTypeStatsComponent from "../analytics/components/RevenueByClientTypeStats";
import TopClientsByRevenueStatsComponent from "../analytics/components/TopClientsByRevenueStats";
import TopClientsByQuotationsStatsComponent from "../analytics/components/TopClientsByQuotationsStats";
import RecurringClientsStatsComponent from "../analytics/components/RecurringClientsStats";
import VariableServicesUsageStatsComponent from "../analytics/components/VariableServicesUsageStats";
import FixedServicesUsageStatsComponent from "../analytics/components/FixedServicesUsageStats";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
);

// Abreviatura chilena de cifras para los gráficos (Felipe, 23-07):
// 16.000.000 -> "16M", 4.500.000 -> "4,5M", 450.000 -> "450k".
const abrevCifra = (n: number): string => {
  const abs = Math.abs(n);
  const f = (v: number) =>
    v.toLocaleString("es-CL", {
      maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0,
    });
  if (abs >= 1_000_000) return `${f(n / 1_000_000)}M`;
  if (abs >= 1_000) return `${f(n / 1_000)}k`;
  return n.toLocaleString("es-CL");
};

// Plugin liviano (sin dependencias): pinta la cifra abreviada sobre cada
// punto de la curva, del color de la serie. El monto exacto sigue en el
// tooltip. Se activa con `puntoAbrev` (dinero) o `puntoEntero` (conteos)
// en las options del gráfico.
const etiquetasDePunto = {
  id: "etiquetasDePunto",
  afterDatasetsDraw(chart: any) {
    const opts: any = chart.options || {};
    if (!opts.puntoAbrev && !opts.puntoEntero) return;
    const { ctx } = chart;
    chart.data.datasets.forEach((ds: any, di: number) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      ctx.save();
      ctx.font = "bold 10px system-ui, sans-serif";
      ctx.fillStyle = ds.borderColor || "#374151";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      meta.data.forEach((pt: any, i: number) => {
        const v = Number(ds.data[i]);
        if (!Number.isFinite(v) || v === 0) return;
        const label = opts.puntoAbrev
          ? abrevCifra(v)
          : v.toLocaleString("es-CL");
        ctx.fillText(label, pt.x, pt.y - 6);
      });
      ctx.restore();
    });
  },
};


import { useAuth } from "../../contexts/AuthContext";
import { getDashboardStats } from "../../services/analytics.service";
import NewAccount from "./components/NewAccount";
import { UserRole } from "../../constants/users";
import { subMonths, subYears } from "date-fns";
import { MONTHS } from "../../constants/dates";
import { QuotationStatus } from "../../types/quotations.types";
import { formatCurrency } from "../../utils/currencies";

interface DashboardData {
  totalRequests: number;
  totalClients: number;
  totalSales: number;
  requestsByMonth: { month: string; count: number; monthKey: string }[];
  quotationsByStatus: { status: string; count: number; amount: number }[];
  eventsByMonth: {
    month: string;
    count: number;
    amount: number;
    monthKey: string;
  }[];
  salesPipeline: { status: string; amount: number; count: number }[];
  // FASE 3: la plata se lee en tabla — una fila por mes.
  moneyByMonth: {
    month: string;
    monthKey: string;
    eventos: number;
    ventas: number;
    cobrado: number;
    porCobrar: number;
  }[];
}

type TimeRangeOption = {
  label: string;
  value: string;
  getDateRange: () => { start_date: string; end_date: string };
};

export default function DashboardPage() {
  const { user, company, userRole } = useAuth();

  // Time range options
  const timeRangeOptions: TimeRangeOption[] = [
    {
      label: "Último mes",
      value: "1_month",
      getDateRange: () => {
        const endDate = new Date();
        const startDate = subMonths(endDate, 1);
        return {
          start_date: startDate.toISOString().split("T")[0],
          end_date: endDate.toISOString().split("T")[0],
        };
      },
    },
    {
      label: "Últimos 3 meses",
      value: "3_months",
      getDateRange: () => {
        const endDate = new Date();
        const startDate = subMonths(endDate, 3);
        return {
          start_date: startDate.toISOString().split("T")[0],
          end_date: endDate.toISOString().split("T")[0],
        };
      },
    },
    {
      label: "Últimos 6 meses",
      value: "6_months",
      getDateRange: () => {
        const endDate = new Date();
        const startDate = subMonths(endDate, 6);
        return {
          start_date: startDate.toISOString().split("T")[0],
          end_date: endDate.toISOString().split("T")[0],
        };
      },
    },
    {
      label: "Último año",
      value: "1_year",
      getDateRange: () => {
        const endDate = new Date();
        const startDate = subYears(endDate, 1);
        return {
          start_date: startDate.toISOString().split("T")[0],
          end_date: endDate.toISOString().split("T")[0],
        };
      },
    },
    {
      label: "Últimos 5 años",
      value: "5_years",
      getDateRange: () => {
        const endDate = new Date();
        const startDate = subYears(endDate, 5);
        return {
          start_date: startDate.toISOString().split("T")[0],
          end_date: endDate.toISOString().split("T")[0],
        };
      },
    },
  ];

  // Selected time range (default to 1 year)
  const [selectedTimeRange, setSelectedTimeRange] = useState("1_year");
  // Fechas libres (Fase 2): al tocar cualquiera, el rango personalizado
  // manda; al elegir un preset, se vuelve a los presets.
  const [customRange, setCustomRange] = useState<{
    start: string;
    end: string;
  } | null>(null);
  // Secciones de análisis plegables (ex-Analytics). Comercial parte
  // abierta; el estado es solo de la sesión.
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(["comercial"]),
  );
  const toggleSection = (key: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const resolveRange = () => {
    if (customRange) {
      return { start_date: customRange.start, end_date: customRange.end };
    }
    const selectedOption = timeRangeOptions.find(
      (option) => option.value === selectedTimeRange,
    );
    return (
      selectedOption?.getDateRange() || timeRangeOptions[3].getDateRange()
    );
  };

  const EMPTY_DASHBOARD: DashboardData = {
    totalRequests: 0,
    totalClients: 0,
    totalSales: 0,
    requestsByMonth: [],
    quotationsByStatus: [],
    eventsByMonth: [],
    salesPipeline: [],
    moneyByMonth: [],
  };

  // Dashboard vía React Query (Etapa 5): una clave por rango de tiempo;
  // al cambiar el rango se sigue mostrando el anterior mientras llega
  // el nuevo (sin parpadeo), y volver al dashboard es instantáneo.
  const dashboardQuery = useQuery({
    queryKey: [
      "dashboard",
      company?.id,
      selectedTimeRange,
      customRange?.start,
      customRange?.end,
    ],
    enabled: !!user && !!company?.id,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<DashboardData> => {
      const dateRange = resolveRange();

      // Get dashboard stats from analytics service
      const analyticsData = await getDashboardStats(
        dateRange.start_date,
        dateRange.end_date,
      );

      if (!analyticsData) {
        throw new Error("No analytics data received");
      }

      // Get total requests count from analytics service
      const totalRequests = analyticsData.totalQuotations;

      const totalClients = analyticsData.totalClients;

      // Ventas del período = concretadas (aceptada + realizada),
      // coherente con las curvas de eventos/ventas (Fase 1, 23-07).
      const totalSales =
        (analyticsData.totalQuotationsByStatus?.aceptada?.amount || 0) +
        (analyticsData.totalQuotationsByStatus?.realizada?.amount || 0);

      // Convert totalQuotationsByMonth to requestsByMonth format
      const requestsByMonth = Object.keys(analyticsData.totalQuotationsByMonth)
        .sort((a, b) => {
          // Sort by year first, then by month
          const [yearA, monthA] = a.split("-").map(Number);
          const [yearB, monthB] = b.split("-").map(Number);
          if (yearA !== yearB) return yearA - yearB;
          return monthA - monthB;
        })
        .map((monthYearKey: string) => ({
          month: formatMonthYear(monthYearKey),
          count: analyticsData.totalQuotationsByMonth[monthYearKey],
          monthKey: monthYearKey,
        }));

      // Convert quotations by status to the expected format
      const quotationsByStatus = Object.entries(
        analyticsData.totalQuotationsByStatus || {},
      ).map(([status, data]) => ({
        status,
        count: data.count,
        amount: data.amount,
      }));

      // Convert totalQuotationsByEventDate to eventsByMonth format
      const eventsByMonth = Object.keys(
        analyticsData.totalQuotationsByEventDate,
      )
        .sort((a, b) => {
          // Sort by year first, then by month
          const [yearA, monthA] = a.split("-").map(Number);
          const [yearB, monthB] = b.split("-").map(Number);
          if (yearA !== yearB) return yearA - yearB;
          return monthA - monthB;
        })
        .map((monthYearKey: string) => ({
          month: formatMonthYear(monthYearKey),
          count: analyticsData.totalQuotationsByEventDate[monthYearKey].count,
          amount: analyticsData.totalQuotationsByEventDate[monthYearKey].amount,
          monthKey: monthYearKey,
        }));

      // Pipeline de ventas (excluye rechazadas)
      const salesPipeline = quotationsByStatus.filter(
        (item) => item.status !== QuotationStatus.RECHAZADA,
      );

      // Convert totalPaymentsByMonth to paymentsByMonth format
      // FASE 3: una fila por mes con eventos, ventas, cobrado y por
      // cobrar — unión de los ejes de eventos y de pagos.
      const detail = analyticsData.totalPaymentsDetailByMonth || {};
      const byEvent = analyticsData.totalQuotationsByEventDate || {};
      const moneyKeys = [
        ...new Set([...Object.keys(byEvent), ...Object.keys(detail)]),
      ].sort((a, b) => {
        const [yearA, monthA] = a.split("-").map(Number);
        const [yearB, monthB] = b.split("-").map(Number);
        if (yearA !== yearB) return yearA - yearB;
        return monthA - monthB;
      });
      const moneyByMonth = moneyKeys.map((monthYearKey: string) => ({
        month: formatMonthYear(monthYearKey),
        monthKey: monthYearKey,
        eventos: byEvent[monthYearKey]?.count || 0,
        ventas: byEvent[monthYearKey]?.amount || 0,
        cobrado: detail[monthYearKey]?.cobrado || 0,
        porCobrar: detail[monthYearKey]?.porCobrar || 0,
      }));

      return {
        totalRequests,
        totalClients,
        totalSales,
        requestsByMonth: requestsByMonth as {
          month: string;
          count: number;
          monthKey: string;
        }[],
        quotationsByStatus,
        eventsByMonth: eventsByMonth as {
          month: string;
          count: number;
          amount: number;
          monthKey: string;
        }[],
        salesPipeline,
        moneyByMonth,
      };
    },
  });
  const data = dashboardQuery.data ?? EMPTY_DASHBOARD;
  const loading = dashboardQuery.isPending;

  const getStatusLabel = (status: string) => {
    const labels = {
      solicitada: "📋 Solicitada",
      enviada: "📤 Enviada",
      en_negociacion: "💬 En Negociación",
      aceptada: "✅ Aceptada",
      rechazada: "❌ Rechazada",
    };
    return labels[status as keyof typeof labels] || status;
  };

  const getStatusColor = (status: string) => {
    const colors = {
      solicitada: "bg-yellow-500",
      enviada: "bg-blue-500",
      en_negociacion: "bg-purple-500",
      aceptada: "bg-green-500",
      rechazada: "bg-red-500",
    };
    return colors[status as keyof typeof colors] || "bg-gray-500";
  };

  // Tablas de análisis (ex-Analytics) bajo el MISMO período (Fase 2).
  const statsQuery = useQuery({
    queryKey: [
      "dashboard-complete",
      company?.id,
      selectedTimeRange,
      customRange?.start,
      customRange?.end,
    ],
    enabled: !!user && !!company?.id,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<CompleteStatsResponse | null> => {
      const dateRange = resolveRange();
      return getCompleteStats(dateRange.start_date, dateRange.end_date);
    },
  });
  const stats = statsQuery.data || null;

  const handleTimeRangeChange = (value: string) => {
    setSelectedTimeRange(value);
    setCustomRange(null);
  };

  // Helper function to format month-year keys (e.g., "2024-0" -> "Enero 2024")
  const formatMonthYear = (monthYearKey: string): string => {
    const [year, monthIndex] = monthYearKey.split("-");
    const monthName = MONTHS[parseInt(monthIndex)];
    return `${monthName} ${year}`;
  };

  // Helper function to determine if a month is in the future
  const isMonthInFuture = (monthYearKey: string): boolean => {
    const [year, monthIndex] = monthYearKey.split("-").map(Number);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    if (year > currentYear) return true;
    if (year === currentYear && monthIndex > currentMonth) return true;
    return false;
  };

  // Chart configuration for the line chart
  const chartOptions = {
    responsive: true,
    puntoEntero: true,
    layout: { padding: { top: 16 } },
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: false,
      },
    },
    scales: {
      x: {
        display: true,
        title: {
          display: false,
        },
      },
      y: {
        display: true,
        beginAtZero: true,
        ticks: {
          stepSize: 1,
        },
      },
    },
    maintainAspectRatio: false,
  };

  // Prepare chart data for quotations
  const chartData = {
    labels: data.requestsByMonth.map((item) => item.month),
    datasets: [
      {
        label: "Cotizaciones",
        data: data.requestsByMonth.map((item) => item.count),
        borderColor: "rgb(59, 130, 246)",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        borderWidth: 2,
        pointBackgroundColor: "rgb(59, 130, 246)",
        pointBorderColor: "rgb(59, 130, 246)",
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.4,
        fill: true,
      },
    ],
  };

  // Chart configuration for the events line chart
  const eventsChartOptions = {
    responsive: true,
    puntoEntero: true,
    layout: { padding: { top: 16 } },
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: false,
      },
    },
    scales: {
      x: {
        display: true,
        title: {
          display: false,
        },
      },
      y: {
        display: true,
        beginAtZero: true,
        ticks: {
          stepSize: 1,
        },
      },
    },
    maintainAspectRatio: false,
  };

  // Prepare chart data for events
  const eventsChartData = {
    labels: data.eventsByMonth.map((item) => item.month),
    datasets: [
      {
        label: "Eventos",
        data: data.eventsByMonth.map((item) => item.count),
        borderColor: "rgb(147, 51, 234)", // Purple color
        backgroundColor: "rgba(147, 51, 234, 0.1)",
        borderWidth: 2,
        pointBackgroundColor: "rgb(147, 51, 234)",
        pointBorderColor: "rgb(147, 51, 234)",
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.4,
        fill: true,
        segment: {
          borderColor: (ctx: any) => {
            const nextIndex = ctx.p1DataIndex;
            if (nextIndex >= data.eventsByMonth.length)
              return "rgb(147, 51, 234)";
            return isMonthInFuture(data.eventsByMonth[nextIndex].monthKey)
              ? "rgba(147, 51, 234, 0.3)"
              : "rgb(147, 51, 234)";
          },
          borderDash: (ctx: any) => {
            const nextIndex = ctx.p1DataIndex;
            if (nextIndex >= data.eventsByMonth.length) return undefined;
            return isMonthInFuture(data.eventsByMonth[nextIndex].monthKey)
              ? [5, 5]
              : undefined;
          },
        },
      },
    ],
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* New Account Setup Component */}
      {userRole === UserRole.ADMINISTRADOR && <NewAccount />}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <button
          onClick={() => dashboardQuery.refetch()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
        >
          <TrendingUp size={16} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Time Range Selector */}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex items-center space-x-2 mb-3">
          <Clock className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            Período de Análisis
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {timeRangeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => handleTimeRangeChange(option.value)}
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                !customRange && selectedTimeRange === option.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {option.label}
            </button>
          ))}
          {/* Fechas libres (Fase 2): editar cualquiera activa el rango
              personalizado; elegir un preset lo apaga. */}
          <div
            className={`ml-auto flex items-center gap-2 rounded-lg border px-3 py-1.5 ${
              customRange
                ? "border-blue-400 bg-blue-50"
                : "border-gray-300 bg-white"
            }`}
          >
            <input
              type="date"
              value={customRange?.start || resolveRange().start_date}
              onChange={(e) =>
                setCustomRange({
                  start: e.target.value,
                  end: customRange?.end || resolveRange().end_date,
                })
              }
              className="text-sm bg-transparent border-0 focus:ring-0 text-gray-700"
            />
            <span className="text-sm text-gray-400">hasta</span>
            <input
              type="date"
              value={customRange?.end || resolveRange().end_date}
              onChange={(e) =>
                setCustomRange({
                  start: customRange?.start || resolveRange().start_date,
                  end: e.target.value,
                })
              }
              className="text-sm bg-transparent border-0 focus:ring-0 text-gray-700"
            />
          </div>
        </div>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Requerimientos
              </p>
              <p className="text-2xl font-bold text-blue-600">
                {data.totalRequests}
              </p>
            </div>
            <ClipboardList className="h-8 w-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Ventas Totales
              </p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(data.totalSales, company?.currency || "CLP")}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Clientes</p>
              <p className="text-2xl font-bold text-purple-600">
                {data.totalClients}
              </p>
            </div>
            <Building className="h-8 w-8 text-purple-600" />
          </div>
        </div>
      </div>

      {/* Gráficos principales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cotizaciones por mes */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center space-x-2 mb-4">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Cotizaciones por Mes
            </h2>
            <span className="text-sm text-gray-500">(Todos los estados)</span>
          </div>
          <div className="h-64">
            <Line data={chartData} options={chartOptions} plugins={[etiquetasDePunto]} />
          </div>
        </div>

        {/* Eventos por mes */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center space-x-2 mb-4">
            <Calendar className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Eventos por Mes
            </h2>
            <span className="text-sm text-gray-500">(Solo aceptados)</span>
          </div>
          <div className="h-64">
            <Line data={eventsChartData} options={eventsChartOptions} plugins={[etiquetasDePunto]} />
          </div>
        </div>

      </div>

      {/* FASE 3 (23-07): la plata se lee en TABLA — reemplaza las curvas
          de Ventas y Flujo de Caja. Ventas = eventos concretados por mes
          de evento; Cobrado/Por cobrar = pagos por mes. Meses futuros en
          gris (venta agendada). */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center space-x-2 mb-4">
          <DollarSign className="h-5 w-5 text-green-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            Ingresos y Caja por Mes
          </h2>
          <span className="text-sm text-gray-500">
            (Eventos concretados y pagos del período)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-2 font-medium">Mes</th>
                <th className="py-2 px-2 text-right font-medium">Eventos</th>
                <th className="py-2 px-2 text-right font-medium">Ventas</th>
                <th className="py-2 px-2 text-right font-medium">Cobrado</th>
                <th className="py-2 pl-2 text-right font-medium">
                  Por cobrar
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.moneyByMonth.map((row) => {
                const futuro = isMonthInFuture(row.monthKey);
                return (
                  <tr
                    key={row.monthKey}
                    className={`hover:bg-gray-50 ${futuro ? "text-gray-400" : ""}`}
                  >
                    <td className="py-1.5 pr-2 font-medium">
                      {row.month}
                      {futuro && (
                        <span className="ml-1.5 text-[10px] uppercase tracking-wide">
                          · futuro
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums">
                      {row.eventos || "—"}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums">
                      {row.ventas
                        ? formatCurrency(row.ventas, company?.currency || "CLP")
                        : "—"}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-green-700">
                      {row.cobrado
                        ? formatCurrency(
                            row.cobrado,
                            company?.currency || "CLP",
                          )
                        : "—"}
                    </td>
                    <td
                      className={`py-1.5 pl-2 text-right tabular-nums ${
                        row.porCobrar && !futuro
                          ? "text-red-600 font-semibold"
                          : ""
                      }`}
                    >
                      {row.porCobrar
                        ? formatCurrency(
                            row.porCobrar,
                            company?.currency || "CLP",
                          )
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                <td className="py-2 pr-2">TOTAL</td>
                <td className="py-2 px-2 text-right tabular-nums">
                  {data.moneyByMonth.reduce((sum, r) => sum + r.eventos, 0)}
                </td>
                <td className="py-2 px-2 text-right tabular-nums">
                  {formatCurrency(
                    data.moneyByMonth.reduce((sum, r) => sum + r.ventas, 0),
                    company?.currency || "CLP",
                  )}
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-green-700">
                  {formatCurrency(
                    data.moneyByMonth.reduce((sum, r) => sum + r.cobrado, 0),
                    company?.currency || "CLP",
                  )}
                </td>
                <td className="py-2 pl-2 text-right tabular-nums text-red-700">
                  {formatCurrency(
                    data.moneyByMonth.reduce((sum, r) => sum + r.porCobrar, 0),
                    company?.currency || "CLP",
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Cotizaciones por estado */}
      {/* <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center space-x-2 mb-4">
          <PieChart className="h-5 w-5 text-green-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            Cotizaciones por Estado
          </h2>
        </div>
        <div className="space-y-3">
          {data.quotationsByStatus.map((item, index) => (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div
                  className={`w-3 h-3 rounded-full ${getStatusColor(item.status)}`}
                ></div>
                <span className="text-sm text-gray-600">
                  {getStatusLabel(item.status)}
                </span>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-gray-900">
                  {item.count}
                </div>
                <div className="text-xs text-gray-500">
                  {formatCurrency(item.amount, company?.currency || "CLP")}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div> */}

      {/* Pipeline de ventas */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center space-x-2 mb-6">
          <TrendingUp className="h-5 w-5 text-orange-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            Pipeline de Negocio
          </h2>
          {/* <span className="text-sm text-gray-500">(Excluye rechazadas)</span> */}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-700">
                  Estado
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">
                  Cantidad
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">
                  Monto Total
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">
                  Promedio
                </th>
              </tr>
            </thead>
            <tbody>
              {data.salesPipeline.map((item, index) => (
                <tr
                  key={index}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center space-x-2">
                      <div
                        className={`w-3 h-3 rounded-full ${getStatusColor(item.status)}`}
                      ></div>
                      <span className="font-medium">
                        {getStatusLabel(item.status)}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-semibold">
                    {item.count}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-green-600">
                    {formatCurrency(item.amount, company?.currency || "CLP")}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-600">
                    {item.count > 0
                      ? formatCurrency(
                          item.amount / item.count,
                          company?.currency || "CLP",
                        )
                      : formatCurrency(0, company?.currency || "CLP")}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                <td className="py-3 px-4">TOTAL PIPELINE</td>
                <td className="py-3 px-4 text-right">
                  {data.salesPipeline.reduce(
                    (sum, item) => sum + item.count,
                    0,
                  )}
                </td>
                <td className="py-3 px-4 text-right text-green-700">
                  {formatCurrency(
                    data.salesPipeline.reduce(
                      (sum, item) => sum + item.amount,
                      0,
                    ),
                    company?.currency || "CLP",
                  )}
                </td>
                <td className="py-3 px-4 text-right text-gray-700">
                  {data.salesPipeline.reduce(
                    (sum, item) => sum + item.count,
                    0,
                  ) > 0
                    ? formatCurrency(
                        data.salesPipeline.reduce(
                          (sum, item) => sum + item.amount,
                          0,
                        ) /
                          data.salesPipeline.reduce(
                            (sum, item) => sum + item.count,
                            0,
                          ),
                        company?.currency || "CLP",
                      )
                    : formatCurrency(0, company?.currency || "CLP")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ================= ANÁLISIS (ex-Analytics, Fase 2) =================
          Las 9 tablas viven aquí bajo el MISMO período, en secciones
          plegables. La pestaña Analytics se jubiló: /analytics redirige. */}
      {[
        {
          key: "comercial",
          titulo: "Análisis comercial",
          sub: "Estados, conversión e ingresos del período",
          contenido: stats && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <QuotationStatusStatsComponent
                stats={stats.quotation_status_stats}
              />
              <EventTypeConversionStatsComponent
                stats={stats.event_type_conversion_stats}
              />
              {company && (
                <EventTypeRevenueStatsComponent
                  stats={stats.event_type_revenue_stats}
                  currency={company.currency}
                />
              )}
              {company && (
                <RevenueByClientTypeStatsComponent
                  stats={stats.revenue_by_client_type}
                  currency={company.currency}
                />
              )}
            </div>
          ),
        },
        {
          key: "clientes",
          titulo: "Análisis de clientes",
          sub: "Top 10 por ingresos y cotizaciones, recurrentes",
          contenido: stats && company && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TopClientsByRevenueStatsComponent
                stats={stats.top_clients_by_revenue}
                currency={company.currency}
              />
              <TopClientsByQuotationsStatsComponent
                stats={stats.top_clients_by_quotations || []}
              />
              <RecurringClientsStatsComponent
                stats={stats.recurring_clients || []}
                currency={company.currency}
              />
            </div>
          ),
        },
        {
          key: "servicios",
          titulo: "Análisis de servicios",
          sub: "Los más presentes en eventos concretados",
          contenido: stats && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <VariableServicesUsageStatsComponent
                stats={stats.variable_services_usage}
              />
              <FixedServicesUsageStatsComponent
                stats={stats.fixed_services_usage}
              />
            </div>
          ),
        },
      ].map((sec) => (
        <div key={sec.key} className="bg-white rounded-lg shadow">
          <button
            type="button"
            onClick={() => toggleSection(sec.key)}
            className="w-full flex items-center justify-between px-6 py-4 text-left"
          >
            <span className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              <span>
                <span className="block text-lg font-semibold text-gray-900">
                  {sec.titulo}
                </span>
                <span className="block text-xs text-gray-500">{sec.sub}</span>
              </span>
            </span>
            {openSections.has(sec.key) ? (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronRight className="h-5 w-5 text-gray-400" />
            )}
          </button>
          {openSections.has(sec.key) && (
            <div className="px-6 pb-6">
              {sec.contenido || (
                <p className="text-sm text-gray-400">
                  {statsQuery.isError
                    ? "No se pudieron cargar estas tablas — reintenta con Actualizar."
                    : "Cargando análisis…"}
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
