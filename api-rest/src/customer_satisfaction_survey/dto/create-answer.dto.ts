import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CustomerSatisfactionSurveyResponse } from '../entities/customer_satisfaction_survey_response.entity';

class AnswerDto {
  @IsNumber()
  @IsNotEmpty()
  id: number;

  @IsNotEmpty()
  answer: string;
}

export class CreateAnswerDto {
  @IsString()
  @IsNotEmpty()
  quotationId: CustomerSatisfactionSurveyResponse['quotation_id'];

  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[];
}
