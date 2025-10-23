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
      <div className="p-3 border-b border-gray-200">
        <h3 className="text-base font-semibold text-gray-900">
          Conversión por Tipo de Evento
        </h3>
        <p className="text-xs text-gray-600">
          Tasa de conversión de cotizaciones por tipo de evento
        </p>
      </div>
      <div className="p-3">
        <div className="space-y-3">
          {stats.length === 0 ? (
            <div className="text-center py-2">
              <p className="text-gray-500 text-sm">No hay datos disponibles</p>
            </div>
          ) : (
            stats.map((stat, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-base font-medium">
                      {getEventTypeLabel(stat.event_type)}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-600">
                      {stat.total_quotations} totales
                    </div>
                    <div className="text-xs text-gray-600">
                      {stat.accepted_quotations} aceptadas
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-700">
                      Conversión
                    </span>
                    <span
                      className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getConversionRateBgColor(stat.conversion_rate_percentage)} ${getConversionRateColor(stat.conversion_rate_percentage)}`}
                    >
                      {stat.conversion_rate_percentage.toFixed(1)}%
                    </span>
                  </div>

                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-500 ${getConversionRateBgColor(stat.conversion_rate_percentage)}`}
                      style={{
                        width: `${Math.min(stat.conversion_rate_percentage, 100)}%`,
                      }}
                    ></div>
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
