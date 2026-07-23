import { EventTypeRevenueStats } from "../../../types/analytics.types";
import { formatCurrency } from "../../../utils/currencies";
import { Company } from "../../../types/companies.types";

// Tabla de ingresos por tipo de evento (Analytics 100% tablas, 23-07).

interface EventTypeRevenueStatsProps {
  readonly stats: EventTypeRevenueStats[];
  readonly currency: Company["currency"];
}

export default function EventTypeRevenueStatsComponent({
  stats,
  currency,
}: EventTypeRevenueStatsProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-3 border-b border-gray-200">
        <h3 className="text-base font-semibold text-gray-900">
          Ingresos por Tipo de Evento
        </h3>
        <p className="text-xs text-gray-600">
          Total de eventos e ingresos generados por tipo
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
                <th className="py-1.5 pr-2 font-medium">Tipo de evento</th>
                <th className="py-1.5 px-2 text-right font-medium">Eventos</th>
                <th className="py-1.5 px-2 text-right font-medium">
                  Ingresos
                </th>
                <th className="py-1.5 pl-2 text-right font-medium">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats.map((r) => (
                <tr key={r.event_type} className="hover:bg-gray-50">
                  <td className="py-1.5 pr-2 font-medium text-gray-800">
                    {r.event_type}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums">
                    {Number(r.total_events).toLocaleString("es-CL")}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-semibold">
                    {formatCurrency(r.total_revenue, currency)}
                  </td>
                  <td className="py-1.5 pl-2 text-right tabular-nums text-gray-600">
                    {Number(r.revenue_percentage || 0).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
