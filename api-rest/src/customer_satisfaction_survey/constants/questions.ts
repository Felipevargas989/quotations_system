import { Question } from '../entities/customer_satisfaction_survey_template.entity';

export const CUSTOMER_SATISFACTION_SURVEY_QUESTIONS: Question[] = [
  {
    id: 1,
    question: 'How would you rate your overall satisfaction with our service?',
    type: 'text',
  },
  {
    id: 2,
    question: 'How likely are you to recommend our service to others?',
    type: 'text',
  },
  {
    id: 3,
    question: 'What aspects of our service did you find most valuable?',
    type: 'text',
  },
  {
    id: 4,
    question: 'Is there anything we could improve about our service?',
    type: 'text',
  },
  {
    id: 5,
    question: 'How would you describe your experience working with our team?',
    type: 'text',
  },
];
