import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  SurveyTemplate,
  Answer,
  CreateAnswerDto,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!quotationId) {
      setError("Se requiere el ID de la cotización");
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
            {template.questions.map((question, index) => (
              <div key={question.id} className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  {index + 1}. {question.question}
                </label>
                <textarea
                  value={
                    answers.find((ans) => ans.id === question.id)?.answer || ""
                  }
                  onChange={(e) =>
                    handleAnswerChange(question.id, e.target.value)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="Por favor, comparte tus pensamientos..."
                  required
                />
              </div>
            ))}

            <div className="pt-6">
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Enviando..." : "Enviar Encuesta"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
