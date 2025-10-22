import { PartialType } from '@nestjs/mapped-types';
import { CreateCustomerSatisfactionSurveyDto } from './create-customer_satisfaction_survey.dto';

export class UpdateCustomerSatisfactionSurveyDto extends PartialType(
  CreateCustomerSatisfactionSurveyDto,
) {}
