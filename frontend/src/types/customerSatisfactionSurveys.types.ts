export interface Question {
  id: number;
  question: string;
  type: "text";
  options?: string[];
}

export interface SurveyTemplate {
  id: number;
  created_at: string;
  company_id: number;
  questions: Question[];
}

export interface Answer {
  id: number;
  answer: string;
}

export interface CreateAnswerDto {
  quotationId: string;
  answers: Answer[];
}
