import { Trash2 } from "lucide-react";
import ConfirmInline from "../../components/ConfirmInline";
import type { ServiceGroup } from "../../types/serviceGroups.types";

/** Lo que cuesta el menú por persona: la suma de sus ítems. */
export const precioPorPersonaDe = (g: ServiceGroup) =>
  g.items.reduce(
    (s, it) => s + Number(it.service?.price ?? 0) * Number(it.quantity ?? 0),
    0,
  );

/**
 * EL PANEL DE MENÚS GUARDADOS del cotizador (extraído de QuotationForm
 * el 09-09 por el portero de tamaño). Cada fila es NOMBRE · PRECIO POR
 * PERSONA (Felipe, 09-09: "el nombre, un punto y el precio; ese dato
 * vale ahí"). La categoría no se repite: la lista ya es de la categoría
 * de la casilla; solo cuando la casilla no tiene categoría se dice de
 * cuál es cada menú, en gris chico debajo.
 */
export default function MenusGuardados({
  grupos,
  conCategoria,
  confirmandoId,
  onElegir,
  onPedirEliminar,
  onConfirmarEliminar,
  onCancelarEliminar,
}: {
  readonly grupos: ServiceGroup[];
  readonly conCategoria: boolean;
  readonly confirmandoId: number | null;
  readonly onElegir: (g: ServiceGroup) => void;
  readonly onPedirEliminar: (id: number) => void;
  readonly onConfirmarEliminar: (id: number) => Promise<void> | void;
  readonly onCancelarEliminar: () => void;
}) {
  return (
    <div className="absolute left-0 z-10 w-72 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
      {grupos.map((group) =>
        confirmandoId === group.id ? (
          <div key={group.id} className="px-3 py-2">
            <ConfirmInline
              question={`¿Eliminar "${group.name}"?`}
              onYes={() => onConfirmarEliminar(group.id)}
              onNo={onCancelarEliminar}
            />
          </div>
        ) : (
          <div
            key={group.id}
            className="flex items-center justify-between px-3 py-2 hover:bg-gray-100"
          >
            <button
              type="button"
              onClick={() => onElegir(group)}
              className="flex-1 min-w-0 text-left text-sm"
            >
              <span className="block truncate">
                <span className="text-gray-900">{group.name}</span>
                <span className="text-gray-500">
                  {" · $"}
                  {precioPorPersonaDe(group).toLocaleString("es-CL")}
                </span>
              </span>
              {!conCategoria && (
                <span className="block text-xs text-gray-400 truncate">
                  {group.category}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPedirEliminar(group.id);
              }}
              className="ml-2 shrink-0 text-gray-300 hover:text-red-600"
              title="Eliminar menú guardado"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ),
      )}
    </div>
  );
}
