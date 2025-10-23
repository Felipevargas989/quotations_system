import { CUSTOMER_SATISFACTION_SURVEY_QUESTIONS } from 'src/customer_satisfaction_survey/constants/questions';
import { baseLayoutTemplate } from '../baseLayout';
import { NewAnswerCustomerSatisfactionSurveyParams } from './types';

/**
 * Email template for notifying company admin when a customer satisfaction survey answer is submitted
 * @param params - Survey answer details
 * @returns HTML string for the email
 */
export const newAnswerCustomerSatisfactionSurveyTemplate = (
  params: NewAnswerCustomerSatisfactionSurveyParams,
): string => {
  // Build the email content
  const emailContent = `
    <style>
      .greeting {
        font-size: 18px;
        color: #374151;
        margin: 0 0 20px 0;
      }
      .intro-text {
        font-size: 16px;
        color: #4b5563;
        line-height: 1.6;
        margin: 0 0 20px 0;
      }
      .answers-list {
        margin: 20px 0;
        padding: 15px;
        background-color: #f8fafc;
        border-radius: 6px;
        border: 1px solid #e2e8f0;
      }
      .answer-item {
        margin: 15px 0;
        padding: 15px;
        background-color: white;
        border-radius: 6px;
        border-left: 4px solid #3b82f6;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      }
      .question {
        font-weight: 600;
        color: #1f2937;
        margin-bottom: 8px;
        font-size: 15px;
      }
      .answer {
        color: #4b5563;
        font-size: 14px;
        padding-left: 10px;
        border-left: 2px solid #e5e7eb;
        margin-left: 10px;
      }
      .highlight {
        font-weight: 600;
        color: #1f2937;
      }
      .summary {
        font-size: 14px;
        color: #6b7280;
        text-align: center;
        margin: 20px 0;
        padding: 15px;
        background-color: #f3f4f6;
        border-radius: 6px;
      }
    </style>

    <p class="greeting">Hola,</p>

    <p class="intro-text">
      Te informamos que se ha recibido una nueva respuesta de la encuesta de satisfacción del cliente.
    </p>

    <div class="answers-list">
      <strong>📝 Respuestas del cliente:</strong>
      ${params.answers
        .map((answer) => {
          const question = CUSTOMER_SATISFACTION_SURVEY_QUESTIONS.find(
            (q) => q.id === answer.id,
          );
          return `
          <div class="answer-item">
            <div class="question">${question?.question || `Pregunta ${answer.id}`}</div>
            <div class="answer">${answer.answer}</div>
          </div>
        `;
        })
        .join('')}
    </div>

    <p class="intro-text">
      Te recomendamos revisar estas respuestas y considerar cualquier sugerencia o comentario para mejorar tu servicio.
    </p>
  `;

  // Use the base layout without CTA button since this is just a notification
  return baseLayoutTemplate({
    content: emailContent,
  });
};
