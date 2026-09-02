import { CUSTOMER_SATISFACTION_SURVEY_QUESTIONS } from 'src/customer_satisfaction_survey/constants/questions';
import { correoInternoTemplate, EmailBranding } from '../brandLayout';
import { NewAnswerCustomerSatisfactionSurveyParams } from './types';

// Las respuestas las escribe el cliente: se neutralizan < y > para que
// no viajen como HTML.
const limpio = (texto: string): string =>
  String(texto).replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Aviso INTERNO al administrador: un cliente respondió la encuesta de
 * satisfacción. Con la cabecera de marca de la casa desde el 02-09.
 */
export const newAnswerCustomerSatisfactionSurveyTemplate = (
  params: NewAnswerCustomerSatisfactionSurveyParams,
  branding?: EmailBranding,
): string => {
  const respuestas = params.answers
    .map((answer) => {
      const question = CUSTOMER_SATISFACTION_SURVEY_QUESTIONS.find(
        (q) => q.id === answer.id,
      );
      return `
        <div style="margin:10px 0;padding:12px;background:#ffffff;border:1px solid #e5e7eb;border-left:4px solid #3b82f6;border-radius:6px;">
          <div style="font-weight:600;color:#1f2937;font-size:14px;margin-bottom:6px;">${limpio(question?.question || `Pregunta ${answer.id}`)}</div>
          <div style="color:#4b5563;font-size:14px;">${limpio(answer.answer)}</div>
        </div>`;
    })
    .join('');
  const bodyHtml = `
    <p style="margin:0 0 12px;">Un cliente respondió la encuesta de
    satisfacción. Sus respuestas:</p>
    ${respuestas}`;
  return correoInternoTemplate({
    branding,
    titulo: 'Encuesta respondida',
    bodyHtml,
    cta: {
      text: 'Ver respuestas',
      link: 'https://www.eventi-app.com/customer-satisfaction-survey/answers',
    },
  });
};
