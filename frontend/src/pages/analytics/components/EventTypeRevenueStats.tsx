import { EventTypeRevenueStats } from "../../../types/analytics.types";
import { formatCurrency } from "../../../utils/currencies";

interface EventTypeRevenueStatsProps {
  readonly stats: EventTypeRevenueStats[];
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

export default function EventTypeRevenueStatsComponent({
  stats,
}: EventTypeRevenueStatsProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-3 border-b border-gray-200">
        <h3 className="text-base font-semibold text-gray-900">
          Ingresos por Tipo de Evento
        </h3>
        <p className="text-xs text-gray-600">
          Total de eventos y ingresos generados por tipo
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
              <div
                key={`${stat.event_type}-${stat.total_revenue}`}
                className="space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-base font-medium">
                      {getEventTypeLabel(stat.event_type)}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-600">
                      {stat.total_events} eventos
                    </div>
                    <span className="text-xs text-gray-600">
                      {stat.revenue_percentage.toFixed(1)}% del total de
                      ingresos del periodo
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-700">
                      Ingresos
                    </span>
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">
                        {formatCurrency(stat.total_revenue)}
                      </span>
                    </div>
                  </div>

                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full transition-all duration-500 bg-blue-500"
                      style={{
                        width: `${stat.revenue_percentage}%`,
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
