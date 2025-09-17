import { useState } from "react";
import {
  CreateServicesBulkDto,
  FixedService,
  VariableService,
} from "../../types/services.types";
import { createServicesBulk } from "../../services/services.service";
import ExcelUpload from "../../components/ExcelUpload";
import ServicesTable from "./components/ServicesTable";
import ServiceForm from "./components/ServiceForm";
import { useServices } from "../../hooks/useServices";
import { ServiceType } from "./constants";

export default function ServicesPage() {
  const [showUpload, setShowUpload] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // ServiceForm states
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [editingService, setEditingService] = useState<
    VariableService | FixedService | null
  >(null);
  const [serviceType, setServiceType] = useState<ServiceType>(
    ServiceType.VARIABLE,
  );

  const {
    variableServices,
    rawFixedServices: fixedServices,
    loading,
    error,
    reload: loadServices,
  } = useServices();

  const handleExcelDataParsed = async (data: CreateServicesBulkDto) => {
    try {
      setUploadError(null);
      setUploadSuccess(null);

      await createServicesBulk(data);

      setUploadSuccess(
        `✅ Servicios creados exitosamente: ${data.variable_services.length} servicios variables y ${data.fixed_services.length} servicios fijos`,
      );
      setShowUpload(false);

      // Reload services to show the newly created ones
      await loadServices();
    } catch (error) {
      setUploadError(
        `Error al crear servicios: ${error instanceof Error ? error.message : "Error desconocido"}`,
      );
    }
  };

  const handleUploadError = (error: string) => {
    setUploadError(error);
    setUploadSuccess(null);
  };

  const handleCreateService = (type: ServiceType) => {
    setServiceType(type);
    setEditingService(null);
    setShowServiceForm(true);
  };

  const handleEditService = (
    service: VariableService | FixedService,
    type: ServiceType,
  ) => {
    setServiceType(type);
    setEditingService(service);
    setShowServiceForm(true);
  };

  const handleServiceFormSuccess = async () => {
    await loadServices();
    setShowServiceForm(false);
    setEditingService(null);
  };

  const handleCloseServiceForm = () => {
    setShowServiceForm(false);
    setEditingService(null);
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
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
          >
            <span>+</span>
            <span>Servicio Variable</span>
          </button>
          <button
            onClick={() => handleCreateService(ServiceType.FIXED)}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 flex items-center space-x-2"
          >
            <span>+</span>
            <span>Servicio Fijo</span>
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center space-x-2"
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

      {/* Excel Upload Component */}
      {showUpload && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-900">
              Cargar Servicios desde Excel
            </h2>
            <button
              onClick={() => {
                setShowUpload(false);
                setUploadError(null);
                setUploadSuccess(null);
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
          <ExcelUpload
            onDataParsed={handleExcelDataParsed}
            onError={handleUploadError}
          />
        </div>
      )}

      {/* Services Table */}
      <ServicesTable
        variableServices={variableServices}
        fixedServices={fixedServices}
        onEditService={handleEditService}
        // onDeleteService={handleDeleteService}
        onDeleteService={(serviceId, type) => {
          // TODO: Implement delete functionality
          console.log("Delete service:", serviceId, type);
        }}
      />

      {/* Service Form Modal */}
      <ServiceForm
        isOpen={showServiceForm}
        onClose={handleCloseServiceForm}
        onSuccess={handleServiceFormSuccess}
        service={editingService || undefined}
        serviceType={serviceType}
        isEditing={!!editingService}
      />
    </div>
  );
}
