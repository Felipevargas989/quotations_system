import { TopClientsByRevenue } from "../../../types/analytics.types";
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

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
);

interface TopClientsByRevenueStatsProps {
  readonly stats: TopClientsByRevenue[];
}

const getClientTypeLabel = (clientType: string) => {
  switch (clientType) {
    case "empresa":
      return "Empresa";
    case "particular":
      return "Particular";
    case "institucion":
      return "Institución";
    case "colegio":
      return "Colegio";
    case "universidad":
      return "Universidad";
    case "gobierno":
      return "Gobierno";
    default:
      return clientType;
  }
};

const getClientTypeColor = (clientType: string) => {
  switch (clientType) {
    case "empresa":
      return "#3B82F6"; // blue-500
    case "particular":
      return "#10B981"; // green-500
    case "institucion":
      return "#8B5CF6"; // purple-500
    case "colegio":
      return "#F59E0B"; // yellow-500
    case "universidad":
      return "#EF4444"; // red-500
    case "gobierno":
      return "#6B7280"; // gray-500
    default:
      return "#3B82F6"; // blue-500
  }
};

export default function TopClientsByRevenueStatsComponent({
  stats,
}: TopClientsByRevenueStatsProps) {
  // Limit to top 10 clients for better visualization
  const topClients = stats.slice(0, 10);

  const chartData = {
    labels: topClients.map((stat) => stat.client_name),
    datasets: [
      {
        label: "Ingresos (CLP)",
        data: topClients.map((stat) => stat.total_revenue),
        backgroundColor: topClients.map((stat) =>
          getClientTypeColor(stat.client_type),
        ),
        borderColor: topClients.map((stat) =>
          getClientTypeColor(stat.client_type),
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
            const stat = topClients[index];
            return [
              `Cliente: ${stat.client_name}`,
              `Tipo: ${getClientTypeLabel(stat.client_type)}`,
              `Ingresos: ${formatCurrency(stat.total_revenue)}`,
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
          callback: function (value: any) {
            return formatCurrency(value);
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
          Top Clientes por Ingresos
        </h3>
        <p className="text-xs text-gray-600">
          Los clientes que más ingresos han generado
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
