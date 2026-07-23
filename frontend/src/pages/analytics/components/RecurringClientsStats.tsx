import { useNavigate } from "react-router-dom";
import { RecurringClient } from "../../../types/analytics.types";
import { formatCurrency } from "../../../utils/currencies";
import { Company } from "../../../types/companies.types";
import { getClientTypeColor } from "../../../utils/clientTypeColor";

// Clientes recurrentes (23-07): 2 o más eventos concretados
// (aceptada/realizada) en el período. La cartera fiel — la que hay
// que cuidar. El nombre lleva a la ficha 360° del cliente.

interface Props {
  readonly stats: RecurringClient[];
  readonly currency: Company["currency"];
}

export default function RecurringClientsStatsComponent({
  stats,
  currency,
}: Props) {
  const navigate = useNavigate();

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-3 border-b border-gray-200">
        <h3 className="text-base font-semibold text-gray-900">
          Clientes Recurrentes
        </h3>
        <p className="text-xs text-gray-600">
          Con 2 o más eventos concretados en el período
        </p>
      </div>
      <div className="p-3">
        {stats.length === 0 ? (
          <div className="text-center py-2">
            <p className="text-gray-500 text-sm">
              Ningún cliente repite todavía en este período
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
                <th className="py-1.5 pr-2 font-medium w-6">#</th>
                <th className="py-1.5 pr-2 font-medium">Cliente</th>
                <th className="py-1.5 px-2 text-right font-medium">Eventos</th>
                <th className="py-1.5 pl-2 text-right font-medium">
                  Ingresos
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats.map((c, i) => (
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
                  <td className="py-1.5 px-2 text-right tabular-nums font-semibold">
                    {c.won_events}
                  </td>
                  <td className="py-1.5 pl-2 text-right tabular-nums">
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
