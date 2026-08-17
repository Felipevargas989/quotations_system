import { QuotationStatusStats } from "../../../types/analytics.types";
import { etiquetaEstado, hexEstado } from "../../../utils/estadoCotizacion";

// Analytics 100% en tablas (Felipe, 23-07): la dona decía menos que
// estas mismas filas. Punto de color = el color histórico del estado.

interface QuotationStatusStatsProps {
  readonly stats: QuotationStatusStats[];
}


export default function QuotationStatusStatsComponent({
  stats,
}: QuotationStatusStatsProps) {
  const total = stats.reduce((s, r) => s + Number(r.total || 0), 0);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-3 border-b border-gray-200">
        <h3 className="text-base font-semibold text-gray-900">
          Estadísticas por Estado
        </h3>
        <p className="text-xs text-gray-600">
          Distribución de cotizaciones por estado
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
                <th className="py-1.5 pr-2 font-medium">Estado</th>
                <th className="py-1.5 px-2 text-right font-medium">
                  Cotizaciones
                </th>
                <th className="py-1.5 pl-2 text-right font-medium">
                  % del total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats.map((r) => (
                <tr key={r.quotation_status} className="hover:bg-gray-50">
                  <td className="py-1.5 pr-2">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        // hexEstado, no etiquetaEstado: al homologar los
                        // estados se cambió también acá, y "Aceptada" no
                        // es un color — el punto quedaba transparente.
                        style={{
                          backgroundColor: hexEstado(r.quotation_status),
                        }}
                      />
                      <span className="font-medium text-gray-800">
                        {etiquetaEstado(r.quotation_status)}
                      </span>
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums">
                    {Number(r.total).toLocaleString("es-CL")}
                  </td>
                  <td className="py-1.5 pl-2 text-right tabular-nums text-gray-600">
                    {Number(r.percentage).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200">
                <td className="py-1.5 pr-2 font-semibold text-gray-900">
                  Total
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-gray-900">
                  {total.toLocaleString("es-CL")}
                </td>
                <td className="py-1.5 pl-2 text-right tabular-nums text-gray-500">
                  100,00%
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
