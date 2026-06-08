import { useEffect, useState } from "react";
import {
  createServiceGroupCollection,
  deleteServiceGroupCollection,
  getServiceGroupCollections,
} from "../services/serviceGroupCollections.service";
import {
  CreateServiceGroupCollection,
  ServiceGroupCollection,
} from "../types/serviceGroupCollections.types";

export function useServiceGroupCollections() {
  const [collections, setCollections] = useState<ServiceGroupCollection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCollections();
  }, []);

  const loadCollections = async () => {
    try {
      setLoading(true);
      const data = await getServiceGroupCollections();
      setCollections(Array.isArray(data) ? data : []);
    } catch (error) {
      setCollections([]);
    } finally {
      setLoading(false);
    }
  };

  const saveCollection = async (collection: CreateServiceGroupCollection) => {
    await createServiceGroupCollection(collection);
    await loadCollections();
  };

  const removeCollection = async (id: ServiceGroupCollection["id"]) => {
    await deleteServiceGroupCollection(id);
    setCollections((prev) => prev.filter((c) => c.id !== id));
  };

  return {
    collections,
    loading,
    reload: loadCollections,
    saveCollection,
    removeCollection,
  };
}
