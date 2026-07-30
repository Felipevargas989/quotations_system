import { API_ROUTES } from "../constants/api.routes";
import {
  CreateAnswerDto,
  SurveyTemplate,
} from "../types/customerSatisfactionSurveys.types";
import { apiRequest } from "./api";

// Candado: ¿la encuesta de esta cotización ya fue respondida?
export const isSurveyAnswered = async (
  quotationId: string,
): Promise<boolean> => {
  try {
    const data = (await apiRequest(
      `${API_ROUTES.CUSTOMER_SATISFACTION_SURVEY}/answered`,
      "GET",
      undefined,
      { quotationId },
    )) as { answered?: boolean };
    return !!data?.answered;
  } catch {
    return false;
  }
};

export const getTemplate = async (
  companyId: number,
): Promise<SurveyTemplate> => {
  return apiRequest(
    API_ROUTES.CUSTOMER_SATISFACTION_SURVEY_TEMPLATE,
    "GET",
    undefined,
    { companyId },
  );
};

export const createAnswer = async (
  createAnswerDto: CreateAnswerDto,
): Promise<any> => {
  return apiRequest(
    API_ROUTES.CUSTOMER_SATISFACTION_SURVEY_ANSWER,
    "POST",
    createAnswerDto,
  );
};

export const findAllAnswersFromCompany = async (): Promise<any> => {
  return apiRequest(API_ROUTES.CUSTOMER_SATISFACTION_SURVEY_ANSWERS, "GET");
};
