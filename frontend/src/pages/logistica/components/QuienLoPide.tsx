import Tooltip from "../../../components/Tooltip";
import { formatFechaEvento } from "../../../utils/dates";
import type { PedidoDeInsumo } from "./pedidosPorInsumo";

/**
 * QUÉ COTIZACIÓN PIDE CADA INSUMO de la lista de compra (20-10-2026).
 * Felipe: "al lado de cada item, podría aparecer un detalle de qué
 * cotización necesita ese servicio".
 *
 * Un número por cotización marcada que usa el insumo, en el orden de la
 * tabla de eventos, aunque sean todas ("cuando sea todas pon igual el nro
 * de cotización"). Verde si para esa cotización ya está provisionado; gris
 * si falta. Al pasar el mouse: cliente, fecha y cuánto pide, NETO como la
 * columna Cantidad (las de todas suman esa columna).
 */

// El mismo largo que la columna Cantidad de Compras.
const cantidadEnTexto = (n: number) =>
  Number(n.toFixed(2)).toLocaleString("es-CL", { maximumFractionDigits: 2 });

export default function QuienLoPide({
  pedidos,
  unidad,
}: {
  readonly pedidos: readonly PedidoDeInsumo[];
  /** La unidad base del insumo: kg, L o u. */
  readonly unidad: string;
}) {
  if (pedidos.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1 ml-1.5 align-middle">
      {pedidos.map((p) => {
        const detalle = `#${p.numero} · ${p.cliente} · ${formatFechaEvento(
          p.fecha,
          "diaMes",
        )} · ${cantidadEnTexto(p.cantidad)} ${unidad} · ${
          p.provisionado ? "provisionado" : "por comprar"
        }`;
        return (
          <Tooltip key={p.eventoId} contenido={detalle} titulo={detalle}>
            <span
              className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${
                p.provisionado
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              #{p.numero}
            </span>
          </Tooltip>
        );
      })}
    </span>
  );
}
