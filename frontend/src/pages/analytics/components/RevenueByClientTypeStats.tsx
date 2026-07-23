import { RevenueByClientType } from "../../../types/analytics.types";
import { formatCurrency } from "../../../utils/currencies";
import { Company } from "../../../types/companies.types";
import { getClientTypeColor } from "../../../utils/clientTypeColor";

// Tabla de ingresos por tipo de cliente (Analytics 100% tablas, 23-07).
// La pastilla usa los colores estables de tipos de cliente del sistema.

interface RevenueByClientTypeStatsProps {
  readonly stats: RevenueByClientType[];
  readonly currency: Company["currency"];
}

export default function RevenueByClientTypeStatsComponent({
  stats,
  currency,
}: RevenueByClientTypeStatsProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-3 border-b border-gray-200">
        <h3 className="text-base font-semibold text-gray-900">
          Ingresos por Tipo de Cliente
        </h3>
        <p className="text-xs text-gray-600">
          Total de cotizaciones e ingresos generados por tipo de cliente
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
                <th className="py-1.5 pr-2 font-medium">Tipo de cliente</th>
                <th className="py-1.5 px-2 text-right font-medium">Cotiz.</th>
                <th className="py-1.5 px-2 text-right font-medium">
                  Ingresos
                </th>
                <th className="py-1.5 pl-2 text-right font-medium">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats.map((r) => (
                <tr key={r.client_type} className="hover:bg-gray-50">
                  <td className="py-1.5 pr-2">
                    <span
                      className={`px-1.5 py-0.5 text-[11px] font-semibold rounded-full ${getClientTypeColor(r.client_type)}`}
                    >
                      {r.client_type}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums">
                    {Number(r.total_quotations).toLocaleString("es-CL")}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-semibold">
                    {formatCurrency(r.total_revenue, currency)}
                  </td>
                  <td className="py-1.5 pl-2 text-right tabular-nums text-gray-600">
                    {Number(r.revenue_percentage || 0).toLocaleString("es-CL")}
                    %
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
