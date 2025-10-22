import { Injectable } from '@nestjs/common';
import { CreateCustomerSatisfactionSurveyDto } from './dto/create-customer_satisfaction_survey.dto';
import { UpdateCustomerSatisfactionSurveyDto } from './dto/update-customer_satisfaction_survey.dto';

@Injectable()
export class CustomerSatisfactionSurveyService {
  create(
    createCustomerSatisfactionSurveyDto: CreateCustomerSatisfactionSurveyDto,
  ) {
    return 'This action adds a new customerSatisfactionSurvey';
  }

  findAll() {
    return `This action returns all customerSatisfactionSurvey`;
  }

  findOne(id: number) {
    return `This action returns a #${id} customerSatisfactionSurvey`;
  }

  update(
    id: number,
    updateCustomerSatisfactionSurveyDto: UpdateCustomerSatisfactionSurveyDto,
  ) {
    return `This action updates a #${id} customerSatisfactionSurvey`;
  }

  remove(id: number) {
    return `This action removes a #${id} customerSatisfactionSurvey`;
  }
}
