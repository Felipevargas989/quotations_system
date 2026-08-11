import { useState, useEffect } from "react";
import {
  Building2,
  Loader2,
  AlertCircle,
  RefreshCw,
  Plus,
  X,
  TrendingUp,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  getAllCompanies,
  createCompany,
  getStatsLastMonth,
  getTorre,
} from "../../services/superAdmin.service";
import { Company } from "../../types/companies.types";
import { QuotationStatsResponse } from "../../types/superAdmin.types";
import { formatPhone } from "../../utils/phone";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from "chart.js";
import { Bar } from "react-chartjs-2";

// Register Chart.js components — barras mensuales (05-08): el gráfico
// de líneas diarias era ilegible; Line/PointElement se jubilaron.
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
);

// Rótulo humano es-CL corto de un mes 'YYYY-MM': "mar 26", "ago 26".
const MESES_CORTOS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];
const rotuloMes = (mes: string) =>
  `${MESES_CORTOS[Number(mes.slice(5, 7)) - 1] || mes} ${mes.slice(2, 4)}`;

// ---- Torre de Control (tanda 1, 05-08): las 6 tarjetas + la tabla
// "quién ha entrado", directo del GET /super-admin/torre. ----
// Fecha humana es-CL: "hoy 19:09", "ayer", y más viejo "05-08"; el
// title siempre lleva la fecha exacta completa.
const fechaHumanaTorre = (iso: string | null) => {
  if (!iso) return "nunca";
  const d = new Date(iso);
  const diaDe = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(
      x.getDate(),
    ).padStart(2, "0")}`;
  const hora = d.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (diaDe(d) === diaDe(new Date())) return `hoy ${hora}`;
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  if (diaDe(d) === diaDe(ayer)) return "ayer";
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" });
};

const fechaExacta = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

function TorreDeControl() {
  const torreQuery = useQuery({
    queryKey: ["superAdmin", "torre"],
    queryFn: getTorre,
  });

  const tarjetas = torreQuery.data?.tarjetas;
  const casillas = [
    { rotulo: "Empresas", valor: tarjetas?.empresas_total },
    { rotulo: "Empresas del mes", valor: tarjetas?.empresas_mes },
    { rotulo: "Usuarios", valor: tarjetas?.usuarios_total },
    { rotulo: "Usuarios del mes", valor: tarjetas?.usuarios_mes },
    { rotulo: "Interesados", valor: tarjetas?.leads_total },
    { rotulo: "Interesados del mes", valor: tarjetas?.leads_mes },
  ];

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Torre de Control
        </h2>
        <a
          href="https://analytics.google.com/"
          target="_blank"
          rel="noreferrer"
          className="text-sm font-semibold text-blue-600 hover:underline"
        >
          🗺️ Mapa de visitas (Google Analytics)
        </a>
      </div>

      {torreQuery.isPending && (
        <p className="text-sm text-gray-500">Cargando…</p>
      )}
      {torreQuery.isError && (
        <div className="bg-white p-4 rounded-lg shadow flex items-center gap-3">
          <span className="text-sm text-red-600">
            No se pudo cargar la torre.
          </span>
          <button
            type="button"
            onClick={() => void torreQuery.refetch()}
            className="text-sm font-semibold text-blue-600 hover:underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {torreQuery.data && (
        <>
          {/* Las 6 tarjetas, estilo de las del Dashboard. */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            {casillas.map((c) => (
              <div key={c.rotulo} className="bg-white p-4 rounded-lg shadow">
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  {c.rotulo}
                </p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {(c.valor ?? 0).toLocaleString("es-CL")}
                </p>
              </div>
            ))}
          </div>

          {/* Quién ha entrado: como llega del backend (último inicio
              de sesión descendente, nulls al final). */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">
                Quién ha entrado
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {[
                      "Nombre",
                      "Correo",
                      "Empresa",
                      "Rol",
                      "Último inicio de sesión",
                      "Creado",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-6 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {torreQuery.data.usuarios.map((u) => (
                    <tr key={u.email || u.creado || "?"}>
                      <td className="px-6 py-2 text-sm text-gray-900">
                        {u.nombre || "—"}
                      </td>
                      <td className="px-6 py-2 text-sm text-gray-500">
                        {u.email || "—"}
                      </td>
                      <td className="px-6 py-2 text-sm text-gray-700">
                        {u.empresa || "—"}
                      </td>
                      <td className="px-6 py-2 text-sm text-gray-500">
                        {u.rol || "—"}
                      </td>
                      <td
                        className="px-6 py-2 text-sm text-gray-700"
                        title={fechaExacta(u.ultimo_inicio_sesion)}
                      >
                        {fechaHumanaTorre(u.ultimo_inicio_sesion)}
                      </td>
                      <td
                        className="px-6 py-2 text-sm text-gray-500"
                        title={fechaExacta(u.creado)}
                      >
                        {u.creado
                          ? new Date(u.creado).toLocaleDateString("es-CL", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "2-digit",
                            })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

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

    // Barras mensuales (05-08): una barra por EMPRESA por mes, misma
    // paleta de siempre por empresa. La serie "Total (Todas las
    // empresas)" se jubiló — con barras agrupadas era ruido. Los 6
    // meses vienen SIEMPRE del backend (huecos en 0).
    const meses = statsData.companies[0]?.monthly.map((m) => m.mes) ?? [];

    const datasets = statsData.companies.map((company, index) => {
      const color = colors[index % colors.length];
      return {
        label: company.company_name,
        data: company.monthly.map((m) => m.cantidad),
        backgroundColor: color.border,
        borderColor: color.border,
      };
    });

    return {
      labels: meses.map(rotuloMes),
      datasets,
    };
  };

  const chartOptions: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
      },
      title: {
        display: true,
        text: "Cotizaciones por Empresa — por mes (últimos 6 meses)",
        font: {
          size: 16,
          weight: "bold",
        },
      },
      tooltip: {
        callbacks: {
          // Cantidad y monto CLP del mes de ESA empresa.
          label: (ctx) => {
            const empresa = statsData?.companies?.[ctx.datasetIndex];
            const mes = empresa?.monthly?.[ctx.dataIndex];
            if (!empresa || !mes) return "";
            return `${empresa.company_name}: ${mes.cantidad} cotizaciones — $${mes.monto.toLocaleString("es-CL")}`;
          },
        },
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
          text: "Mes",
        },
      },
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
                Total de cotizaciones (últimos 30 días):{" "}
                <span className="font-semibold">
                  {statsData.total_quotations_all_companies}
                </span>
              </p>
              <p className="text-sm text-gray-500">
                Monto total (últimos 30 días):{" "}
                <span className="font-semibold text-green-600">
                  $
                  {statsData.total_amount_all_companies.toLocaleString(
                    "es-MX",
                    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                  )}
                </span>
              </p>
            </div>
          </div>
        </div>
        <div className="h-[400px]">
          <Bar data={chartData} options={chartOptions} />
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
                  <p className="text-xs font-medium mt-1">
                    $
                    {company.total_amount.toLocaleString("es-MX", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderUserSignInStats = () => {
    if (!statsData?.user_sign_in_stats) {
      return null;
    }

    const userStats = statsData.user_sign_in_stats;
    const topUsers = userStats.users.slice(0, 10);
    const periodLabel = `${format(
      new Date(userStats.period_start),
      "dd/MM/yyyy",
      { locale: es },
    )} - ${format(new Date(userStats.period_end), "dd/MM/yyyy", {
      locale: es,
    })}`;

    return (
      <div className="bg-white shadow rounded-lg mb-8 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="bg-purple-100 p-2 rounded-lg">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                Actividad de Usuarios
              </h3>
              <p className="text-sm text-gray-500">
                Inicios de sesión recientes ({periodLabel})
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-purple-50 rounded-lg p-4">
            <p className="text-sm text-purple-700">Usuarios registrados</p>
            <p className="text-3xl font-bold text-purple-900">
              {userStats.total_users}
            </p>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-sm text-green-700">Ingresaron en el período</p>
            <p className="text-3xl font-bold text-green-900">
              {userStats.total_signed_in_in_period}
            </p>
          </div>
          <div className="bg-amber-50 rounded-lg p-4">
            <p className="text-sm text-amber-700">Nunca han ingresado</p>
            <p className="text-3xl font-bold text-amber-900">
              {userStats.total_never_signed_in}
            </p>
          </div>
        </div>

        <div className="mt-6">
          {topUsers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Usuario
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Último ingreso
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Registrado
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {topUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="font-medium">{user.email}</div>
                        <div className="text-xs text-gray-500">
                          {formatPhone(user.phone)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {user.last_sign_in_at
                          ? format(
                              new Date(user.last_sign_in_at),
                              "dd/MM/yyyy HH:mm",
                              { locale: es },
                            )
                          : "Sin registro"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(user.created_at), "dd/MM/yyyy", {
                          locale: es,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {userStats.users.length > topUsers.length && (
                <p className="text-xs text-gray-500 px-6 py-3">
                  Mostrando {topUsers.length} de {userStats.users.length}{" "}
                  usuarios con actividad reciente.
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-6 text-sm text-gray-500">
              No se registraron inicios de sesión en el período seleccionado.
            </div>
          )}
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

        {/* Torre de Control (tanda 1, 05-08): arriba de lo existente. */}
        <TorreDeControl />

        {/* Stats Chart */}
        {renderStatsChart()}
        {renderUserSignInStats()}

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
