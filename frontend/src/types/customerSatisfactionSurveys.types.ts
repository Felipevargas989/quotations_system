import { Client } from "./clients.types";
import { Quotation } from "./quotations.types";

export interface Question {
  id: number;
  question: string;
  type: "text" | "number" | "boolean";
  options?: (string | number)[];
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

export type CustomerSatisfactionSurveyResponse = {
  id: number;
  created_at: Date;
  quotation_id: Quotation["id"];
  template_id: string;
  answers: Answer[];
  quotations: Pick<
    Quotation,
    "id" | "quotation_number" | "event_date" | "event_type" | "company_id"
  > & { clients: Pick<Client, "name"> };
  templates: SurveyTemplate;
};
