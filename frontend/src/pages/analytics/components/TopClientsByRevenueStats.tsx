import { useNavigate } from "react-router-dom";
import { TopClientsByRevenue } from "../../../types/analytics.types";
import { formatCurrency } from "../../../utils/currencies";
import { Company } from "../../../types/companies.types";
import { getClientTypeColor } from "../../../utils/clientTypeColor";

// Top clientes por ingresos — TABLA, no gráfico (Felipe, 23-07): con
// nombres largos las barras eran ilegibles; acá se lee el monto exacto
// y el nombre lleva a la ficha 360°. Solo los 10 principales.

interface TopClientsByRevenueStatsProps {
  readonly stats: TopClientsByRevenue[];
  readonly currency: Company["currency"];
}

export default function TopClientsByRevenueStatsComponent({
  stats,
  currency,
}: TopClientsByRevenueStatsProps) {
  const navigate = useNavigate();
  const topClients = stats.slice(0, 10);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-3 border-b border-gray-200">
        <h3 className="text-base font-semibold text-gray-900">
          Top Clientes por Ingresos
        </h3>
        <p className="text-xs text-gray-600">
          Los 10 clientes que más ingresos han generado
        </p>
      </div>
      <div className="p-3">
        {topClients.length === 0 ? (
          <div className="text-center py-2">
            <p className="text-gray-500 text-sm">No hay datos disponibles</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
                <th className="py-1.5 pr-2 font-medium w-6">#</th>
                <th className="py-1.5 pr-2 font-medium">Cliente</th>
                <th className="py-1.5 pl-2 text-right font-medium">
                  Ingresos
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {topClients.map((c, i) => (
                <tr key={c.client_id} className="hover:bg-gray-50">
                  <td className="py-1.5 pr-2 text-gray-400 tabular-nums">
                    {i + 1}
                  </td>
                  <td className="py-1.5 pr-2">
                    <button
                      onClick={() => navigate(`/clients/${c.client_id}`)}
                      className="text-left text-blue-600 hover:text-blue-800 hover:underline font-medium"
                      title="Ver ficha del cliente"
                    >
                      {c.client_name}
                    </button>
                    <span
                      className={`ml-2 px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${getClientTypeColor(c.client_type)}`}
                    >
                      {c.client_type}
                    </span>
                  </td>
                  <td className="py-1.5 pl-2 text-right tabular-nums font-semibold">
                    {formatCurrency(c.total_revenue, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
