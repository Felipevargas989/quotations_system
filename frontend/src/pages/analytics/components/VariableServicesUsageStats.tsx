import { VariableServiceUsage } from "../../../types/analytics.types";
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

interface VariableServicesUsageStatsProps {
  readonly stats: VariableServiceUsage[];
}

const getServiceColor = (index: number) => {
  const colors = [
    "#3B82F6", // blue-500
    "#10B981", // green-500
    "#8B5CF6", // purple-500
    "#F59E0B", // yellow-500
    "#EF4444", // red-500
    "#06B6D4", // cyan-500
    "#84CC16", // lime-500
    "#F97316", // orange-500
    "#EC4899", // pink-500
    "#6B7280", // gray-500
  ];
  return colors[index % colors.length];
};

export default function VariableServicesUsageStatsComponent({
  stats,
}: VariableServicesUsageStatsProps) {
  // Sort by usage count descending and limit to top 10 for better visualization
  const sortedStats = [...stats]
    .sort((a, b) => b.usage_count - a.usage_count)
    .slice(0, 10);

  const chartData = {
    labels: sortedStats.map((stat) => stat.service_name),
    datasets: [
      {
        label: "Veces Utilizado",
        data: sortedStats.map((stat) => stat.usage_count),
        backgroundColor: sortedStats.map((_, index) => getServiceColor(index)),
        borderColor: sortedStats.map((_, index) => getServiceColor(index)),
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
            const stat = sortedStats[index];
            return [
              `Servicio: ${stat.service_name}`,
              `Veces utilizado: ${stat.usage_count}`,
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
            size: 10,
          },
        },
        grid: {
          display: false,
        },
      },
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
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
          Servicios Variables Más Utilizados
        </h3>
        <p className="text-xs text-gray-600">
          Los servicios variables más utilizados en las cotizaciones
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
