import { useState, useEffect } from "react";
import {
  DollarSign,
  TrendingUp,
  ClipboardList,
  Building,
  Calendar,
  BarChart3,
  PieChart,
  ArrowUp,
  ArrowDown,
  Minus,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { getDashboardStats } from "../../services/analytics.service";
import NewAccount from "./components/NewAccount";
import { UserRole } from "../../constants/users";

interface DashboardData {
  totalRequests: number;
  totalClients: number;
  totalSales: number;
  growth: number;
  requestsByMonth: { month: string; count: number }[];
  quotationsByStatus: { status: string; count: number; amount: number }[];
  upcomingPayments: { month: string; amount: number }[];
  eventsByMonth: { month: string; count: number }[];
  salesPipeline: { status: string; amount: number; count: number }[];
}

export default function DashboardPage() {
  const { user, company, userRole } = useAuth();
  const [data, setData] = useState<DashboardData>({
    totalRequests: 0,
    totalClients: 0,
    totalSales: 0,
    growth: 0,
    requestsByMonth: [],
    quotationsByStatus: [],
    upcomingPayments: [],
    eventsByMonth: [],
    salesPipeline: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && company?.id) {
      loadDashboardData();
    }
  }, [user, company?.id]);

  const loadDashboardData = async () => {
    if (!user || !company?.id) return;

    try {
      setLoading(true);

      // Get dashboard stats from analytics service
      const analyticsData = await getDashboardStats();

      if (!analyticsData) {
        console.error("No analytics data received");
        return;
      }

      // TODO: Get total requests count from analytics service
      // Currently using quotations count as proxy
      const totalRequests = analyticsData.totalQuotations;

      const totalClients = analyticsData.totalClients;

      // TODO: Calculate total sales from analytics service
      // Currently using accepted quotations amount from status data
      const totalSales =
        analyticsData.totalQuotationsByStatus?.aceptada?.amount || 0;

      // TODO: Calculate growth from analytics service
      // Currently mocking growth calculation
      const growth = 0; // Mock value - needs to be calculated from analytics service

      // TODO: Convert totalQuotationsByMonth to requestsByMonth format
      // Currently mocking the data structure
      const requestsByMonth = [
        { month: "Ene 2024", count: 5 },
        { month: "Feb 2024", count: 8 },
        { month: "Mar 2024", count: 12 },
        { month: "Abr 2024", count: 15 },
        { month: "May 2024", count: 10 },
        { month: "Jun 2024", count: analyticsData.totalQuotations },
      ];

      // Convert quotations by status to the expected format
      const quotationsByStatus = Object.entries(
        analyticsData.totalQuotationsByStatus || {},
      ).map(([status, data]) => ({
        status,
        count: data.count,
        amount: data.amount,
      }));

      // TODO: Get upcoming payments from analytics service
      // Currently mocking the data
      const upcomingPayments = [
        { month: "Jul 2024", amount: 1500000 },
        { month: "Ago 2024", amount: 2300000 },
        { month: "Sep 2024", amount: 1800000 },
      ];

      // TODO: Convert totalQuotationsByEventDate to eventsByMonth format
      // Currently mocking the data structure
      const eventsByMonth = [
        { month: "Ene 2024", count: 3 },
        { month: "Feb 2024", count: 6 },
        { month: "Mar 2024", count: 9 },
        { month: "Abr 2024", count: 12 },
        { month: "May 2024", count: 8 },
        { month: "Jun 2024", count: 11 },
      ];

      // Pipeline de ventas (excluye rechazadas)
      const salesPipeline = quotationsByStatus.filter(
        (item) => item.status !== "rechazada",
      );

      setData({
        totalRequests,
        totalClients,
        totalSales,
        growth,
        requestsByMonth,
        quotationsByStatus,
        upcomingPayments,
        eventsByMonth,
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

  const getGrowthIcon = () => {
    if (data.growth > 0) return <ArrowUp className="h-4 w-4 text-green-600" />;
    if (data.growth < 0) return <ArrowDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-gray-600" />;
  };

  const getGrowthColor = () => {
    if (data.growth > 0) return "text-green-600";
    if (data.growth < 0) return "text-red-600";
    return "text-gray-600";
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

      {/* New Account Setup Component */}
      {userRole === UserRole.ADMINISTRADOR && <NewAccount />}

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Crecimiento</p>
              <div className="flex items-center space-x-1">
                <p className={`text-2xl font-bold ${getGrowthColor()}`}>
                  {data.growth.toFixed(1)}%
                </p>
                {getGrowthIcon()}
              </div>
            </div>
            <TrendingUp className="h-8 w-8 text-orange-600" />
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

      {/* Gráficos secundarios */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Próximos pagos */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center space-x-2 mb-4">
            <DollarSign className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Próximos Pagos/Cobros
            </h2>
          </div>
          <div className="space-y-3">
            {data.upcomingPayments.length > 0 ? (
              data.upcomingPayments.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 w-20">
                    {item.month}
                  </span>
                  <div className="flex-1 mx-4">
                    <div className="bg-gray-200 rounded-full h-4">
                      <div
                        className="bg-green-500 h-4 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.max((item.amount / Math.max(...data.upcomingPayments.map((p) => p.amount), 1)) * 100, 5)}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 text-right">
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">
                No hay pagos pendientes
              </p>
            )}
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
