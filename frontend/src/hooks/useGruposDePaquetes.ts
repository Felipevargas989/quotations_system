import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  actualizarPaquete,
  borrarGrupoDePaquetes,
  crearGrupoDePaquetes,
  getGruposDePaquetes,
  ordenarGruposDePaquetes,
  renombrarGrupoDePaquetes,
} from "../services/serviceGroupCollections.service";
import {
  CambiosDePaquete,
  GrupoDePaquetes,
  ServiceGroupCollection,
} from "../types/serviceGroupCollections.types";

/**
 * LOS GRUPOS DE PAQUETES (12-10-2026, migración 120). Felipe: "mejor crear
 * y editar listas, es más fácil que una sección que se arme por el nombre
 * del paquete". Caché propio ("gruposDePaquetes"); cada cambio refresca
 * también los paquetes, porque borrar un grupo los deja sin grupo y
 * editar un paquete cambia su nombre o su grupo.
 */
export function useGruposDePaquetes() {
  const queryClient = useQueryClient();

  const { data: grupos = [] } = useQuery({
    queryKey: ["gruposDePaquetes"],
    queryFn: async (): Promise<GrupoDePaquetes[]> => {
      const data = await getGruposDePaquetes();
      return Array.isArray(data) ? data : [];
    },
  });

  const recargar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["gruposDePaquetes"] }),
      queryClient.invalidateQueries({ queryKey: ["serviceGroupCollections"] }),
    ]);

  const crear = async (name: string) => {
    await crearGrupoDePaquetes(name);
    await recargar();
  };

  const renombrar = async (id: GrupoDePaquetes["id"], name: string) => {
    await renombrarGrupoDePaquetes(id, name);
    await recargar();
  };

  // Mismo trato que los tipos de cliente: el orden nuevo se ve al
  // instante y, si el motor lo rechaza, vuelve el orden real al recargar.
  const ordenar = async (ids: GrupoDePaquetes["id"][]) => {
    queryClient.setQueryData<GrupoDePaquetes[]>(["gruposDePaquetes"], (prev) =>
      ids
        .map((id) => (prev ?? []).find((g) => g.id === id))
        .filter((g): g is GrupoDePaquetes => !!g),
    );
    try {
      await ordenarGruposDePaquetes(ids);
    } finally {
      await recargar();
    }
  };

  const borrar = async (id: GrupoDePaquetes["id"]) => {
    await borrarGrupoDePaquetes(id);
    await recargar();
  };

  const editarPaquete = async (
    id: ServiceGroupCollection["id"],
    cambios: CambiosDePaquete,
  ) => {
    await actualizarPaquete(id, cambios);
    await recargar();
  };

  return { grupos, crear, renombrar, ordenar, borrar, editarPaquete };
}
