import { useNavigate } from "react-router-dom";
import { TopClientsByQuotations } from "../../../types/analytics.types";
import { getClientTypeColor } from "../../../utils/clientTypeColor";

// Top clientes por N° de cotizaciones (23-07): quién te hace trabajar
// más. Cruzado con el top de venta detecta a los que cotizan mucho y
// compran poco. Tabla (no gráfico): acá importan los 3 números por fila
// (cotizadas / concretadas / tasa), y el nombre lleva a la ficha 360°.

interface Props {
  readonly stats: TopClientsByQuotations[];
}

const tasaColor = (rate: number) =>
  rate >= 50
    ? "text-green-700 bg-green-50"
    : rate >= 20
      ? "text-amber-700 bg-amber-50"
      : "text-red-700 bg-red-50";

export default function TopClientsByQuotationsStatsComponent({
  stats,
}: Props) {
  const navigate = useNavigate();

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-3 border-b border-gray-200">
        <h3 className="text-base font-semibold text-gray-900">
          Top Clientes por N° de Cotizaciones
        </h3>
        <p className="text-xs text-gray-600">
          Quiénes cotizan más y cuántas se concretan
        </p>
      </div>
      <div className="p-3">
        {stats.length === 0 ? (
          <div className="text-center py-2">
            <p className="text-gray-500 text-sm">No hay datos disponibles</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
                <th className="py-1.5 pr-2 font-medium w-6">#</th>
                <th className="py-1.5 pr-2 font-medium">Cliente</th>
                <th className="py-1.5 px-2 text-right font-medium">Cotiz.</th>
                <th className="py-1.5 px-2 text-right font-medium">
                  Concretadas
                </th>
                <th className="py-1.5 pl-2 text-right font-medium">Tasa</th>
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
                  <td className="py-1.5 px-2 text-right tabular-nums">
                    {c.total_quotations}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums">
                    {c.won_quotations}
                  </td>
                  <td className="py-1.5 pl-2 text-right">
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs font-semibold tabular-nums ${tasaColor(Number(c.conversion_rate) || 0)}`}
                    >
                      {Number(c.conversion_rate || 0).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                    </span>
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
