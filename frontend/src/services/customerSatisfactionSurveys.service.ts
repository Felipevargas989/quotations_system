import { API_ROUTES } from "../constants/api.routes";
import {
  CreateAnswerDto,
  SurveyTemplate,
} from "../types/customerSatisfactionSurveys.types";
import { apiRequest } from "./api";

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
