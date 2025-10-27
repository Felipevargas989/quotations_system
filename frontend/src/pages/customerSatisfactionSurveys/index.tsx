import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { FileText } from "lucide-react";
import { SurveyTemplate } from "../../types/customerSatisfactionSurveys.types";
import { getTemplate } from "../../services/customerSatisfactionSurveys.service";
import AnswersByQuotation from "./components/AnswersByQuotation";

export default function CustomerSatisfactionSurveysPage() {
  const { company } = useAuth();
  const [template, setTemplate] = useState<SurveyTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (company?.id) {
      fetchTemplate();
    }
  }, [company?.id]);

  const fetchTemplate = async () => {
    if (!company?.id) return;

    try {
      setLoading(true);
      setError(null);
      const templateData = await getTemplate(company.id);
      setTemplate(templateData);
    } catch (err) {
      console.error("Error fetching template:", err);
      setError("Error al cargar la plantilla de encuesta");
    } finally {
      setLoading(false);
    }
  };

  const getQuestionTypeLabel = (type: string) => {
    switch (type) {
      case "number":
        return "Escala numérica";
      case "boolean":
        return "Sí/No";
      case "text":
        return "Texto libre";
      default:
        return "Desconocido";
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-100 p-2 rounded-lg">
            <FileText className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Encuestas de Satisfacción
            </h1>
            <p className="text-gray-600">Cargando plantilla...</p>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="space-y-3">
              <div className="h-3 bg-gray-200 rounded"></div>
              <div className="h-3 bg-gray-200 rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-100 p-2 rounded-lg">
            <FileText className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Encuestas de Satisfacción
            </h1>
            <p className="text-gray-600">Plantilla de encuesta de la empresa</p>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center space-x-3">
            <div className="bg-red-100 p-2 rounded-lg">
              <FileText className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-red-900">
                Error al cargar plantilla
              </h3>
              <p className="text-red-700 mt-1">{error}</p>
              <button
                onClick={fetchTemplate}
                className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Reintentar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <div className="bg-blue-100 p-2 rounded-lg">
          <FileText className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Encuestas de Satisfacción
          </h1>
          <p className="text-gray-600">Plantilla de encuesta de la empresa</p>
        </div>
      </div>

      {template ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            <div className="flex items-center space-x-2 text-sm text-gray-600 mb-6">
              <FileText className="h-4 w-4" />
              <span>{template.questions.length} preguntas</span>
            </div>

            <div className="space-y-4">
              {template.questions.map((question, index) => (
                <div
                  key={question.id}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="text-sm font-medium text-gray-500">
                      Pregunta {index + 1}
                    </span>
                    <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">
                      {getQuestionTypeLabel(question.type)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-900 mb-2">
                    {question.question}
                  </p>

                  {question.options && question.options.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-500 mb-1">
                        Opciones disponibles:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {question.options.map((option, optionIndex) => (
                          <span
                            key={`${question.id}-option-${optionIndex}`}
                            className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded"
                          >
                            {option}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <AnswersByQuotation template={template} />
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="text-center py-8">
            <div className="text-gray-400 mb-2">
              <FileText className="h-12 w-12 mx-auto" />
            </div>
            <p className="text-gray-500">
              No hay plantilla de encuesta disponible
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
