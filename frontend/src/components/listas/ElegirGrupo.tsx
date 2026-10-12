import SelectWithSearch from "../selects/SelectWithSearch";

/**
 * EL CAMPO "GRUPO" (12-10-2026): elegir el grupo de un paquete o de un
 * menú guardado. Vacío = sin grupo, va al final de la lista bajo "Otros".
 * Pieza común de los dos: la pantalla le pasa los grupos que corresponden.
 */
export default function ElegirGrupo({
  grupos,
  valor,
  onCambio,
  ayuda,
}: {
  readonly grupos: readonly { id: number; name: string }[];
  readonly valor: number | null;
  readonly onCambio: (id: number | null) => void;
  /** Qué hacer si todavía no hay grupos. */
  readonly ayuda: string;
}) {
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
        <p className="mt-1 text-xs text-gray-500">{ayuda}</p>
      )}
    </div>
  );
}
