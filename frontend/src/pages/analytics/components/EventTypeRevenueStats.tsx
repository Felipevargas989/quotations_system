import { EventTypeRevenueStats } from "../../../types/analytics.types";
import { formatCurrency } from "../../../utils/currencies";
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
import { Company } from "../../../types/companies.types";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
);

interface EventTypeRevenueStatsProps {
  readonly stats: EventTypeRevenueStats[];
  readonly currency: Company["currency"];
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

export default function EventTypeRevenueStatsComponent({
  stats,
  currency,
}: EventTypeRevenueStatsProps) {
  const chartData = {
    labels: stats.map((stat) => getEventTypeLabel(stat.event_type)),
    datasets: [
      {
        label: "Ingresos (CLP)",
        data: stats.map((stat) => stat.total_revenue),
        backgroundColor: "#3B82F6", // blue-500
        borderColor: "#1D4ED8", // blue-700
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
              `Ingresos: ${formatCurrency(stat.total_revenue, currency)}`,
              `Eventos: ${stat.total_events}`,
              `Porcentaje: ${stat.revenue_percentage.toFixed(1)}% del total`,
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
        ticks: {
          callback: function (value: any) {
            return formatCurrency(value, currency);
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
          Ingresos por Tipo de Evento
        </h3>
        <p className="text-xs text-gray-600">
          Total de eventos y ingresos generados por tipo
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
