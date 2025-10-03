import { useState, useEffect } from "react";
import {
  Building2,
  Loader2,
  AlertCircle,
  RefreshCw,
  Plus,
  X,
  TrendingUp,
} from "lucide-react";
import {
  getAllCompanies,
  createCompany,
  getStatsLastMonth,
} from "../../services/superAdmin.service";
import { Company } from "../../types/companies.types";
import { QuotationStatsResponse } from "../../types/superAdmin.types";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
);

export default function SuperAdminPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [statsData, setStatsData] = useState<QuotationStatsResponse | null>(
    null,
  );
  const [statsLoading, setStatsLoading] = useState(false);

  const fetchCompanies = async () => {
    setLoading(true);
    setError(null);

    const response = await getAllCompanies();

    if (response.error) {
      setError(response.error);
    } else {
      setCompanies(response.data || []);
    }

    setLoading(false);
  };

  const fetchStatsLastMonth = async () => {
    setStatsLoading(true);

    const response = await getStatsLastMonth();
    if (response) {
      setStatsData(response);
    }

    setStatsLoading(false);
  };

  useEffect(() => {
    fetchCompanies();
    fetchStatsLastMonth();
  }, []);

  const handleRefresh = () => {
    fetchCompanies();
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim()) return;

    setCreating(true);
    const response = await createCompany(newCompanyName.trim());

    if (response.error) {
      setError(response.error);
    } else {
      // Refresh the companies list
      await fetchCompanies();
      // Reset form
      setNewCompanyName("");
      setShowCreateForm(false);
    }

    setCreating(false);
  };

  const handleCancelCreate = () => {
    setNewCompanyName("");
    setShowCreateForm(false);
  };

  // Prepare chart data
  const getChartData = () => {
    if (!statsData?.companies?.length) {
      return null;
    }

    // Generate color palette for companies
    const colors = [
      { border: "rgb(59, 130, 246)", bg: "rgba(59, 130, 246, 0.1)" }, // blue
      { border: "rgb(16, 185, 129)", bg: "rgba(16, 185, 129, 0.1)" }, // green
      { border: "rgb(245, 158, 11)", bg: "rgba(245, 158, 11, 0.1)" }, // amber
      { border: "rgb(239, 68, 68)", bg: "rgba(239, 68, 68, 0.1)" }, // red
      { border: "rgb(168, 85, 247)", bg: "rgba(168, 85, 247, 0.1)" }, // purple
      { border: "rgb(236, 72, 153)", bg: "rgba(236, 72, 153, 0.1)" }, // pink
      { border: "rgb(20, 184, 166)", bg: "rgba(20, 184, 166, 0.1)" }, // teal
      { border: "rgb(251, 146, 60)", bg: "rgba(251, 146, 60, 0.1)" }, // orange
    ];

    // Get all unique dates and sort them
    const allDates = new Set<string>();
    statsData.companies.forEach((company) => {
      company.stats.forEach((stat) => {
        allDates.add(stat.date);
      });
    });
    const sortedDates = Array.from(allDates).sort((a, b) => a.localeCompare(b));

    // Create datasets for each company
    const datasets = statsData.companies.map((company, index) => {
      const color = colors[index % colors.length];

      // Create a map of date to count for this company
      const dataMap = new Map(
        company.stats.map((stat) => [stat.date, stat.count]),
      );

      // Fill in data for all dates (0 if no data for that date)
      const data = sortedDates.map((date) => dataMap.get(date) || 0);

      return {
        label: company.company_name,
        data,
        borderColor: color.border,
        backgroundColor: color.bg,
        tension: 0.3,
        fill: true,
      };
    });

    // Add total quotations line (aggregated across all companies)
    if (statsData.total_quotations?.length > 0) {
      const totalDataMap = new Map(
        statsData.total_quotations.map((stat) => [stat.date, stat.count]),
      );

      const totalData = sortedDates.map((date) => totalDataMap.get(date) || 0);

      datasets.push({
        label: "Total (Todas las empresas)",
        data: totalData,
        borderColor: "rgb(0, 0, 0)",
        backgroundColor: "rgba(0, 0, 0, 0.05)",
        tension: 0.3,
        fill: false,
      } as any);
    }

    return {
      labels: sortedDates.map((date) =>
        format(new Date(date), "dd/MM", { locale: es }),
      ),
      datasets,
    };
  };

  const chartOptions: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
      },
      title: {
        display: true,
        text: "Cotizaciones por Empresa - Último Mes",
        font: {
          size: 16,
          weight: "bold",
        },
      },
      tooltip: {
        mode: "index" as const,
        intersect: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
        },
        title: {
          display: true,
          text: "Número de Cotizaciones",
        },
      },
      x: {
        title: {
          display: true,
          text: "Fecha",
        },
      },
    },
    interaction: {
      mode: "nearest" as const,
      axis: "x" as const,
      intersect: false,
    },
  };

  const chartData = getChartData();

  // Render stats chart section
  const renderStatsChart = () => {
    if (statsLoading) {
      return (
        <div className="bg-white shadow rounded-lg mb-8 p-8">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Cargando estadísticas...</p>
          </div>
        </div>
      );
    }

    if (!chartData || !statsData) {
      return null;
    }

    return (
      <div className="bg-white shadow rounded-lg mb-8 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-100 p-2 rounded-lg">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                Estadísticas de Cotizaciones
              </h3>
              <p className="text-sm text-gray-500">
                Total de cotizaciones del mes:{" "}
                <span className="font-semibold">
                  {statsData.total_quotations_all_companies}
                </span>
              </p>
            </div>
          </div>
        </div>
        <div className="h-[400px]">
          <Line data={chartData} options={chartOptions} />
        </div>

        {/* Company Totals Summary */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-3">
            Totales por Empresa
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {statsData.companies.map((company, index) => {
              const colors = [
                "bg-blue-100 text-blue-700",
                "bg-green-100 text-green-700",
                "bg-amber-100 text-amber-700",
                "bg-red-100 text-red-700",
                "bg-purple-100 text-purple-700",
                "bg-pink-100 text-pink-700",
                "bg-teal-100 text-teal-700",
                "bg-orange-100 text-orange-700",
              ];
              const colorClass = colors[index % colors.length];

              return (
                <div
                  key={company.company_id}
                  className={`${colorClass} px-4 py-3 rounded-lg`}
                >
                  <p className="text-xs font-medium opacity-80">
                    {company.company_name}
                  </p>
                  <p className="text-2xl font-bold">
                    {company.total_quotations}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Cargando empresas...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Error al cargar empresas
          </h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={handleRefresh}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 mx-auto"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Reintentar</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-100 p-3 rounded-lg">
                <Building2 className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Administración de Empresas
                </h1>
                <p className="text-gray-600">
                  Gestiona todas las empresas del sistema
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {/* <button
                onClick={() => setShowCreateForm(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <Plus className="h-4 w-4" />
                <span>Crear nueva empresa</span>
              </button> */}
              <button
                onClick={handleRefresh}
                className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Actualizar</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stats Chart */}
        {renderStatsChart()}

        {/* Create Company Form */}
        {showCreateForm && (
          <div className="bg-white shadow rounded-lg mb-8">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">
                  Crear Nueva Empresa
                </h3>
                <button
                  onClick={handleCancelCreate}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="px-6 py-4">
              <form onSubmit={handleCreateCompany} className="space-y-4">
                <div>
                  <label
                    htmlFor="companyName"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Nombre de la Empresa
                  </label>
                  <input
                    type="text"
                    id="companyName"
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    placeholder="Ingresa el nombre de la empresa"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                    disabled={creating}
                  />
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    type="submit"
                    disabled={creating || !newCompanyName.trim()}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    {creating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Creando...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        <span>Crear Empresa</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelCreate}
                    disabled={creating}
                    className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 transition-colors disabled:bg-gray-200 disabled:cursor-not-allowed"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Companies Table */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              Lista de Empresas
            </h3>
            <p className="text-sm text-gray-500">
              Todas las empresas registradas en el sistema
            </p>
          </div>

          {companies.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No hay empresas registradas
              </h3>
              <p className="text-gray-500">
                No se encontraron empresas en el sistema.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nombre de la Empresa
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fecha de Creación
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {companies.map((company) => (
                    <tr key={company.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        #{company.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-8 w-8">
                            <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                              <Building2 className="h-4 w-4 text-blue-600" />
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {company.name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(
                          new Date(company.created_at),
                          "dd/MM/yyyy HH:mm",
                          { locale: es },
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
