import { useState } from "react";
import AgregadorDeItems from "../../components/selects/AgregadorDeItems";
import type { FijoDeCatalogo } from "./paqueteFijos";

/**
 * EL PICKER DE FIJOS del modal "Guardar paquete" (Felipe 28-08).
 * Vive fuera del gigante congelado a propósito (higuera). Mismo
 * lenguaje que los servicios sueltos: los elegidos siempre a la
 * vista con −/cantidad/+, y la pieza de la casa para agregar.
 */
export default function PkgFijosPicker({
  catalogo,
  elegidos,
  onCambio,
}: {
  readonly catalogo: readonly FijoDeCatalogo[];
  readonly elegidos: Record<string, number>;
  readonly onCambio: (siguiente: Record<string, number>) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const conAlgo = catalogo.filter((f) => (elegidos[f.codigo] || 0) > 0);
  const sumar = (codigo: string, delta: number) => {
    const n = { ...elegidos };
    const nuevo = (n[codigo] || 0) + delta;
    if (nuevo <= 0) delete n[codigo];
    else n[codigo] = nuevo;
    onCambio(n);
  };
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mt-4 mb-1">
        Servicios fijos{" "}
        <span className="font-normal text-gray-500">
          (opcional — salón, decoración, audiovisual…)
        </span>
      </label>
      {conAlgo.length > 0 && (
        <div className="mb-2 border border-gray-200 rounded-lg divide-y divide-gray-100">
          {conAlgo.map((f) => (
            <div key={f.codigo} className="flex items-center gap-2 px-3 py-2">
              <span className="flex-1 text-sm text-gray-900">{f.nombre}</span>
              <button
                type="button"
                onClick={() => sumar(f.codigo, -1)}
                className="w-7 h-7 rounded border border-gray-300 text-gray-600"
              >
                −
              </button>
              <span className="w-6 text-center text-sm tabular-nums">
                {elegidos[f.codigo]}
              </span>
              <button
                type="button"
                onClick={() => sumar(f.codigo, 1)}
                className="w-7 h-7 rounded border border-gray-300 text-gray-600"
              >
                +
              </button>
            </div>
          ))}
        </div>
      )}
      <AgregadorDeItems
        opciones={catalogo
          .filter((f) => f.is_active !== false)
          .map((f) => ({
            value: f.codigo,
            label: f.nombre,
            hint: `$${(f.precio || 0).toLocaleString("es-CL")}`,
          }))}
        onAgregar={(codigo) => sumar(codigo, 1)}
        abierto={abierto}
        onAbiertoChange={setAbierto}
        placeholder="Agregar servicio fijo…"
        searchPlaceholder="Buscar servicio por nombre…"
        noResultsText="No se encontraron servicios"
        tamano="sm"
        haciaArriba
      />
    </div>
  );
}
