import { EventTypeConversionStats } from "../../../types/analytics.types";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
);

interface EventTypeConversionStatsProps {
  readonly stats: EventTypeConversionStats[];
}

const getEventTypeLabel = (eventType: string) => {
  switch (eventType) {
    case "Almuerzo o Cena":
      return "Almuerzo o Cena";
    case "Paseo de Curso":
      return "Paseo de Curso";
    case "Uso salones":
      return "Uso salones";
    case "Estadía y Alimentación":
      return "Estadía y Alimentación";
    case "Paseo fin de año":
      return "Paseo fin de año";
    case "Celebraciones":
      return "Celebraciones";
    case "Matrimonios":
      return "Matrimonios";
    case "Graduación":
      return "Graduación";
    default:
      return eventType;
  }
};

const getConversionRateColor = (rate: number) => {
  if (rate >= 70) return "#10B981"; // green-500
  if (rate >= 50) return "#F59E0B"; // yellow-500
  return "#EF4444"; // red-500
};

export default function EventTypeConversionStatsComponent({
  stats,
}: EventTypeConversionStatsProps) {
  const chartData = {
    labels: stats.map((stat) => getEventTypeLabel(stat.event_type)),
    datasets: [
      {
        label: "Tasa de Conversión (%)",
        data: stats.map((stat) => stat.conversion_rate_percentage),
        backgroundColor: stats.map((stat) =>
          getConversionRateColor(stat.conversion_rate_percentage),
        ),
        borderColor: stats.map((stat) =>
          getConversionRateColor(stat.conversion_rate_percentage),
        ),
        borderWidth: 2,
        borderRadius: 4,
        borderSkipped: false,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            const index = context.dataIndex;
            const stat = stats[index];
            return [
              `Tipo: ${getEventTypeLabel(stat.event_type)}`,
              `Conversión: ${stat.conversion_rate_percentage.toFixed(1)}%`,
              `Total cotizaciones: ${stat.total_quotations}`,
              `Aceptadas: ${stat.accepted_quotations}`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          maxRotation: 45,
          minRotation: 45,
          font: {
            size: 11,
          },
        },
        grid: {
          display: false,
        },
      },
      y: {
        beginAtZero: true,
        max: 100,
        ticks: {
          callback: function (value: any) {
            return value + "%";
          },
          font: {
            size: 11,
          },
        },
        grid: {
          color: "#F3F4F6",
        },
      },
    },
  };

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
        {stats.length === 0 ? (
          <div className="text-center py-2">
            <p className="text-gray-500 text-sm">No hay datos disponibles</p>
          </div>
        ) : (
          <div className="h-80">
            <Bar data={chartData} options={chartOptions} />
          </div>
        )}
      </div>
    </div>
  );
}
