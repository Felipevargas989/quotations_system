import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Pin, Plus, Tag } from "lucide-react";
import { FixedService, VariableService } from "../../types/services.types";
import { useAuth } from "../../contexts/AuthContext";
import {
  getAllIngredientRecipeItems,
  getSupplies,
} from "../../services/logistics.service";
import { toBaseQty } from "../../types/logistics.types";
import {
  deleteCategoryById,
  removeFixedService,
  removeVariableService,
  reorderCategories,
  updateCategoryById,
  updateFixedService,
  updateVariableService,
} from "../../services/services.service";
import ExcelUpload from "./components/ExcelUpload";
import ServicesTable from "./components/ServicesTable";
import VariableServicesByCategory from "./components/variableServices/VariableServicesByCategory";
import { useServices } from "../../hooks/useServices";
import { ServiceType } from "./constants";
import VariableServiceForm from "./components/variableServices/VariableServiceForm";
import FixedServiceForm from "./components/FixedServiceForm";

export default function ServicesPage() {
  const [showUpload, setShowUpload] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Menú del botón "+ Nuevo servicio" (variable / fijo / importar Excel).
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const createMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showCreateMenu) return;
    const onClick = (e: MouseEvent) => {
      if (!createMenuRef.current?.contains(e.target as Node)) {
        setShowCreateMenu(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowCreateMenu(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [showCreateMenu]);

  // ServiceForm states
  const [showFixedServiceForm, setShowFixedServiceForm] = useState(false);
  const [showVariableServiceForm, setShowVariableServiceForm] = useState(false);
  const [initialFormTab, setInitialFormTab] = useState<"datos" | "receta">(
    "datos",
  );
  const [editingService, setEditingService] = useState<
    VariableService | FixedService | null
  >(null);
  const [serviceType, setServiceType] = useState<ServiceType>(
    ServiceType.VARIABLE,
  );

  const {
    variableServices,
    rawFixedServices: fixedServices,
    orderedCategories,
    categoryLinks,
    loading,
    error,
    reload: loadServices,
  } = useServices();

  // Costo de insumos por persona de cada servicio variable (desde recetas),
  // para mostrar costo y margen junto al precio en la lista. Vía React
  // Query (Etapa 3): silencioso — la lista funciona igual sin costos.
  const { company } = useAuth();
  const queryClient = useQueryClient();

  const { data: recipeCosts = {} } = useQuery({
    queryKey: ["recipeCosts", company?.id],
    enabled: !!company?.id,
    queryFn: async (): Promise<Record<number, number>> => {
      const companyId = Number(company!.id);
      const [items, supplies] = await Promise.all([
        getAllIngredientRecipeItems(companyId),
        getSupplies(companyId),
      ]);
      const priceById = new Map(supplies.map((s) => [s.id, s.price || 0]));
      const costs: Record<number, number> = {};
      items.forEach((it) => {
        if (it.service_type !== "variable" || !it.supply_id) return;
        const price = priceById.get(it.supply_id) || 0;
        costs[it.service_id] =
          (costs[it.service_id] || 0) +
          toBaseQty(it.qty_per_person, it.unit) * price;
      });
      return costs;
    },
    retry: 0,
  });

  const loadRecipeCosts = async () => {
    await queryClient.invalidateQueries({ queryKey: ["recipeCosts"] });
  };

  const handleUploadSuccess = async () => {
    setUploadError(null);
    setUploadSuccess("✅ Servicios creados exitosamente");
    setShowUpload(false);
    // Reload services to show the newly created ones
    await loadServices();
  };

  const handleUploadClose = () => {
    setShowUpload(false);
    setUploadError(null);
    setUploadSuccess(null);
  };

  const handleCreateService = (type: ServiceType) => {
    setServiceType(type);
    if (type === ServiceType.VARIABLE) {
      setShowVariableServiceForm(true);
    } else {
      setShowFixedServiceForm(true);
    }
    setEditingService(null);
  };

  const handleEditService = (
    service: VariableService | FixedService,
    type: ServiceType,
  ) => {
    setInitialFormTab("datos");
    if (type === ServiceType.VARIABLE) {
      setShowVariableServiceForm(true);
    } else {
      setShowFixedServiceForm(true);
    }
    setServiceType(type);
    setEditingService(service);
  };

  // Abre el mismo modal de edición pero directo en la pestaña Receta.
  const handleEditRecipe = (
    service: VariableService | FixedService,
    type: ServiceType,
  ) => {
    setInitialFormTab("receta");
    if (type === ServiceType.VARIABLE) {
      setShowVariableServiceForm(true);
    } else {
      setShowFixedServiceForm(true);
    }
    setServiceType(type);
    setEditingService(service);
  };

  const handleServiceFormSuccess = async () => {
    await loadServices();
    await loadRecipeCosts();
    if (serviceType === ServiceType.VARIABLE) {
      setShowVariableServiceForm(false);
    } else {
      setShowFixedServiceForm(false);
    }
    setEditingService(null);
  };

  const handleCloseServiceForm = () => {
    if (serviceType === ServiceType.VARIABLE) {
      setShowVariableServiceForm(false);
    } else {
      setShowFixedServiceForm(false);
    }
    setEditingService(null);
    // La receta se guarda por línea (sin pasar por onSuccess): refrescar
    // costos al cerrar el modal para que la lista quede al día.
    loadRecipeCosts();
  };

  const handleToggleActive = async (
    service: VariableService | FixedService,
    type: ServiceType,
  ) => {
    const nextActive = service.is_active === false;
    try {
      if (type === ServiceType.VARIABLE) {
        await updateVariableService(service.id, { is_active: nextActive });
      } else {
        await updateFixedService(service.id, { is_active: nextActive });
      }
      await loadServices();
    } catch (error) {
      console.error("Error al actualizar el estado del servicio", error);
      alert("Error al actualizar el estado del servicio");
    }
  };

  const handleRenameCategory = async (id: number, name: string) => {
    await updateCategoryById(id, { name });
    await loadServices();
  };

  const handleToggleCategoryActive = async (
    id: number,
    nextActive: boolean,
  ) => {
    await updateCategoryById(id, { is_active: nextActive });
    await loadServices();
  };

  const handleReorderCategories = async (orderedIds: number[]) => {
    await reorderCategories(orderedIds);
    await loadServices();
  };

  // Delete a category, surfacing the backend "orphan guard": if any service
  // would be left with no category, the backend returns 409 + service_ids.
  const handleDeleteCategory = async (id: number) => {
    try {
      await deleteCategoryById(id);
      await loadServices();
    } catch (err) {
      const data = (
        err as { response?: { data?: { message?: string; service_ids?: number[] } } }
      )?.response?.data;
      if (data?.service_ids?.length) {
        const names = data.service_ids
          .map((sid) => variableServices.find((s) => s.id === sid)?.name)
          .filter((n): n is string => !!n);
        const list = names.length
          ? names.join(", ")
          : `${data.service_ids.length} servicio(s)`;
        throw new Error(
          `No se puede eliminar: estos servicios quedarían sin categoría: ${list}. Asígnalos a otra categoría primero.`,
        );
      }
      throw new Error(data?.message || "No se pudo eliminar la categoría.");
    }
  };

  const handleDeleteService = async (serviceId: number, type: ServiceType) => {
    if (!confirm("¿Estás seguro de que quieres eliminar este servicio?"))
      return;
    try {
      if (type === ServiceType.VARIABLE) {
        await removeVariableService(serviceId);
      } else {
        await removeFixedService(serviceId);
      }
    } catch (error) {
      console.error("Error al eliminar el servicio", error);
      alert("Error al eliminar el servicio");
    }
    alert("Servicio eliminado correctamente");
    await loadServices();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Gestión de Servicios
        </h1>
        {/* Un solo botón: el menú despliega variable / fijo / importar Excel */}
        <div className="relative" ref={createMenuRef}>
          <button
            onClick={() => setShowCreateMenu((v) => !v)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
          >
            <Plus size={18} />
            <span>Nuevo servicio</span>
          </button>
          {showCreateMenu && (
            <div className="absolute right-0 top-full mt-1 z-20 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-gray-700">
              <button
                type="button"
                onClick={() => {
                  setShowCreateMenu(false);
                  handleCreateService(ServiceType.VARIABLE);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
              >
                <Tag size={15} className="text-blue-600" /> Servicio variable
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateMenu(false);
                  handleCreateService(ServiceType.FIXED);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
              >
                <Pin size={15} className="text-green-600" /> Servicio fijo
              </button>
              <div className="my-1 border-t border-gray-100" />
              <button
                type="button"
                onClick={() => {
                  setShowCreateMenu(false);
                  setShowUpload(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
              >
                <FileSpreadsheet size={15} className="text-gray-500" />{" "}
                Importar desde Excel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Success/Error Messages */}
      {uploadSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800">{uploadSuccess}</p>
        </div>
      )}

      {uploadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{uploadError}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">
            No se pudieron cargar los servicios: {error}
          </p>
        </div>
      )}

      {loading && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-800">Cargando servicios…</p>
        </div>
      )}

      {/* Excel Upload Dialog */}
      <ExcelUpload
        isOpen={showUpload}
        onClose={handleUploadClose}
        onSuccess={handleUploadSuccess}
      />

      {/* Variable services grouped by category. Each category box header has
          the drag handle (reorder categories) and the ⋮ menu (rename /
          activate-deactivate / delete). Services inside drag to reorder. */}
      <div className="mb-2 text-sm font-medium text-gray-700">
        Servicios Variables
      </div>
      <VariableServicesByCategory
        companyId={company?.id ? Number(company.id) : null}
        orderedCategories={orderedCategories}
        variableServices={variableServices}
        categoryLinks={categoryLinks}
        onEdit={(s) => handleEditService(s, ServiceType.VARIABLE)}
        onEditRecipe={(s) => handleEditRecipe(s, ServiceType.VARIABLE)}
        recipeCosts={recipeCosts}
        onDelete={(id) => handleDeleteService(id, ServiceType.VARIABLE)}
        onToggleActive={(s) => handleToggleActive(s, ServiceType.VARIABLE)}
        onReordered={loadServices}
        onRenameCategory={handleRenameCategory}
        onToggleCategoryActive={handleToggleCategoryActive}
        onDeleteCategory={handleDeleteCategory}
        onReorderCategories={handleReorderCategories}
      />

      {/* Fixed services table (unchanged) */}
      <div className="mt-6">
        <ServicesTable
          variableServices={[]}
          fixedServices={fixedServices}
          onEditService={handleEditService}
          onEditRecipe={handleEditRecipe}
          onDeleteService={handleDeleteService}
          onToggleActive={handleToggleActive}
          hideVariable
        />
      </div>

      <FixedServiceForm
        isOpen={showFixedServiceForm}
        onClose={handleCloseServiceForm}
        onSuccess={handleServiceFormSuccess}
        service={editingService as FixedService | undefined}
        isEditing={!!editingService}
        initialTab={initialFormTab}
      />

      <VariableServiceForm
        isOpen={showVariableServiceForm}
        onClose={handleCloseServiceForm}
        onSuccess={handleServiceFormSuccess}
        service={editingService as VariableService | undefined}
        isEditing={!!editingService}
        initialTab={initialFormTab}
      />
    </div>
  );
}
