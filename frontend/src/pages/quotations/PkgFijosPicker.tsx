import SelectWithSearch from "../../components/selects/SelectWithSearch";
import type { FijoDeCatalogo } from "./paqueteFijos";

/**
 * EL PICKER DE FIJOS del modal "Crear paquete" (Felipe 28-08). Usa la
 * MISMA pieza que los sueltos (SelectWithSearch): buscador visible,
 * panel que se mide solo contra el modal, filas compactas. La lista
 * de elegidos conserva EL ORDEN de selección. Vive fuera del gigante.
 */
export default function PkgFijosPicker({
  catalogo,
  elegidos,
  onCambio,
}: {
  readonly catalogo: readonly FijoDeCatalogo[];
  readonly elegidos: readonly { codigo: string; cant: number }[];
  readonly onCambio: (siguiente: { codigo: string; cant: number }[]) => void;
}) {
  const dentro = elegidos.flatMap((e) => {
    const f = catalogo.find((x) => x.codigo === e.codigo);
    return f ? [{ ...f, cantElegida: e.cant }] : [];
  });
  const sumar = (codigo: string, delta: number) => {
    if (!elegidos.some((x) => x.codigo === codigo) && delta > 0) {
      onCambio([...elegidos, { codigo, cant: delta }]);
      return;
    }
    onCambio(
      elegidos.flatMap((x) =>
        x.codigo === codigo
          ? x.cant + delta <= 0
            ? []
            : [{ ...x, cant: x.cant + delta }]
          : [x],
      ),
    );
  };
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mt-4 mb-1">
        Servicios fijos{" "}
        <span className="font-normal text-gray-500">
          (opcional — salón, decoración, audiovisual…)
        </span>
      </label>
      {dentro.length > 0 && (
        <div className="mb-2 border border-gray-200 rounded-lg divide-y divide-gray-100">
          {dentro.map((f) => (
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
                {f.cantElegida}
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
      <SelectWithSearch
        options={catalogo
          .filter((f) => f.is_active !== false)
          .map((f) => ({
            value: f.codigo,
            label: `${f.nombre} · $${(f.precio || 0).toLocaleString("es-CL")}`,
          }))}
        value=""
        onChange={(codigo) => sumar(codigo, 1)}
        placeholder="Agregar servicio fijo…"
        searchPlaceholder="Buscar servicio por nombre…"
        noResultsText="No se encontraron servicios"
      />
    </div>
  );
}
