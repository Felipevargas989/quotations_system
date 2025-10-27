import { useState, useEffect } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { findAllAnswersFromCompany } from "../../../services/customerSatisfactionSurveys.service";
import {
  CustomerSatisfactionSurveyResponse,
  SurveyTemplate,
} from "../../../types/customerSatisfactionSurveys.types";
import { ChevronDown, FileText, Calendar, User } from "lucide-react";
import { formatISOUTCDateToString } from "../../../utils/dates";

interface AnswersByQuotationProps {
  readonly template: SurveyTemplate;
}

export default function AnswersByQuotation({
  template,
}: AnswersByQuotationProps) {
  const { company } = useAuth();
  const [selectedQuotationId, setSelectedQuotationId] = useState<string>("");
  const [surveyResponses, setSurveyResponses] = useState<
    CustomerSatisfactionSurveyResponse[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (company?.id) {
      fetchSurveyResponses();
    }
  }, [company?.id]);

  const fetchSurveyResponses = async () => {
    if (!company?.id) return;

    try {
      setLoading(true);
      setError(null);
      const responses = await findAllAnswersFromCompany();
      setSurveyResponses(responses);
    } catch (err) {
      console.error("Error fetching survey responses:", err);
      setError("Error al cargar las respuestas de la encuesta");
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
    return template.questions.find((q: any) => q.id === questionId);
  };

  const selectedResponses = getSelectedQuotationResponses();
  const uniqueQuotations = getUniqueQuotations();

  return (
    <div className="mt-8 border-t border-gray-200 pt-6">
      <div className="flex items-center space-x-2 mb-4">
        <FileText className="h-5 w-5 text-gray-600" />
        <h3 className="text-lg font-semibold text-gray-900">
          Respuestas por Cotización
        </h3>
      </div>

      {/* Quotation Selector */}
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
                {quotation.quotation_number} - {quotation.client_name}
                {quotation.event_date &&
                  ` (${formatISOUTCDateToString(quotation.event_date)})`}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center space-x-2">
            <div className="bg-red-100 p-1 rounded">
              <FileText className="h-4 w-4 text-red-600" />
            </div>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="space-y-3">
              <div className="h-3 bg-gray-200 rounded"></div>
              <div className="h-3 bg-gray-200 rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        </div>
      )}

      {/* Selected Quotation Info */}
      {selectedQuotationId && !loading && (
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
                    <h4 className="font-semibold text-blue-900">
                      Cotización {selectedQuotation.quotation_number}
                    </h4>
                    <div className="flex items-center space-x-4 text-sm text-blue-700">
                      {selectedQuotation.client_name && (
                        <div className="flex items-center space-x-1">
                          <User className="h-4 w-4" />
                          <span>{selectedQuotation.client_name}</span>
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
      {selectedQuotationId && selectedResponses.length > 0 && !loading && (
        <div className="space-y-4">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <FileText className="h-4 w-4" />
            <span>{selectedResponses.length} respuesta(s) encontrada(s)</span>
          </div>

          {selectedResponses.map((response, responseIndex) => (
            <div
              key={response.id}
              className="bg-white border border-gray-200 rounded-lg p-6"
            >
              <div className="flex items-center space-x-2 mb-4">
                <span className="text-sm font-medium text-gray-500">
                  Respuesta {responseIndex + 1}
                </span>
                <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                  {formatISOUTCDateToString(response.created_at)}
                </span>
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
                      className="border-l-4 border-blue-200 pl-4"
                    >
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="text-sm font-medium text-gray-500">
                          Pregunta{" "}
                          {template.questions.findIndex(
                            (q: any) => q.id === question.id,
                          ) + 1}
                        </span>
                        <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">
                          {getQuestionTypeLabel(question.type)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-900 mb-2 font-medium">
                        {question.question}
                      </p>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-sm text-gray-800">
                          <span className="font-medium">Respuesta:</span>{" "}
                          {answer.answer}
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
      {selectedQuotationId && selectedResponses.length === 0 && !loading && (
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
      {!selectedQuotationId && !loading && (
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
  );
}
