import {
  CreateAnswerDto,
  SurveyTemplate,
} from "../types/customerSatisfactionSurveys.types";
import { apiRequest } from "./api";

export const getTemplate = async (
  companyId: number,
): Promise<SurveyTemplate> => {
  return apiRequest(
    "/customer-satisfaction-survey/template",
    "GET",
    undefined,
    { companyId },
  );
};

export const createAnswer = async (
  createAnswerDto: CreateAnswerDto,
): Promise<any> => {
  return apiRequest(
    "/customer-satisfaction-survey/answer",
    "POST",
    createAnswerDto,
  );
};
