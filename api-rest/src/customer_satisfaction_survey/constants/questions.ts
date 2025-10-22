import { Question } from '../entities/customer_satisfaction_survey_template.entity';

export const CUSTOMER_SATISFACTION_SURVEY_QUESTIONS: Question[] = [
  {
    id: 1,
    question:
      '¿Qué tan satisfecho/a estás con la organización general del evento?',
    type: 'number',
    options: [1, 2, 3, 4, 5],
  },
  {
    id: 2,
    question: '¿Cómo evaluarías la atención del personal durante el evento?',
    type: 'number',
    options: [1, 2, 3, 4, 5],
  },
  {
    id: 3,
    question:
      '¿Qué te pareció la calidad de la comida / servicio principal? (Si es que aplica)',
    type: 'number',
    options: [1, 2, 3, 4, 5],
  },
  {
    id: 4,
    question: '¿Recomendarías nuestros servicios a otras personas o empresas?',
    type: 'boolean',
  },
  {
    id: 5,
    question:
      '¿Hay algo que te gustaría felicitarnos, sugerir o que crees que podríamos mejorar?',
    type: 'text',
  },
];
