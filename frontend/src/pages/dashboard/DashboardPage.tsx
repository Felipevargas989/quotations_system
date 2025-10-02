import { useState, useEffect } from "react";
import {
  DollarSign,
  TrendingUp,
  ClipboardList,
  Building,
  Calendar,
  BarChart3,
  PieChart,
  Clock,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { getDashboardStats } from "../../services/analytics.service";
import NewAccount from "./components/NewAccount";
import { UserRole } from "../../constants/users";
import { subMonths, subYears } from "date-fns";
import { MONTHS } from "../../constants/dates";
import { QuotationStatus } from "../../types/quotations.types";

interface DashboardData {
  totalRequests: number;
  totalClients: number;
  totalSales: number;
  requestsByMonth: { month: string; count: number }[];
  quotationsByStatus: { status: string; count: number; amount: number }[];
  eventsByMonth: { month: string; count: number }[];
  salesPipeline: { status: string; amount: number; count: number }[];
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

  const [data, setData] = useState<DashboardData>({
    totalRequests: 0,
    totalClients: 0,
    totalSales: 0,
    requestsByMonth: [],
    quotationsByStatus: [],
    eventsByMonth: [],
    salesPipeline: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && company?.id) {
      loadDashboardData();
    }
  }, [user, company?.id, selectedTimeRange]);

  const loadDashboardData = async () => {
    if (!user || !company?.id) return;

    try {
      setLoading(true);

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
        console.error("No analytics data received");
        return;
      }

      // Get total requests count from analytics service
      const totalRequests = analyticsData.totalQuotations;

      const totalClients = analyticsData.totalClients;

      // Calculate total sales from analytics service
      const totalSales =
        analyticsData.totalQuotationsByStatus?.aceptada?.amount || 0;

      // Convert totalQuotationsByMonth to requestsByMonth format
      const requestsByMonth = Object.keys(
        analyticsData.totalQuotationsByMonth,
      ).map((month: string) => ({
        month: MONTHS[month as keyof typeof MONTHS],
        count: analyticsData.totalQuotationsByMonth[month],
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
      ).map((month: string) => ({
        month: MONTHS[month as keyof typeof MONTHS],
        count: analyticsData.totalQuotationsByEventDate[month],
      }));

      // Pipeline de ventas (excluye rechazadas)
      const salesPipeline = quotationsByStatus.filter(
        (item) => item.status !== QuotationStatus.RECHAZADA,
      );

      setData({
        totalRequests,
        totalClients,
        totalSales,
        requestsByMonth: requestsByMonth as { month: string; count: number }[],
        quotationsByStatus,
        eventsByMonth: eventsByMonth as { month: string; count: number }[],
        salesPipeline,
      });
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleTimeRangeChange = (value: string) => {
    setSelectedTimeRange(value);
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <button
          onClick={loadDashboardData}
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

      {/* New Account Setup Component */}
      {userRole === UserRole.ADMINISTRADOR && <NewAccount />}

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
                {formatCurrency(data.totalSales)}
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
        {/* Requerimientos por mes */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center space-x-2 mb-4">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Requerimientos por Mes
            </h2>
          </div>
          <div className="space-y-3">
            {data.requestsByMonth.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 w-20">{item.month}</span>
                <div className="flex-1 mx-4">
                  <div className="bg-gray-200 rounded-full h-4">
                    <div
                      className="bg-blue-500 h-4 rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.max((item.count / Math.max(...data.requestsByMonth.map((r) => r.count), 1)) * 100, 5)}%`,
                      }}
                    ></div>
                  </div>
                </div>
                <span className="text-sm font-semibold text-gray-900 w-8 text-right">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Cotizaciones por estado */}
        <div className="bg-white p-6 rounded-lg shadow">
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
                    {formatCurrency(item.amount)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Eventos por mes */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center space-x-2 mb-4">
          <Calendar className="h-5 w-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            Eventos por Mes
          </h2>
        </div>
        <div className="space-y-3">
          {data.eventsByMonth.map((item, index) => (
            <div key={index} className="flex items-center justify-between">
              <span className="text-sm text-gray-600 w-20">{item.month}</span>
              <div className="flex-1 mx-4">
                <div className="bg-gray-200 rounded-full h-4">
                  <div
                    className="bg-purple-500 h-4 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.max((item.count / Math.max(...data.eventsByMonth.map((e) => e.count), 1)) * 100, 5)}%`,
                    }}
                  ></div>
                </div>
              </div>
              <span className="text-sm font-semibold text-gray-900 w-8 text-right">
                {item.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Pipeline de ventas */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center space-x-2 mb-6">
          <TrendingUp className="h-5 w-5 text-orange-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            Pipeline de Negocio
          </h2>
          <span className="text-sm text-gray-500">(Excluye rechazadas)</span>
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
                    {formatCurrency(item.amount)}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-600">
                    {item.count > 0
                      ? formatCurrency(item.amount / item.count)
                      : formatCurrency(0)}
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
                      )
                    : formatCurrency(0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
