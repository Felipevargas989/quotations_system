import { useState } from "react";
import { CreateServicesBulkDto } from "../../types/services.types";
import { createServicesBulk } from "../../services/services.service";
import ExcelUpload from "../../components/ExcelUpload";
import ServicesTable from "./ServicesTable";
import { useServices } from "../../hooks/useServices";

export default function ServicesPage() {
  const [showUpload, setShowUpload] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Gestión de Servicios
        </h1>
        <div className="flex space-x-3">
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
        onEditService={(service, type) => {
          // TODO: Implement edit functionality
          console.log("Edit service:", service, type);
        }}
        onDeleteService={(serviceId, type) => {
          // TODO: Implement delete functionality
          console.log("Delete service:", serviceId, type);
        }}
      />
    </div>
  );
}
