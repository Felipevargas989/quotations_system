import { useState, useEffect } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import {
  findAllAnswersFromCompany,
  getTemplate,
} from "../../../services/customerSatisfactionSurveys.service";
import {
  CustomerSatisfactionSurveyResponse,
  SurveyTemplate,
} from "../../../types/customerSatisfactionSurveys.types";
import {
  ChevronDown,
  FileText,
  Calendar,
  User,
  BarChart3,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatISOUTCDateToString } from "../../../utils/dates";
import Navigation from "./navigatino";

export default function AnswersView() {
  const { company } = useAuth();
  const [selectedQuotationId, setSelectedQuotationId] = useState<string>("");
  const [surveyResponses, setSurveyResponses] = useState<
    CustomerSatisfactionSurveyResponse[]
  >([]);
  const [template, setTemplate] = useState<SurveyTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (company?.id) {
      fetchData();
    }
  }, [company?.id]);

  // Auto-select first quotation when responses are loaded
  useEffect(() => {
    if (surveyResponses.length > 0 && !selectedQuotationId) {
      setSelectedQuotationId(surveyResponses[0].quotation_id);
    }
  }, [surveyResponses, selectedQuotationId]);

  const fetchData = async () => {
    if (!company?.id) return;

    try {
      setLoading(true);
      setError(null);
      const [responses, templateData] = await Promise.all([
        findAllAnswersFromCompany(),
        getTemplate(company.id),
      ]);
      setSurveyResponses(responses);
      setTemplate(templateData);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError("Error al cargar los datos");
    } finally {
      setLoading(false);
    }
  };

  const getUniqueQuotations = () => {
    const uniqueQuotations = new Map();
    for (const response of surveyResponses) {
      if (
        response.quotations &&
        !uniqueQuotations.has(response.quotations.id)
      ) {
        uniqueQuotations.set(response.quotations.id, response.quotations);
      }
    }
    return Array.from(uniqueQuotations.values());
  };

  const getSelectedQuotationResponses = () => {
    if (!selectedQuotationId) return [];
    return surveyResponses.filter(
      (response) => response.quotation_id === selectedQuotationId,
    );
  };

  const getQuestionById = (questionId: number) => {
    return template?.questions.find((q: any) => q.id === questionId);
  };

  const navigateToQuotation = (quotationId: string) => {
    // change by opening a new tab
    window.open(`/quotation-form/${quotationId}`, "_blank");
  };

  const goToPreviousQuotation = () => {
    const currentIndex = uniqueQuotations.findIndex(
      (q) => q.id === selectedQuotationId,
    );
    if (currentIndex > 0) {
      setSelectedQuotationId(uniqueQuotations[currentIndex - 1].id);
    }
  };

  const goToNextQuotation = () => {
    const currentIndex = uniqueQuotations.findIndex(
      (q) => q.id === selectedQuotationId,
    );
    if (currentIndex < uniqueQuotations.length - 1) {
      setSelectedQuotationId(uniqueQuotations[currentIndex + 1].id);
    }
  };

  const selectedResponses = getSelectedQuotationResponses();
  const uniqueQuotations = getUniqueQuotations();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-100 p-2 rounded-lg">
            <BarChart3 className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Respuestas por Cotización
            </h1>
            <p className="text-gray-600">Cargando respuestas...</p>
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
            <BarChart3 className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Respuestas por Cotización
            </h1>
            <p className="text-gray-600">
              Respuestas de encuestas de satisfacción
            </p>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center space-x-3">
            <div className="bg-red-100 p-2 rounded-lg">
              <BarChart3 className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-red-900">
                Error al cargar datos
              </h3>
              <p className="text-red-700 mt-1">{error}</p>
              <button
                onClick={fetchData}
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
      <Navigation basePath="/customer-satisfaction-survey" />

      {/* Quotation Selector */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="mb-6">
          <label
            htmlFor="quotation-select"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Seleccionar Cotización
          </label>
          <div className="relative">
            <select
              id="quotation-select"
              value={selectedQuotationId}
              onChange={(e) => setSelectedQuotationId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white pr-10"
            >
              <option value="">Selecciona una cotización</option>
              {uniqueQuotations.map((quotation: any) => (
                <option key={quotation.id} value={quotation.id}>
                  {quotation.quotation_number} -{" "}
                  {quotation.clients?.name || "Sin cliente"}
                  {quotation.event_date &&
                    ` (${formatISOUTCDateToString(quotation.event_date)})`}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Quotation Navigation */}
        {uniqueQuotations.length > 1 && selectedQuotationId && (
          <div className="mb-6">
            <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-4">
              <button
                onClick={goToPreviousQuotation}
                disabled={
                  uniqueQuotations.findIndex(
                    (q) => q.id === selectedQuotationId,
                  ) === 0
                }
                className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Cotización Anterior</span>
              </button>
              <span className="text-sm font-medium text-gray-700">
                Respuesta{" "}
                {uniqueQuotations.findIndex(
                  (q) => q.id === selectedQuotationId,
                ) + 1}{" "}
                de {uniqueQuotations.length}
              </span>
              <button
                onClick={goToNextQuotation}
                disabled={
                  uniqueQuotations.findIndex(
                    (q) => q.id === selectedQuotationId,
                  ) ===
                  uniqueQuotations.length - 1
                }
                className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <span>Cotización Siguiente</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Selected Quotation Info */}
        {selectedQuotationId && (
          <div className="mb-6">
            {(() => {
              const selectedQuotation = uniqueQuotations.find(
                (q: any) => q.id === selectedQuotationId,
              );
              return selectedQuotation ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center space-x-3">
                    <div className="bg-blue-100 p-2 rounded-lg">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-blue-900">
                          Cotización {selectedQuotation.quotation_number}
                        </h4>
                        <button
                          onClick={() =>
                            navigateToQuotation(selectedQuotation.id)
                          }
                          className="flex items-center space-x-1 px-3 py-1 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
                          title="Ver detalles de la cotización"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>Ver Cotización</span>
                        </button>
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-blue-700">
                        {selectedQuotation.clients?.name && (
                          <div className="flex items-center space-x-1">
                            <User className="h-4 w-4" />
                            <span>{selectedQuotation.clients.name}</span>
                          </div>
                        )}
                        {selectedQuotation.event_date && (
                          <div className="flex items-center space-x-1">
                            <Calendar className="h-4 w-4" />
                            <span>
                              {formatISOUTCDateToString(
                                selectedQuotation.event_date,
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null;
            })()}
          </div>
        )}

        {/* Answers Display */}
        {selectedQuotationId && selectedResponses.length > 0 && (
          <div className="space-y-4">
            {selectedResponses.map((response, responseIndex) => (
              <div
                key={response.id}
                className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
                  <div className="flex items-center space-x-3">
                    <div className="bg-blue-100 p-2 rounded-lg">
                      <FileText className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Respuesta {responseIndex + 1}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {formatISOUTCDateToString(response.created_at)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {response.answers.map((answer: any, answerIndex: number) => {
                    const question = getQuestionById(answer.id);
                    const getQuestionTypeLabel = (type: string) => {
                      if (type === "number") return "Escala numérica";
                      if (type === "boolean") return "Sí/No";
                      if (type === "text") return "Texto libre";
                      return "Desconocido";
                    };

                    return question ? (
                      <div
                        key={`answer-${response.id}-${answer.id}`}
                        className="border-l-4 border-blue-300 pl-4 bg-gradient-to-r from-blue-50/30 to-transparent rounded-r-lg p-3"
                      >
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-sm font-medium text-gray-500">
                            Pregunta{" "}
                            {(template?.questions.findIndex(
                              (q: any) => q.id === question.id,
                            ) ?? -1) + 1}
                          </span>
                          <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">
                            {getQuestionTypeLabel(question.type)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-900 mb-3 font-semibold leading-relaxed">
                          {question.question}
                        </p>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 shadow-sm">
                          <p className="text-sm text-blue-900">
                            <span className="font-semibold text-blue-800">
                              Respuesta:
                            </span>{" "}
                            <span className="font-medium">{answer.answer}</span>
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={`missing-question-${response.id}-${answer.id}`}
                        className="border-l-4 border-red-200 pl-4"
                      >
                        <div className="bg-red-50 rounded-lg p-3">
                          <p className="text-sm text-red-800">
                            <span className="font-medium">
                              Pregunta no encontrada (ID: {answer.id}):
                            </span>{" "}
                            {answer.answer}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No Responses State */}
        {selectedQuotationId && selectedResponses.length === 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
            <div className="text-center py-8">
              <div className="text-gray-400 mb-2">
                <FileText className="h-12 w-12 mx-auto" />
              </div>
              <p className="text-gray-500">
                No hay respuestas disponibles para esta cotización
              </p>
            </div>
          </div>
        )}

        {/* No Selection State */}
        {!selectedQuotationId && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
            <div className="text-center py-8">
              <div className="text-gray-400 mb-2">
                <FileText className="h-12 w-12 mx-auto" />
              </div>
              <p className="text-gray-500">
                Selecciona una cotización para ver las respuestas
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
