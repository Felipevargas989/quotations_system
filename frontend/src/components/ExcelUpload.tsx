import { useState, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  CreateServicesBulkDto,
  CreateVariableService,
  CreateFixedService,
} from "../types/services.types";

interface ExcelUploadProps {
  readonly onDataParsed: (data: CreateServicesBulkDto) => void;
  readonly onError: (error: string) => void;
}

export default function ExcelUpload({
  onDataParsed,
  onError,
}: ExcelUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
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
      onError("Por favor selecciona un archivo Excel válido (.xlsx o .xls)");
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
    setIsProcessing(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });

      const fixedSheetName = "Servicios fijos";
      const variableSheetName = "Servicios variables";
      // Check if required sheets exist
      const sheetNames = workbook.SheetNames;
      const hasBasesPrecios = sheetNames.includes(variableSheetName);
      const hasServiciosFijos = sheetNames.includes(fixedSheetName);

      if (!hasBasesPrecios || !hasServiciosFijos) {
        throw new Error(
          `El archivo Excel debe contener las hojas '${variableSheetName}' y '${fixedSheetName}'`,
        );
      }

      // Parse "Bases de precios" sheet
      const basesPreciosSheet = workbook.Sheets[variableSheetName];
      const basesPreciosData = XLSX.utils.sheet_to_json(basesPreciosSheet, {
        header: 1,
      });

      // Parse "Servicios Fijos" sheet
      const serviciosFijosSheet = workbook.Sheets[fixedSheetName];
      const serviciosFijosData = XLSX.utils.sheet_to_json(serviciosFijosSheet, {
        header: 1,
      });

      // Transform data to CreateServicesBulkDto format
      const servicesData = transformExcelData(
        basesPreciosData,
        serviciosFijosData,
      );

      onDataParsed(servicesData);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Error al procesar el archivo Excel";
      setParseError(errorMessage);
      onError(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const processVariableServices = (data: any[]): CreateVariableService[] => {
    const services: CreateVariableService[] = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row && row.length >= 4 && row[0] && row[1] && row[2] && row[3]) {
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
      if (
        row &&
        row.length >= 7 &&
        row[0] &&
        row[1] &&
        row[2] &&
        row[3] &&
        row[4] &&
        row[5] &&
        row[6]
      ) {
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
    basesPreciosData: any[],
    serviciosFijosData: any[],
  ): CreateServicesBulkDto => {
    return {
      variable_services: processVariableServices(basesPreciosData),
      fixed_services: processFixedServices(serviciosFijosData),
    };
  };

  const clearFile = () => {
    setUploadedFile(null);
    setParseError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Cargar Servicios desde Excel
        </h3>

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

              {!isProcessing && !parseError && (
                <div className="flex items-center justify-center space-x-2 text-green-600">
                  <CheckCircle size={16} />
                  <span className="text-sm">
                    Archivo procesado correctamente
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <Upload className="h-12 w-12 text-gray-400 mx-auto" />
              <div>
                <p className="text-lg font-medium text-gray-900">
                  Arrastra tu archivo Excel aquí
                </p>
                <p className="text-sm text-gray-500">
                  o haz clic para seleccionar un archivo
                </p>
              </div>
              <button
                type="button"
                onClick={openFileDialog}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Seleccionar Archivo
              </button>
            </div>
          )}
        </section>

        <div className="mt-4 text-sm text-gray-600">
          <p className="font-medium mb-2">
            Formato requerido del archivo Excel:
          </p>
          <div className="space-y-2">
            <div>
              <p className="font-medium">Hoja "Servicios variables":</p>
              <p className="text-xs">
                Columnas: Codigo, Nombre, Precio, Categorias
              </p>
            </div>
            <div>
              <p className="font-medium">Hoja "Servicios fijos":</p>
              <p className="text-xs">
                Columnas: Codigo, Item, Precio, Tipo servicios, Tipo_Calculo,
                Min_Precio, Max_Precio, Precio_Por_Persona
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
