import { EventTypeConversionStats } from "../../../types/analytics.types";

interface EventTypeConversionStatsProps {
  stats: EventTypeConversionStats[];
}

const getEventTypeLabel = (eventType: string) => {
  switch (eventType) {
    case "Almuerzo o Cena":
      return "🍽️ Almuerzo o Cena";
    case "Paseo de Curso":
      return "🚌 Paseo de Curso";
    case "Uso salones":
      return "🏢 Uso salones";
    case "Estadía y Alimentación":
      return "🏨 Estadía y Alimentación";
    case "Paseo fin de año":
      return "🎉 Paseo fin de año";
    case "Celebraciones":
      return "🎊 Celebraciones";
    case "Matrimonios":
      return "💒 Matrimonios";
    case "Graduación":
      return "🎓 Graduación";
    default:
      return eventType;
  }
};

const getConversionRateColor = (rate: number) => {
  if (rate >= 70) return "text-green-600";
  if (rate >= 50) return "text-yellow-600";
  return "text-red-600";
};

const getConversionRateBgColor = (rate: number) => {
  if (rate >= 70) return "bg-green-100";
  if (rate >= 50) return "bg-yellow-100";
  return "bg-red-100";
};

export default function EventTypeConversionStatsComponent({
  stats,
}: EventTypeConversionStatsProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">
          Conversión por Tipo de Evento
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          Tasa de conversión de cotizaciones por tipo de evento
        </p>
      </div>
      <div className="p-6">
        <div className="space-y-6">
          {stats.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No hay datos disponibles</p>
            </div>
          ) : (
            stats.map((stat, index) => (
              <div key={index} className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-lg font-medium">
                      {getEventTypeLabel(stat.event_type)}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-600">
                      {stat.total_quotations} cotizaciones totales
                    </div>
                    <div className="text-sm text-gray-600">
                      {stat.accepted_quotations} aceptadas
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      Tasa de Conversión
                    </span>
                    <span
                      className={`px-3 py-1 text-sm font-semibold rounded-full ${getConversionRateBgColor(stat.conversion_rate_percentage)} ${getConversionRateColor(stat.conversion_rate_percentage)}`}
                    >
                      {stat.conversion_rate_percentage.toFixed(1)}%
                    </span>
                  </div>

                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-500 ${getConversionRateBgColor(stat.conversion_rate_percentage)}`}
                      style={{
                        width: `${Math.min(stat.conversion_rate_percentage, 100)}%`,
                      }}
                    ></div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">
                      {stat.total_quotations}
                    </div>
                    <div className="text-sm text-gray-600">
                      Total Cotizaciones
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {stat.accepted_quotations}
                    </div>
                    <div className="text-sm text-gray-600">Aceptadas</div>
                  </div>
                </div>

                {index < stats.length - 1 && (
                  <div className="border-b border-gray-100"></div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
