import { QuotationStatusStats } from "../../../types/analytics.types";

interface QuotationStatusStatsProps {
  stats: QuotationStatusStats[];
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "solicitada":
      return "bg-yellow-100 text-yellow-800";
    case "enviada":
      return "bg-blue-100 text-blue-800";
    case "en_negociacion":
      return "bg-purple-100 text-purple-800";
    case "aceptada":
      return "bg-green-100 text-green-800";
    case "rechazada":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "solicitada":
      return "📋 Solicitada";
    case "enviada":
      return "📤 Enviada";
    case "en_negociacion":
      return "💬 En Negociación";
    case "aceptada":
      return "✅ Aceptada";
    case "rechazada":
      return "❌ Rechazada";
    default:
      return status;
  }
};

export default function QuotationStatusStatsComponent({
  stats,
}: QuotationStatusStatsProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">
          Estadísticas por Estado
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          Distribución de cotizaciones por estado
        </p>
      </div>
      <div className="p-6">
        <div className="space-y-4">
          {stats.map((stat, index) => (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span
                  className={`px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(stat.quotation_status)}`}
                >
                  {getStatusLabel(stat.quotation_status)}
                </span>
                <span className="text-sm text-gray-600">
                  {stat.total} cotizaciones
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${stat.percentage}%` }}
                  ></div>
                </div>
                <span className="text-sm font-medium text-gray-900 w-12 text-right">
                  {stat.percentage.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>

        {stats.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500">No hay datos disponibles</p>
          </div>
        )}
      </div>
    </div>
  );
}
