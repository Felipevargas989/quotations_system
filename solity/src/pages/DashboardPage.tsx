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
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  parseISO,
} from "date-fns";
import { es } from "date-fns/locale";
import { getQuotations } from "../services/quotations.service";
import { QuotationRequestType } from "../types/quotations.types";
import { getClients } from "../services/clients.service";

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
  const { user, companyId } = useAuth();
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
    if (user && companyId) {
      loadDashboardData();
    }
  }, [user, companyId]);

  const loadDashboardData = async () => {
    if (!user || !companyId) return;

    try {
      setLoading(true);

      // 1. Total de requerimientos (TODOS)
      const { data: requestsData } = await getQuotations(
        companyId.toString(),
        QuotationRequestType.REQUERIMIENTO,
      );

      // 2. Total de clientes (TODOS)
      const { data: clientsData } = await getClients(companyId.toString());

      // 3. Cotizaciones por estado (TODAS)
      const { data: quotationsData } = await getQuotations(
        companyId.toString(),
        QuotationRequestType.COTIZACION,
      );

      // 4. Próximos pagos (TODOS para admin/operaciones)
      // TODO: check if move to service
      const { data: paymentsData } = await supabase
        .from("payments")
        .select("id, amount, due_date, status")
        .eq("status", "pendiente")
        .eq("company_id", companyId.toString())
        .gte("due_date", new Date().toISOString().split("T")[0])
        .order("due_date");

      // Procesar datos
      const totalRequests = requestsData?.length || 0;
      const totalClients = clientsData?.length || 0;

      // Calcular ventas totales (cotizaciones aceptadas)
      const acceptedQuotations =
        quotationsData?.filter((q) => q.quotation_status === "aceptada") || [];
      const totalSales = acceptedQuotations.reduce(
        (sum, q) => sum + (q.total_amount || 0),
        0,
      );

      // Calcular crecimiento intermensual de requerimientos
      const currentMonth = new Date();
      const lastMonth = subMonths(currentMonth, 1);

      const currentMonthRequests =
        requestsData?.filter((r) => {
          const createdDate = parseISO(r.created_at);
          return (
            createdDate >= startOfMonth(currentMonth) &&
            createdDate <= endOfMonth(currentMonth)
          );
        }).length || 0;

      const lastMonthRequests =
        requestsData?.filter((r) => {
          const createdDate = parseISO(r.created_at);
          return (
            createdDate >= startOfMonth(lastMonth) &&
            createdDate <= endOfMonth(lastMonth)
          );
        }).length || 0;

      const growth =
        lastMonthRequests > 0
          ? ((currentMonthRequests - lastMonthRequests) / lastMonthRequests) *
            100
          : currentMonthRequests > 0
            ? 100
            : 0;

      // Requerimientos por mes (últimos 6 meses)
      const requestsByMonth = [];
      for (let i = 5; i >= 0; i--) {
        const month = subMonths(currentMonth, i);
        const monthRequests =
          requestsData?.filter((r) => {
            const createdDate = parseISO(r.created_at);
            return (
              createdDate >= startOfMonth(month) &&
              createdDate <= endOfMonth(month)
            );
          }).length || 0;

        requestsByMonth.push({
          month: format(month, "MMM yyyy", { locale: es }),
          count: monthRequests,
        });
      }

      // Cotizaciones por estado
      const statusCounts = {
        solicitada: { count: 0, amount: 0 },
        enviada: { count: 0, amount: 0 },
        en_negociacion: { count: 0, amount: 0 },
        aceptada: { count: 0, amount: 0 },
        rechazada: { count: 0, amount: 0 },
      };

      quotationsData?.forEach((q) => {
        if (statusCounts[q.quotation_status as keyof typeof statusCounts]) {
          statusCounts[q.quotation_status as keyof typeof statusCounts].count++;
          statusCounts[
            q.quotation_status as keyof typeof statusCounts
          ].amount += q.total_amount || 0;
        }
      });

      const quotationsByStatus = Object.entries(statusCounts).map(
        ([status, data]) => ({
          status,
          count: data.count,
          amount: data.amount,
        }),
      );

      // Próximos pagos por mes
      const paymentsByMonth: Record<string, number> = {};
      paymentsData?.forEach((p) => {
        const month = format(parseISO(p.due_date), "MMM yyyy", { locale: es });
        paymentsByMonth[month] = (paymentsByMonth[month] || 0) + p.amount;
      });

      const upcomingPayments = Object.entries(paymentsByMonth)
        .slice(0, 6)
        .map(([month, amount]) => ({ month, amount }));

      // Eventos por mes (basado en event_date)
      const eventsByMonth = [];
      for (let i = 5; i >= 0; i--) {
        const month = subMonths(currentMonth, i);
        const monthEvents =
          quotationsData?.filter((q) => {
            if (!q.event_date) return false;
            const eventDate = parseISO(q.event_date);
            return (
              eventDate >= startOfMonth(month) && eventDate <= endOfMonth(month)
            );
          }).length || 0;

        eventsByMonth.push({
          month: format(month, "MMM yyyy", { locale: es }),
          count: monthEvents,
        });
      }

      // Pipeline de ventas (excluye rechazadas)
      const salesPipeline = Object.entries(statusCounts)
        .filter(([status]) => status !== "rechazada")
        .map(([status, data]) => ({
          status,
          amount: data.amount,
          count: data.count,
        }));

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
