import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { CompleteStatsResponse } from "../../types/analytics.types";
import { getCompleteStats } from "../../services/analytics.service";
import { BarChart3, TrendingUp, Calendar, Filter, Search } from "lucide-react";
import QuotationStatusStatsComponent from "./components/QuotationStatusStats";
import EventTypeConversionStatsComponent from "./components/EventTypeConversionStats";
import EventTypeRevenueStatsComponent from "./components/EventTypeRevenueStats";
import RevenueByClientTypeStatsComponent from "./components/RevenueByClientTypeStats";
import TopClientsByRevenueStatsComponent from "./components/TopClientsByRevenueStats";

export default function Analytics() {
  const [searchParams] = useSearchParams();
  const [stats, setStats] = useState<CompleteStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get default date range from URL params or use one year from now
  const getDefaultDates = () => {
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    // If URL has both from and to params, use them
    if (fromParam && toParam) {
      return {
        startDate: fromParam,
        endDate: toParam,
      };
    }

    // Otherwise, use default one year range
    const today = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(today.getFullYear() - 1);

    return {
      startDate: oneYearAgo.toISOString().split("T")[0],
      endDate: today.toISOString().split("T")[0],
    };
  };

  const [dateRange, setDateRange] = useState(getDefaultDates());

  useEffect(() => {
    // Update date range when URL params change
    setDateRange(getDefaultDates());
  }, [searchParams]);

  useEffect(() => {
    fetchStats();
  }, [dateRange]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getCompleteStats(
        dateRange.startDate,
        dateRange.endDate,
      );
      setStats(data);
    } catch (err) {
      setError("Error al cargar las estadísticas");
      console.error("Error fetching analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (field: "startDate" | "endDate", value: string) => {
    setDateRange((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleApplyFilter = () => {
    fetchStats();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-100 p-2 rounded-lg">
            <BarChart3 className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            <p className="text-gray-600">Cargando estadísticas...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
              <div className="space-y-3">
                <div className="h-3 bg-gray-200 rounded"></div>
                <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
              <div className="space-y-3">
                <div className="h-3 bg-gray-200 rounded"></div>
                <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-100 p-2 rounded-lg">
            <BarChart3 className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            <p className="text-gray-600">Estadísticas y métricas del sistema</p>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center space-x-3">
            <div className="bg-red-100 p-2 rounded-lg">
              <TrendingUp className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-red-900">
                Error al cargar datos
              </h3>
              <p className="text-red-700 mt-1">{error}</p>
              <button
                onClick={fetchStats}
                className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Reintentar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-100 p-2 rounded-lg">
            <BarChart3 className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            <p className="text-gray-600">No hay datos disponibles</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-100 p-2 rounded-lg">
            <BarChart3 className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            <p className="text-gray-600">Estadísticas y métricas del sistema</p>
          </div>
        </div>

        {/* Date Range Selector */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Período:</span>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => handleDateChange("startDate", e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <span className="text-sm text-gray-500">hasta</span>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => handleDateChange("endDate", e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={handleApplyFilter}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              <Search className="h-4 w-4" />
              <span>Filtrar</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <QuotationStatusStatsComponent stats={stats.quotation_status_stats} />
        <EventTypeConversionStatsComponent
          stats={stats.event_type_conversion_stats}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EventTypeRevenueStatsComponent
          stats={stats.event_type_revenue_stats}
        />
        <RevenueByClientTypeStatsComponent
          stats={stats.revenue_by_client_type}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
        <TopClientsByRevenueStatsComponent
          stats={stats.top_clients_by_revenue}
        />
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <div className="bg-blue-100 p-2 rounded-lg">
            <Calendar className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h4 className="font-medium text-blue-900">
              Información de las Estadísticas
            </h4>
            <p className="text-sm text-blue-700 mt-1">
              Las estadísticas se actualizan en tiempo real y muestran datos de
              todas las cotizaciones del sistema.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
