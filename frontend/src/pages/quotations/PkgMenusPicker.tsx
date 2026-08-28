import { useState } from "react";
import { X } from "lucide-react";
import AgregadorDeItems from "../../components/selects/AgregadorDeItems";

/**
 * EL PICKER DE MENÚS del modal "Crear paquete" (Felipe 28-08: "mismo
 * formato que las demás plegables"). Antes era una lista de casillas
 * sin buscador; ahora habla el idioma de sueltos y fijos: elegidos a
 * la vista (un menú entra UNA vez, sin cantidad) + la pieza de la
 * casa para agregar. Vive fuera del gigante congelado (higuera).
 */
export default function PkgMenusPicker({
  menus,
  elegidos,
  onCambio,
}: {
  readonly menus: readonly { id: number; name: string; category?: string }[];
  readonly elegidos: readonly number[];
  readonly onCambio: (siguiente: number[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  // EN EL ORDEN QUE SE ELIGEN (Felipe 28-08, "mismo problema de cuando
  // agregaba garzones"): se recorre la selección, no el catálogo.
  const dentro = elegidos.flatMap((id) => {
    const m = menus.find((x) => x.id === id);
    return m ? [m] : [];
  });
  return (
    <div>
      {dentro.length > 0 && (
        <div className="mb-2 border border-gray-200 rounded-lg divide-y divide-gray-100">
          {dentro.map((m) => (
            <div key={m.id} className="flex items-center gap-2 px-3 py-2">
              <span className="flex-1 text-sm text-gray-900">
                {m.name}
                {m.category && (
                  <span className="text-gray-500"> ({m.category})</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => onCambio(elegidos.filter((id) => id !== m.id))}
                title="Quitar este menú del paquete"
                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <AgregadorDeItems
        opciones={menus
          .filter((m) => !elegidos.includes(m.id))
          .map((m) => ({
            value: String(m.id),
            label: m.name,
            hint: m.category,
          }))}
        onAgregar={(id) => onCambio([...elegidos, Number(id)])}
        abierto={abierto}
        onAbiertoChange={setAbierto}
        placeholder="Agregar menú…"
        searchPlaceholder="Buscar menú por nombre…"
        noResultsText="No se encontraron menús"
        tamano="sm"
      />
    </div>
  );
}
