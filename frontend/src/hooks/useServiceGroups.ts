import { useEffect, useState } from "react";
import {
  createServiceGroup,
  deleteServiceGroup,
  getServiceGroups,
} from "../services/serviceGroups.service";
import { CreateServiceGroup, ServiceGroup } from "../types/serviceGroups.types";

export function useServiceGroups() {
  const [groups, setGroups] = useState<ServiceGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      setLoading(true);
      const data = await getServiceGroups();
      setGroups(Array.isArray(data) ? data : []);
    } catch (error) {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  const saveGroup = async (group: CreateServiceGroup) => {
    await createServiceGroup(group);
    await loadGroups();
  };

  const removeGroup = async (id: ServiceGroup["id"]) => {
    await deleteServiceGroup(id);
    setGroups((prev) => prev.filter((g) => g.id !== id));
  };

  return {
    groups,
    loading,
    reload: loadGroups,
    saveGroup,
    removeGroup,
  };
}
