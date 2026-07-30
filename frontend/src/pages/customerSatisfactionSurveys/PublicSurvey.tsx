import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  SurveyTemplate,
  Answer,
  CreateAnswerDto,
  Question,
} from "../../types/customerSatisfactionSurveys.types";
import {
  getTemplate,
  createAnswer,
} from "../../services/customerSatisfactionSurveys.service";
import { getQuotationById } from "../../services/quotations.service";
import { Quotation } from "../../types/quotations.types";
import { getCompanyById } from "../../services/superAdmin.service";
import { Company } from "../../types/companies.types";

export default function CustomerSatisfactionSurveyPublicPage() {
  const [template, setTemplate] = useState<SurveyTemplate | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { companyId, quotationId } = useParams();

  useEffect(() => {
    const fetchData = async () => {
      if (!companyId) {
        setError("Se requiere el ID de la empresa");
        setLoading(false);
        return;
      }

      if (!quotationId) {
        setError("Se requiere el ID de la cotización");
        setLoading(false);
        return;
      }

      try {
        // Fetch template and quotation data in parallel
        const [templateData, quotationData, companyData] = await Promise.all([
          getTemplate(Number.parseInt(companyId)),
          getQuotationById(quotationId),
          getCompanyById(Number.parseInt(companyId)),
        ]);

        if (templateData) {
          setTemplate(templateData);
          // Initialize answers array
          const initialAnswers = templateData.questions.map((question) => ({
            id: question.id,
            answer: "",
          }));
          setAnswers(initialAnswers);
        }

        if (quotationData.data) {
          setQuotation(quotationData.data);
        }
        if (companyData.data) {
          setCompany(companyData.data[0]);
        }
      } catch (err) {
        setError("Error al cargar los datos de la encuesta");
        console.error("Error fetching data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [companyId, quotationId]);

  const handleAnswerChange = (questionId: number, answer: string) => {
    setAnswers((prev) =>
      prev.map((ans) => (ans.id === questionId ? { ...ans, answer } : ans)),
    );
  };

  // Check if all required questions are answered
  const isFormValid = () => {
    if (!template) return false;

    // All questions except the last one (text type) are mandatory
    const requiredQuestions = template.questions.slice(0, -1);

    return requiredQuestions.every((question: Question) => {
      const answer = answers.find((ans) => ans.id === question.id);
      return answer && answer.answer.trim() !== "";
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!quotationId) {
      setError("Se requiere el ID de la cotización");
      return;
    }

    if (!isFormValid()) {
      setError(
        "Por favor, responde todas las preguntas obligatorias antes de enviar.",
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const createAnswerDto: CreateAnswerDto = {
        quotationId,
        answers: answers.filter((answer) => answer.answer.trim() !== ""),
      };

      await createAnswer(createAnswerDto);
      setSubmitted(true);
    } catch (err) {
      setError("Error al enviar la encuesta. Por favor, inténtalo de nuevo.");
      console.error("Error submitting survey:", err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando encuesta...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-green-500 text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">¡Gracias!</h1>
          <p className="text-gray-600">
            Tu feedback ha sido enviado exitosamente. ¡Apreciamos tu tiempo!
          </p>
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No se encontró plantilla de encuesta.</p>
        </div>
      </div>
    );
  }

  // Get company colors or use defaults
  const primaryColor = company?.colors?.primary || "#3b82f6";
  const secondaryColor = company?.colors?.secondary || "#1e40af";
  const companyName = company?.name || "Nuestra Empresa";

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-8">
          {/* Company Header */}
          <div className="text-center mb-8">
            {/* Company Logo */}
            {company?.logo_url && (
              <div className="mb-6">
                <img
                  src={company.logo_url}
                  alt={`${companyName} logo`}
                  className="h-16 w-auto mx-auto object-contain"
                />
              </div>
            )}

            {/* Company Name */}
            <h1
              className="text-3xl font-bold mb-2"
              style={{ color: primaryColor }}
            >
              {companyName}
            </h1>

            {/* Survey Title */}
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              Encuesta de Satisfacción del Cliente
            </h2>

            {/* Event Information */}
            {quotation && (
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">
                      Cotización:
                    </span>
                    <p className="text-gray-900">
                      N° {quotation.quotation_number}
                    </p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">
                      Tipo de Evento:
                    </span>
                    <p className="text-gray-900">{quotation.event_type}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">
                      Fecha del Evento:
                    </span>
                    <p className="text-gray-900">
                      {new Date(quotation.event_date).toLocaleDateString(
                        "es-ES",
                        {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        },
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <p className="text-gray-600">
              ¡Valoramos tu opinión! Por favor, tómate unos minutos para
              compartir tu experiencia.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {template.questions.map((question: Question, index: number) => {
              const isLastQuestion = index === template.questions.length - 1;
              const isRequired = !isLastQuestion;

              return (
                <div key={question.id} className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    {index + 1}. {question.question}
                    {isRequired && <span className="text-red-500 ml-1">*</span>}
                  </label>

                  {/* Text Questions */}
                  {question.type === "text" && (
                    <textarea
                      value={
                        answers.find((ans) => ans.id === question.id)?.answer ||
                        ""
                      }
                      onChange={(e) =>
                        handleAnswerChange(question.id, e.target.value)
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      rows={3}
                      placeholder="Por favor, comparte tus pensamientos..."
                    />
                  )}

                  {/* Number Questions (Rating Scale) */}
                  {question.type === "number" && question.options && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center mt-4">
                        {question.options.map(
                          (option: string | number, optionIndex: number) => (
                            <label
                              key={option}
                              className="flex flex-col items-center cursor-pointer"
                            >
                              <input
                                type="radio"
                                name={`question-${question.id}`}
                                value={option}
                                checked={
                                  answers.find((ans) => ans.id === question.id)
                                    ?.answer === String(option)
                                }
                                onChange={(e) =>
                                  handleAnswerChange(
                                    question.id,
                                    e.target.value,
                                  )
                                }
                                className="sr-only"
                              />
                              <div
                                className={`w-12 h-12 rounded-full border-2 flex items-center justify-center text-sm font-medium transition-colors ${
                                  answers.find((ans) => ans.id === question.id)
                                    ?.answer === String(option)
                                    ? "text-white"
                                    : "border-gray-300 hover:border-gray-400"
                                }`}
                                style={{
                                  backgroundColor:
                                    answers.find(
                                      (ans) => ans.id === question.id,
                                    )?.answer === String(option)
                                      ? primaryColor
                                      : "transparent",
                                  borderColor:
                                    answers.find(
                                      (ans) => ans.id === question.id,
                                    )?.answer === String(option)
                                      ? primaryColor
                                      : undefined,
                                }}
                              >
                                {option}
                              </div>
                              <span className="text-xs text-gray-500 mt-1">
                                {optionIndex === 0 && "Muy mal"}
                                {optionIndex === 1 && "Mal"}
                                {optionIndex === 2 && "Regular"}
                                {optionIndex === 3 && "Bien"}
                                {optionIndex === 4 && "Muy bien"}
                              </span>
                            </label>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  {/* Boolean Questions (Yes/No) */}
                  {question.type === "boolean" && (
                    <div className="flex space-x-4">
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="radio"
                          name={`question-${question.id}`}
                          value="true"
                          checked={
                            answers.find((ans) => ans.id === question.id)
                              ?.answer === "true"
                          }
                          onChange={(e) =>
                            handleAnswerChange(question.id, e.target.value)
                          }
                          className="sr-only"
                        />
                        <div
                          className={`px-4 py-2 rounded-md border-2 transition-colors ${
                            answers.find((ans) => ans.id === question.id)
                              ?.answer === "true"
                              ? "text-white"
                              : "border-gray-300 hover:border-gray-400"
                          }`}
                          style={{
                            backgroundColor:
                              answers.find((ans) => ans.id === question.id)
                                ?.answer === "true"
                                ? primaryColor
                                : "transparent",
                            borderColor:
                              answers.find((ans) => ans.id === question.id)
                                ?.answer === "true"
                                ? primaryColor
                                : undefined,
                          }}
                        >
                          Sí
                        </div>
                      </label>
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="radio"
                          name={`question-${question.id}`}
                          value="false"
                          checked={
                            answers.find((ans) => ans.id === question.id)
                              ?.answer === "false"
                          }
                          onChange={(e) =>
                            handleAnswerChange(question.id, e.target.value)
                          }
                          className="sr-only"
                        />
                        <div
                          className={`px-4 py-2 rounded-md border-2 transition-colors ${
                            answers.find((ans) => ans.id === question.id)
                              ?.answer === "false"
                              ? "text-white"
                              : "border-gray-300 hover:border-gray-400"
                          }`}
                          style={{
                            backgroundColor:
                              answers.find((ans) => ans.id === question.id)
                                ?.answer === "false"
                                ? secondaryColor
                                : "transparent",
                            borderColor:
                              answers.find((ans) => ans.id === question.id)
                                ?.answer === "false"
                                ? secondaryColor
                                : undefined,
                          }}
                        >
                          No
                        </div>
                      </label>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="pt-6">
              <button
                type="submit"
                disabled={submitting || !isFormValid()}
                className="w-full text-white py-3 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={
                  {
                    backgroundColor: primaryColor,
                    "--hover-color": secondaryColor,
                  } as React.CSSProperties
                }
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = secondaryColor;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = primaryColor;
                }}
              >
                {submitting ? "Enviando..." : "Enviar Encuesta"}
              </button>
              {!isFormValid() && (
                <p className="text-sm text-gray-500 mt-2 text-center">
                  Responde todas las preguntas obligatorias para habilitar el
                  envío
                </p>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
