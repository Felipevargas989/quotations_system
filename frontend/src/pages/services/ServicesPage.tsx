import { useState } from "react";
import { FixedService, VariableService } from "../../types/services.types";
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

  // ServiceForm states
  const [showFixedServiceForm, setShowFixedServiceForm] = useState(false);
  const [showVariableServiceForm, setShowVariableServiceForm] = useState(false);
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
        <div className="flex space-x-3">
          <button
            onClick={() => handleCreateService(ServiceType.VARIABLE)}
            // className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
          >
            <span>+</span>
            <span>Servicio Variable</span>
          </button>
          <button
            onClick={() => handleCreateService(ServiceType.FIXED)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
          >
            <span>+</span>
            <span>Servicio Fijo</span>
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
          >
            <span>📁 Cargar desde Excel</span>
          </button>
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
          <p className="text-red-800">Error loading services: {error}</p>
        </div>
      )}

      {loading && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-800">Loading services...</p>
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
        orderedCategories={orderedCategories}
        variableServices={variableServices}
        categoryLinks={categoryLinks}
        onEdit={(s) => handleEditService(s, ServiceType.VARIABLE)}
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
      />

      <VariableServiceForm
        isOpen={showVariableServiceForm}
        onClose={handleCloseServiceForm}
        onSuccess={handleServiceFormSuccess}
        service={editingService as VariableService | undefined}
        isEditing={!!editingService}
      />
    </div>
  );
}
