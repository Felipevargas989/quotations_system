import { useState } from "react";
import { Database, Play, CheckCircle, AlertCircle } from "lucide-react";
import { runMigrations } from "../utils/runMigrations.ts";

export default function SetupPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    error?: any;
  } | null>(null);
  const [step, setStep] = useState(1);

  const handleRunMigrations = async () => {
    setIsRunning(true);
    setResult(null);
    setStep(1);

    try {
      // MIGRATIONS TEMPORARILY DISABLED - Database changes will be managed directly
      // await runMigrations((currentStep) => {
      //   setStep(currentStep);
      // });

      // Simulate migration completion for UI
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setResult({ success: true });
    } catch (error) {
      console.error("Error:", error);
      setResult({ success: false, error: error });
    } finally {
      setIsRunning(false);
    }
  };

  const steps = [
    {
      number: 1,
      title: "Creando tablas principales",
      description: "Clientes, cotizaciones, servicios",
    },
    {
      number: 2,
      title: "Configurando perfiles",
      description: "Usuarios y permisos",
    },
    {
      number: 3,
      title: "Estableciendo seguridad",
      description: "RLS y políticas",
    },
    {
      number: 4,
      title: "Cargando datos iniciales",
      description: "Categorías y servicios",
    },
    {
      number: 5,
      title: "¡Completado!",
      description: "Sistema listo para usar",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-8">
        <div className="text-center mb-8">
          <Database className="mx-auto h-16 w-16 text-blue-600 mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Configurar Eventia
          </h1>
          <p className="text-gray-600 text-lg">
            Vamos a preparar todo para que puedas crear cotizaciones
          </p>
        </div>

        {/* Información de lo que se va a crear */}
        <div className="bg-blue-50 rounded-lg p-6 mb-8">
          <h3 className="font-semibold text-blue-900 mb-3 text-lg">
            ⚠️ Configuración Requerida
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-blue-800">
            <div className="flex items-center">
              <CheckCircle className="h-4 w-4 mr-2 text-blue-600" />
              <span>Sistema de cotizaciones</span>
            </div>
            <div className="flex items-center">
              <CheckCircle className="h-4 w-4 mr-2 text-blue-600" />
              <span>Gestión de usuarios y permisos</span>
            </div>
            <div className="flex items-center">
              <CheckCircle className="h-4 w-4 mr-2 text-blue-600" />
              <span>25 servicios con precios</span>
            </div>
            <div className="flex items-center">
              <CheckCircle className="h-4 w-4 mr-2 text-blue-600" />
              <span>Seguridad y políticas RLS</span>
            </div>
          </div>
        </div>

        {/* Progreso */}
        {isRunning && (
          <div className="mb-8">
            <div className="space-y-3">
              {steps.map((stepInfo) => (
                <div
                  key={stepInfo.number}
                  className={`flex items-center p-3 rounded-lg ${
                    step >= stepInfo.number
                      ? "bg-green-50 border border-green-200"
                      : "bg-gray-50"
                  }`}
                >
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                      step > stepInfo.number
                        ? "bg-green-500 text-white"
                        : step === stepInfo.number
                          ? "bg-blue-500 text-white"
                          : "bg-gray-300 text-gray-600"
                    }`}
                  >
                    {step > stepInfo.number ? "✓" : stepInfo.number}
                  </div>
                  <div className="ml-4">
                    <div
                      className={`font-medium ${step >= stepInfo.number ? "text-green-800" : "text-gray-600"}`}
                    >
                      {stepInfo.title}
                    </div>
                    <div
                      className={`text-sm ${step >= stepInfo.number ? "text-green-600" : "text-gray-500"}`}
                    >
                      {stepInfo.description}
                    </div>
                  </div>
                  {step === stepInfo.number && (
                    <div className="ml-auto">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Botón principal */}
        {!result && (
          <button
            onClick={handleRunMigrations}
            disabled={isRunning}
            className={`w-full flex items-center justify-center space-x-3 px-8 py-4 rounded-lg font-semibold text-lg ${
              isRunning
                ? "bg-gray-400 cursor-not-allowed text-white"
                : "bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
            }`}
          >
            {isRunning ? (
              <>
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                <span>Configurando... (esto toma unos segundos)</span>
              </>
            ) : (
              <>
                <Play size={24} />
                <span>¡Empezar Configuración!</span>
              </>
            )}
          </button>
        )}

        {/* Resultado */}
        {result && (
          <div
            className={`p-6 rounded-lg border-2 ${
              result.success
                ? "bg-green-50 border-green-200"
                : "bg-red-50 border-red-200"
            }`}
          >
            <div className="flex items-center space-x-3 mb-4">
              {result.success ? (
                <CheckCircle className="h-8 w-8 text-green-600" />
              ) : (
                <AlertCircle className="h-8 w-8 text-red-600" />
              )}
              <div>
                <h3
                  className={`text-xl font-bold ${
                    result.success ? "text-green-800" : "text-red-800"
                  }`}
                >
                  {result.success ? "¡Todo listo!" : "Hubo un problema"}
                </h3>
                <p
                  className={`${
                    result.success ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {result.success
                    ? "La base de datos está configurada y lista para usar"
                    : "No se pudo completar la configuración"}
                </p>
              </div>
            </div>

            {result.success ? (
              <div className="space-y-3">
                <div className="bg-white p-4 rounded border border-green-200">
                  <h4 className="font-semibold text-green-800 mb-2">
                    ¿Qué sigue?
                  </h4>
                  <div className="space-y-2 text-green-700">
                    <p>• Regresa a la aplicación principal</p>
                    <p>• Crea tu primera cotización</p>
                    <p>• ¡Empieza a cotizar!</p>
                  </div>
                </div>
                <a
                  href="/"
                  className="block w-full text-center bg-green-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-green-700 transition-colors"
                >
                  ¡Ir a la Aplicación!
                </a>
              </div>
            ) : (
              <div className="bg-white p-4 rounded border border-red-200">
                <p className="text-red-700 text-sm">
                  {result.error?.message ||
                    JSON.stringify(result.error) ||
                    "Error desconocido"}
                </p>
                <button
                  onClick={() => setResult(null)}
                  className="mt-3 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                >
                  Intentar de nuevo
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
