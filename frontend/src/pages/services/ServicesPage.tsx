import { useEffect, useState } from "react";
import {
  CreateServicesBulkDto,
  FixedService,
  VariableService,
} from "../../types/services.types";
import {
  createServicesBulk,
  findAllServices,
} from "../../services/services.service";
import ExcelUpload from "../../components/ExcelUpload";

export default function ServicesPage() {
  const [showUpload, setShowUpload] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [services, setServices] = useState<{
    variableServices: VariableService[];
    fixedServices: FixedService[];
  }>({
    variableServices: [],
    fixedServices: [],
  });

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    const response = await findAllServices();
    // TODO: render services
    console.log(response);
    setServices(response);
  };

  const handleExcelDataParsed = async (data: CreateServicesBulkDto) => {
    try {
      setUploadError(null);
      setUploadSuccess(null);

      await createServicesBulk(data);

      setUploadSuccess(
        `✅ Servicios creados exitosamente: ${data.variable_services.length} servicios variables y ${data.fixed_services.length} servicios fijos`,
      );
      setShowUpload(false);
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

      {/* Services List Placeholder */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Servicios</h3>
        <p className="text-gray-500">
          Los servicios cargados aparecerán aquí. Usa el botón "Cargar desde
          Excel" para importar servicios desde un archivo Excel.
        </p>
      </div>
    </div>
  );
}
