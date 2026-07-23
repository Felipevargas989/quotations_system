import { FixedServiceUsage } from "../../../types/analytics.types";

// Tabla de servicios fijos más utilizados (Analytics 100% tablas, 23-07).

interface FixedServicesUsageStatsProps {
  readonly stats: FixedServiceUsage[];
}

export default function FixedServicesUsageStatsComponent({
  stats,
}: FixedServicesUsageStatsProps) {
  const top = stats.slice(0, 10);
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-3 border-b border-gray-200">
        <h3 className="text-base font-semibold text-gray-900">
          Servicios Fijos Más Utilizados
        </h3>
        <p className="text-xs text-gray-600">
          Presencia en eventos concretados del período
        </p>
      </div>
      <div className="p-3">
        {top.length === 0 ? (
          <div className="text-center py-2">
            <p className="text-gray-500 text-sm">No hay datos disponibles</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
                <th className="py-1.5 pr-2 font-medium w-6">#</th>
                <th className="py-1.5 pr-2 font-medium">Servicio</th>
                <th className="py-1.5 pl-2 text-right font-medium">Veces</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {top.map((r, i) => (
                <tr key={r.service_name} className="hover:bg-gray-50">
                  <td className="py-1.5 pr-2 text-gray-400 tabular-nums">
                    {i + 1}
                  </td>
                  <td className="py-1.5 pr-2 text-gray-800">
                    {r.service_name}
                  </td>
                  <td className="py-1.5 pl-2 text-right tabular-nums font-semibold">
                    {Number(r.usage_count).toLocaleString("es-CL")}
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
