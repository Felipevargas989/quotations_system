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

export default function CustomerSatisfactionSurveysPage() {
  const [template, setTemplate] = useState<SurveyTemplate | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { companyId, quotationId } = useParams();

  useEffect(() => {
    const fetchTemplate = async () => {
      if (!companyId) {
        setError("Se requiere el ID de la empresa");
        setLoading(false);
        return;
      }

      try {
        const templateData = await getTemplate(parseInt(companyId!));
        setTemplate(templateData);

        // Initialize answers array
        const initialAnswers = templateData.questions.map((question) => ({
          id: question.id,
          answer: "",
        }));
        setAnswers(initialAnswers);
      } catch (err) {
        setError("Error al cargar la plantilla de la encuesta");
        console.error("Error fetching template:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTemplate();
  }, [companyId]);

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
        quotationId: quotationId!,
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

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Encuesta de Satisfacción del Cliente
            </h1>
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
                                    ? "bg-blue-600 border-blue-600 text-white"
                                    : "border-gray-300 hover:border-blue-400"
                                }`}
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
                              ? "bg-green-600 border-green-600 text-white"
                              : "border-gray-300 hover:border-green-400"
                          }`}
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
                              ? "bg-red-600 border-red-600 text-white"
                              : "border-gray-300 hover:border-red-400"
                          }`}
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
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
