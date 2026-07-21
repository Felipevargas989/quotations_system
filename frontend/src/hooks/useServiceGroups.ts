import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createServiceGroup,
  deleteServiceGroup,
  getServiceGroups,
} from "../services/serviceGroups.service";
import { CreateServiceGroup, ServiceGroup } from "../types/serviceGroups.types";

// Menús guardados vía React Query (Etapa 2, 21-07-2026): misma API del
// hook original, con caché compartido e invalidación tras cada cambio.
export function useServiceGroups() {
  const queryClient = useQueryClient();

  const { data: groups = [], isPending: loading } = useQuery({
    queryKey: ["serviceGroups"],
    queryFn: async (): Promise<ServiceGroup[]> => {
      const data = await getServiceGroups();
      return Array.isArray(data) ? data : [];
    },
  });

  const reload = () =>
    queryClient.invalidateQueries({ queryKey: ["serviceGroups"] });

  const saveGroup = async (group: CreateServiceGroup) => {
    await createServiceGroup(group);
    await reload();
  };

  const removeGroup = async (id: ServiceGroup["id"]) => {
    await deleteServiceGroup(id);
    // Quita el menú de la pantalla al instante y confirma con el servidor.
    queryClient.setQueryData<ServiceGroup[]>(["serviceGroups"], (prev) =>
      (prev ?? []).filter((g) => g.id !== id),
    );
    await reload();
  };

  return {
    groups,
    loading,
    reload,
    saveGroup,
    removeGroup,
  };
}
