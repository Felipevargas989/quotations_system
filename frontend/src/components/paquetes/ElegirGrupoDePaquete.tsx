import SelectWithSearch from "../selects/SelectWithSearch";
import { useGruposDePaquetes } from "../../hooks/useGruposDePaquetes";
import { GrupoDePaquetes } from "../../types/serviceGroupCollections.types";

/**
 * EL GRUPO DE UN PAQUETE (12-10-2026, migración 120): el campo "Grupo" al
 * crear un paquete y al editarlo. Vacío = sin grupo, va al final de la
 * lista bajo "Otros". Los grupos se crean en "Ordenar grupos…".
 */
export default function ElegirGrupoDePaquete({
  valor,
  onCambio,
}: {
  readonly valor: GrupoDePaquetes["id"] | null;
  readonly onCambio: (id: GrupoDePaquetes["id"] | null) => void;
}) {
  const { grupos } = useGruposDePaquetes();
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Grupo
      </label>
      <SelectWithSearch
        options={[
          { value: "", label: "Sin grupo (va en «Otros»)" },
          ...grupos.map((g) => ({ value: String(g.id), label: g.name })),
        ]}
        value={valor == null ? "" : String(valor)}
        onChange={(v) => onCambio(v ? Number(v) : null)}
        placeholder="Sin grupo (va en «Otros»)"
        searchPlaceholder="Buscar grupo…"
        mostrarConteo={false}
        sinLimpiar
      />
      {grupos.length === 0 && (
        <p className="mt-1 text-xs text-gray-500">
          Aún no hay grupos: se crean en «Ordenar grupos…», al pie de «Partir de
          un paquete».
        </p>
      )}
    </div>
  );
}
