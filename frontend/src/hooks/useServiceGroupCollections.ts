import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createServiceGroupCollection,
  deleteServiceGroupCollection,
  getServiceGroupCollections,
} from "../services/serviceGroupCollections.service";
import {
  CreateServiceGroupCollection,
  ServiceGroupCollection,
} from "../types/serviceGroupCollections.types";

// Paquetes vía React Query (Etapa 2, 21-07-2026): misma API del hook
// original, con caché compartido e invalidación tras cada cambio.
export function useServiceGroupCollections() {
  const queryClient = useQueryClient();

  const { data: collections = [], isPending: loading } = useQuery({
    queryKey: ["serviceGroupCollections"],
    queryFn: async (): Promise<ServiceGroupCollection[]> => {
      const data = await getServiceGroupCollections();
      return Array.isArray(data) ? data : [];
    },
  });

  const reload = () =>
    queryClient.invalidateQueries({ queryKey: ["serviceGroupCollections"] });

  const saveCollection = async (collection: CreateServiceGroupCollection) => {
    await createServiceGroupCollection(collection);
    await reload();
  };

  const removeCollection = async (id: ServiceGroupCollection["id"]) => {
    await deleteServiceGroupCollection(id);
    queryClient.setQueryData<ServiceGroupCollection[]>(
      ["serviceGroupCollections"],
      (prev) => (prev ?? []).filter((c) => c.id !== id),
    );
    await reload();
  };

  return {
    collections,
    loading,
    reload,
    saveCollection,
    removeCollection,
  };
}
