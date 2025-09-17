import { useState, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  X,
  Download,
  Save,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  CreateServicesBulkDto,
  CreateVariableService,
  CreateFixedService,
} from "../../../types/services.types";
import { createServicesBulk } from "../../../services/services.service";

interface ExcelUploadProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
}

export default function ExcelUpload({
  isOpen,
  onClose,
  onSuccess,
}: ExcelUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<CreateServicesBulkDto | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const excelFile = files.find(
      (file) =>
        file.type ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        file.type === "application/vnd.ms-excel" ||
        file.name.endsWith(".xlsx") ||
        file.name.endsWith(".xls"),
    );

    if (excelFile) {
      handleFileUpload(excelFile);
    } else {
      setError("Por favor selecciona un archivo Excel válido (.xlsx o .xls)");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploadedFile(file);
    setParseError(null);
    setError(null);
    setParsedData(null);
    setIsProcessing(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });

      const variableSheetName = "Servicios variables";
      const fixedSheetName = "Servicios fijos";
      // Check if required sheets exist
      const sheetNames = workbook.SheetNames;
      const hasVariableServices = sheetNames.includes(variableSheetName);
      const hasFixedServices = sheetNames.includes(fixedSheetName);

      if (!hasVariableServices || !hasFixedServices) {
        throw new Error(
          `El archivo Excel debe contener las hojas '${variableSheetName}' y '${fixedSheetName}'`,
        );
      }

      // Parse "Servicios variables" sheet
      const variableServicesSheet = workbook.Sheets[variableSheetName];
      const variableServicesData = XLSX.utils.sheet_to_json(
        variableServicesSheet,
        {
          header: 1,
        },
      );

      // Parse "Servicios fijos" sheet
      const fixedServicesSheet = workbook.Sheets[fixedSheetName];
      const fixedServicesData = XLSX.utils.sheet_to_json(fixedServicesSheet, {
        header: 1,
      });

      // Transform data to CreateServicesBulkDto format
      const servicesData = transformExcelData(
        variableServicesData,
        fixedServicesData,
      );

      setParsedData(servicesData);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Error al procesar el archivo Excel";
      setParseError(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const processVariableServices = (data: any[]): CreateVariableService[] => {
    const services: CreateVariableService[] = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row && row[1] && row[2] && row[3]) {
        services.push({
          code: String(row[0]).trim(),
          name: String(row[1]).trim(),
          price: Number(row[2]),
          category: String(row[3]).trim(),
        });
      }
    }
    return services;
  };

  const processFixedServices = (data: any[]): CreateFixedService[] => {
    const services: CreateFixedService[] = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row && row[1] && row[2] && row[3]) {
        services.push({
          code: String(row[0]).trim(),
          name: String(row[1]).trim(),
          price: Number(row[2]),
          calculation_type: String(row[3]).trim(),
          min_price: row[4] ? Number(row[4]) : undefined,
          max_price: row[5] ? Number(row[5]) : undefined,
          price_per_person: row[6] ? Number(row[6]) : undefined,
        });
      }
    }
    return services;
  };

  const transformExcelData = (
    variableServicesData: any[],
    fixedServicesData: any[],
  ): CreateServicesBulkDto => {
    return {
      variable_services: processVariableServices(variableServicesData),
      fixed_services: processFixedServices(fixedServicesData),
    };
  };

  const clearFile = () => {
    setUploadedFile(null);
    setParseError(null);
    setParsedData(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUploadServices = async () => {
    if (!parsedData) return;

    setIsUploading(true);
    setError(null);

    try {
      await createServicesBulk(parsedData);
      onSuccess();
      onClose();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Error al subir los servicios",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    clearFile();
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const downloadTemplate = () => {
    const link = document.createElement("a");
    link.href = "/templates/Template Services.xlsx";
    link.download = "Template Services.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            Cargar Servicios desde Excel
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {/* Template Download Section */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <FileSpreadsheet className="h-5 w-5 text-blue-600 mt-0.5" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-blue-900 mb-1">
                  ¿Primera vez? Descarga la plantilla
                </h4>
                <p className="text-sm text-blue-700 mb-3">
                  Descarga el archivo de plantilla, complétalo con tus servicios
                  y luego súbelo aquí.
                </p>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Descargar Plantilla
                </button>
              </div>
            </div>
          </div>

          {/* File Upload Section */}
          <section
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragOver
                ? "border-blue-400 bg-blue-50"
                : "border-gray-300 hover:border-gray-400"
            } ${isProcessing ? "opacity-50 pointer-events-none" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            aria-label="Área de carga de archivos Excel"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
            />

            {uploadedFile ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center space-x-2">
                  <FileSpreadsheet className="h-8 w-8 text-green-600" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-900">
                      {uploadedFile.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(uploadedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearFile}
                    className="text-gray-400 hover:text-gray-600"
                    aria-label="Eliminar archivo"
                  >
                    <X size={16} />
                  </button>
                </div>

                {isProcessing && (
                  <div className="flex items-center justify-center space-x-2 text-blue-600">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    <span className="text-sm">Procesando archivo...</span>
                  </div>
                )}

                {parseError && (
                  <div className="flex items-center justify-center space-x-2 text-red-600">
                    <AlertCircle size={16} />
                    <span className="text-sm">{parseError}</span>
                  </div>
                )}

                {!isProcessing && !parseError && parsedData && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center space-x-2 text-green-600">
                      <CheckCircle size={16} />
                      <span className="text-sm">
                        Archivo procesado correctamente
                      </span>
                    </div>

                    {/* Show parsed data summary */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-3">
                        Resumen de servicios encontrados:
                      </h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-600">
                            {parsedData.variable_services.length}
                          </div>
                          <div className="text-gray-600">
                            Servicios Variables
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-600">
                            {parsedData.fixed_services.length}
                          </div>
                          <div className="text-gray-600">Servicios Fijos</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <Upload className="h-12 w-12 text-gray-400 mx-auto" />
                <div>
                  <p className="text-lg font-medium text-gray-900">
                    Arrastra tu archivo Excel completado aquí
                  </p>
                  <p className="text-sm text-gray-500">
                    o haz clic para seleccionar el archivo que completaste
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    (Asegúrate de haber descargado y completado la plantilla
                    primero)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openFileDialog}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Seleccionar Archivo Completado
                </button>
              </div>
            )}
          </section>

          {/* Instructions */}
          <div className="text-sm text-gray-600">
            <p className="font-medium mb-2">Instrucciones:</p>
            <div className="space-y-2">
              <div className="flex items-start space-x-2">
                <span className="text-blue-600 font-bold">1.</span>
                <p>Descarga la plantilla usando el botón de arriba</p>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-blue-600 font-bold">2.</span>
                <p>
                  Completa la plantilla con tus servicios siguiendo el formato
                  indicado
                </p>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-blue-600 font-bold">3.</span>
                <p>Sube el archivo completado usando el área de arriba</p>
              </div>
            </div>

            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="font-medium mb-2 text-gray-800">
                Formato de la plantilla:
              </p>
              <div className="space-y-2">
                <div>
                  <p className="font-medium text-sm">
                    Hoja "Servicios variables":
                  </p>
                  <p className="text-xs text-gray-600">
                    Columnas: Codigo, Nombre, Precio, Categorias
                  </p>
                </div>
                <div>
                  <p className="font-medium text-sm">Hoja "Servicios fijos":</p>
                  <p className="text-xs text-gray-600">
                    Columnas: Codigo, Item, Precio, Tipo servicios,
                    Tipo_Calculo, Min_Precio, Max_Precio, Precio_Por_Persona
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer with action buttons */}
        <div className="flex justify-end space-x-3 p-6 border-t bg-gray-50">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleUploadServices}
            disabled={!parsedData || isUploading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
          >
            {isUploading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <Save size={16} />
            )}
            <span>{isUploading ? "Subiendo..." : "Subir Servicios"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
