import { QuotationStatusStats } from "../../../types/analytics.types";
import { Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);

interface QuotationStatusStatsProps {
  readonly stats: QuotationStatusStats[];
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "solicitada":
      return "#F59E0B"; // yellow-500
    case "enviada":
      return "#3B82F6"; // blue-500
    case "en_negociacion":
      return "#8B5CF6"; // purple-500
    case "aceptada":
      return "#10B981"; // green-500
    case "rechazada":
      return "#EF4444"; // red-500
    default:
      return "#6B7280"; // gray-500
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "solicitada":
      return "Solicitada";
    case "enviada":
      return "Enviada";
    case "en_negociacion":
      return "En Negociación";
    case "aceptada":
      return "Aceptada";
    case "rechazada":
      return "Rechazada";
    default:
      return status;
  }
};

export default function QuotationStatusStatsComponent({
  stats,
}: QuotationStatusStatsProps) {
  const chartData = {
    labels: stats.map((stat) => getStatusLabel(stat.quotation_status)),
    datasets: [
      {
        data: stats.map((stat) => stat.total),
        backgroundColor: stats.map((stat) =>
          getStatusColor(stat.quotation_status),
        ),
        borderColor: stats.map((stat) => getStatusColor(stat.quotation_status)),
        borderWidth: 2,
        hoverOffset: 4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: {
          padding: 20,
          usePointStyle: true,
          font: {
            size: 12,
          },
          generateLabels: function (chart: any) {
            const data = chart.data;
            if (data.labels.length && data.datasets.length) {
              return data.labels.map((label: string, index: number) => {
                const value = data.datasets[0].data[index];
                const percentage = stats[index]?.percentage || 0;
                return {
                  text: `${label}: ${value} cotizaciones (${percentage.toFixed(1)}%)`,
                  fillStyle: data.datasets[0].backgroundColor[index],
                  strokeStyle: data.datasets[0].borderColor[index],
                  lineWidth: data.datasets[0].borderWidth,
                  pointStyle: "circle",
                  hidden: false,
                  index: index,
                };
              });
            }
            return [];
          },
        },
      },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            const label = context.label || "";
            const value = context.parsed;
            const percentage = stats[context.dataIndex]?.percentage || 0;
            return `${label}: ${value} cotizaciones (${percentage.toFixed(1)}%)`;
          },
        },
      },
    },
  };

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
        {stats.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No hay datos disponibles</p>
          </div>
        ) : (
          <div className="h-80">
            <Doughnut data={chartData} options={chartOptions} />
          </div>
        )}
      </div>
    </div>
  );
}
