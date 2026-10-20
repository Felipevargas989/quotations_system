import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  asignarGrupoAlMenu,
  borrarGrupoDeMenus,
  crearGrupoDeMenus,
  getGruposDeMenus,
  ordenarGruposDeMenus,
  renombrarGrupoDeMenus,
} from "../services/serviceGroups.service";
import { GrupoDeMenus, ServiceGroup } from "../types/serviceGroups.types";

/**
 * LOS GRUPOS DE MENÚS GUARDADOS (12-10-2026, migración 121). Felipe: "así
 * podemos ordenar también los menús guardados de cada categoría". Se piden
 * TODOS una vez (caché "gruposDeMenus") y cada casilla toma los de su
 * categoría. Cada cambio refresca también los menús ("serviceGroups"),
 * porque borrar un grupo los deja sin grupo y cambiar un menú de grupo
 * cambia su fila.
 *
 * `cargando` (20-10-2026): la primera vez, hasta que llegan. La lista de
 * menús espera con «Cargando…» en vez de salir por precio sin títulos y
 * saltar un instante después a sus grupos (Felipe: "se reordenan").
 */
export function useGruposDeMenus() {
  const queryClient = useQueryClient();

  const { data: todos = [], isLoading: cargando } = useQuery({
    queryKey: ["gruposDeMenus"],
    queryFn: async (): Promise<GrupoDeMenus[]> => {
      const data = await getGruposDeMenus();
      return Array.isArray(data) ? data : [];
    },
  });

  const recargar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["gruposDeMenus"] }),
      queryClient.invalidateQueries({ queryKey: ["serviceGroups"] }),
    ]);

  // Los de una categoría, en su orden (también después de mover uno,
  // antes de que responda el motor).
  const gruposDe = (category: string) =>
    todos
      .filter((g) => g.category === category)
      .sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
      );

  const crear = async (category: string, name: string) => {
    await crearGrupoDeMenus(category, name);
    await recargar();
  };

  const renombrar = async (id: GrupoDeMenus["id"], name: string) => {
    await renombrarGrupoDeMenus(id, name);
    await recargar();
  };

  // El orden nuevo se ve al instante; si el motor lo rechaza, vuelve el
  // orden real al recargar (mismo trato que los tipos de cliente).
  const ordenar = async (category: string, ids: GrupoDeMenus["id"][]) => {
    queryClient.setQueryData<GrupoDeMenus[]>(["gruposDeMenus"], (prev) => {
      const lista = prev ?? [];
      const posicion = new Map(ids.map((id, i) => [id, i + 1]));
      return lista.map((g) =>
        g.category === category && posicion.has(g.id)
          ? { ...g, sort_order: posicion.get(g.id) ?? g.sort_order }
          : g,
      );
    });
    try {
      await ordenarGruposDeMenus(category, ids);
    } finally {
      await recargar();
    }
  };

  const borrar = async (id: GrupoDeMenus["id"]) => {
    await borrarGrupoDeMenus(id);
    await recargar();
  };

  const asignar = async (
    menuId: ServiceGroup["id"],
    grupoId: GrupoDeMenus["id"] | null,
  ) => {
    await asignarGrupoAlMenu(menuId, grupoId);
    await recargar();
  };

  return { gruposDe, cargando, crear, renombrar, ordenar, borrar, asignar };
}
