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
  paymentsByMonth: { month: string; amount: number; monthKey: string }[];
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

  const EMPTY_DASHBOARD: DashboardData = {
    totalRequests: 0,
    totalClients: 0,
    totalSales: 0,
    requestsByMonth: [],
    quotationsByStatus: [],
    eventsByMonth: [],
    salesPipeline: [],
    paymentsByMonth: [],
  };

  // Dashboard vía React Query (Etapa 5): una clave por rango de tiempo;
  // al cambiar el rango se sigue mostrando el anterior mientras llega
  // el nuevo (sin parpadeo), y volver al dashboard es instantáneo.
  const dashboardQuery = useQuery({
    queryKey: ["dashboard", company?.id, selectedTimeRange],
    enabled: !!user && !!company?.id,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<DashboardData> => {
      // Get selected time range and its date range
      const selectedOption = timeRangeOptions.find(
        (option) => option.value === selectedTimeRange,
      );
      const dateRange =
        selectedOption?.getDateRange() || timeRangeOptions[2].getDateRange(); // fallback to 1 year

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

      // Calculate total sales from analytics service
      const totalSales =
        analyticsData.totalQuotationsByStatus?.aceptada?.amount || 0;

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
      const paymentsByMonth = Object.keys(
        analyticsData.totalPaymentsByMonth || {},
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
          amount: analyticsData.totalPaymentsByMonth[monthYearKey],
          monthKey: monthYearKey,
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
        paymentsByMonth: paymentsByMonth as {
          month: string;
          amount: number;
          monthKey: string;
        }[],
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

  const handleTimeRangeChange = (value: string) => {
    setSelectedTimeRange(value);
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

  // Chart configuration for the sales line chart
  const salesChartOptions = {
    responsive: true,
    puntoAbrev: true,
    layout: { padding: { top: 16 } },
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            return `Ventas: ${formatCurrency(context.parsed.y, company?.currency || "CLP")}`;
          },
        },
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
          // Eje abreviado (16M); el monto completo vive en el tooltip.
          callback: function (value: any) {
            return "$" + abrevCifra(Number(value));
          },
        },
      },
    },
    maintainAspectRatio: false,
  };

  // Prepare chart data for sales
  const salesChartData = {
    labels: data.eventsByMonth.map((item) => item.month),
    datasets: [
      {
        label: "Ventas",
        data: data.eventsByMonth.map((item) => item.amount),
        borderColor: "rgb(16, 185, 129)", // Green color
        backgroundColor: "rgba(16, 185, 129, 0.1)",
        borderWidth: 2,
        pointBackgroundColor: "rgb(16, 185, 129)",
        pointBorderColor: "rgb(16, 185, 129)",
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.4,
        fill: true,
        segment: {
          borderColor: (ctx: any) => {
            const nextIndex = ctx.p1DataIndex;
            if (nextIndex >= data.eventsByMonth.length)
              return "rgb(16, 185, 129)";
            return isMonthInFuture(data.eventsByMonth[nextIndex].monthKey)
              ? "rgba(16, 185, 129, 0.3)"
              : "rgb(16, 185, 129)";
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

  // Chart configuration for the cash flow line chart
  const cashFlowChartOptions = {
    responsive: true,
    puntoAbrev: true,
    layout: { padding: { top: 16 } },
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            return `Pagos: ${formatCurrency(context.parsed.y, company?.currency || "CLP")}`;
          },
        },
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
          // Eje abreviado (16M); el monto completo vive en el tooltip.
          callback: function (value: any) {
            return "$" + abrevCifra(Number(value));
          },
        },
      },
    },
    maintainAspectRatio: false,
  };

  // Prepare chart data for cash flow
  const cashFlowChartData = {
    labels: data.paymentsByMonth.map((item) => item.month),
    datasets: [
      {
        label: "Flujo de Caja",
        data: data.paymentsByMonth.map((item) => item.amount),
        borderColor: "rgb(234, 88, 12)", // Orange color
        backgroundColor: "rgba(234, 88, 12, 0.1)",
        borderWidth: 2,
        pointBackgroundColor: "rgb(234, 88, 12)",
        pointBorderColor: "rgb(234, 88, 12)",
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.4,
        fill: true,
        segment: {
          borderColor: (ctx: any) => {
            const nextIndex = ctx.p1DataIndex;
            if (nextIndex >= data.paymentsByMonth.length)
              return "rgb(234, 88, 12)";
            return isMonthInFuture(data.paymentsByMonth[nextIndex].monthKey)
              ? "rgba(234, 88, 12, 0.3)"
              : "rgb(234, 88, 12)";
          },
          borderDash: (ctx: any) => {
            const nextIndex = ctx.p1DataIndex;
            if (nextIndex >= data.paymentsByMonth.length) return undefined;
            return isMonthInFuture(data.paymentsByMonth[nextIndex].monthKey)
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
        <div className="flex flex-wrap gap-2">
          {timeRangeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => handleTimeRangeChange(option.value)}
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                selectedTimeRange === option.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {option.label}
            </button>
          ))}
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

        {/* Ventas por mes */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center space-x-2 mb-4">
            <DollarSign className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Ventas por Mes
            </h2>
            <span className="text-sm text-gray-500">
              (Monto de eventos aceptados)
            </span>
          </div>
          <div className="h-64">
            <Line data={salesChartData} options={salesChartOptions} plugins={[etiquetasDePunto]} />
          </div>
        </div>

        {/* Flujo de Caja por mes */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center space-x-2 mb-4">
            <TrendingUp className="h-5 w-5 text-orange-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Flujo de Caja por Mes
            </h2>
            <span className="text-sm text-gray-500">(Pagos recibidos)</span>
          </div>
          <div className="h-64">
            <Line data={cashFlowChartData} options={cashFlowChartOptions} plugins={[etiquetasDePunto]} />
          </div>
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
    </div>
  );
}
