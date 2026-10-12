import ElegirGrupo from "../listas/ElegirGrupo";
import { useGruposDePaquetes } from "../../hooks/useGruposDePaquetes";
import { GrupoDePaquetes } from "../../types/serviceGroupCollections.types";

/**
 * EL GRUPO DE UN PAQUETE AL CREARLO (12-10-2026, migración 120). La pieza
 * común es ElegirGrupo; esta solo le pasa los grupos de paquetes, para que
 * el cotizador (congelado por tamaño) no tenga que leerlos.
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
    <ElegirGrupo
      grupos={grupos}
      valor={valor}
      onCambio={onCambio}
      ayuda="Aún no hay grupos: se crean en «Ordenar grupos…», al pie de «Partir de un paquete»."
    />
  );
}
