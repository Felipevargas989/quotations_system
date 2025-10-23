import { useState, useEffect } from "react";
import { CompleteStatsResponse } from "../../types/analytics.types";
import { getCompleteStats } from "../../services/analytics.service";
import { BarChart3, TrendingUp, Calendar } from "lucide-react";
import QuotationStatusStatsComponent from "./components/QuotationStatusStats";
import EventTypeConversionStatsComponent from "./components/EventTypeConversionStats";

export default function Analytics() {
  const [stats, setStats] = useState<CompleteStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getCompleteStats();
      setStats(data);
    } catch (err) {
      setError("Error al cargar las estadísticas");
      console.error("Error fetching analytics:", err);
    } finally {
      setLoading(false);
    }
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
      <div className="flex items-center space-x-3">
        <div className="bg-blue-100 p-2 rounded-lg">
          <BarChart3 className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-600">Estadísticas y métricas del sistema</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <QuotationStatusStatsComponent stats={stats.quotation_status_stats} />
        <EventTypeConversionStatsComponent
          stats={stats.event_type_conversion_stats}
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
