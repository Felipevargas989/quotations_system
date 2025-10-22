import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { CUSTOMER_SATISFACTION_SURVEY_QUESTIONS } from './constants/questions';
import { CreateAnswerDto } from './dto/create-answer.dto';
import { CustomerSatisfactionSurveyRepository } from './repository';

@Injectable()
export class CustomerSatisfactionSurveyService {
  constructor(
    private readonly customerSatisfactionSurveyRepository: CustomerSatisfactionSurveyRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CustomerSatisfactionSurveyService.name);
  }

  async createTemplate(companyId: Company['id']) {
    this.logger.info(`createTemplate with companyId ${companyId}`);

    try {
      const result =
        await this.customerSatisfactionSurveyRepository.createTemplate(
          companyId,
          CUSTOMER_SATISFACTION_SURVEY_QUESTIONS,
        );

      if (result.error) {
        this.logger.error(`Error creating template: ${result.error.message}`);
        throw new Error(`Failed to create template: ${result.error.message}`);
      }

      this.logger.info(
        `Template created successfully for company ${companyId}`,
      );
      return result.data;
    } catch (error) {
      this.logger.error(`Error in createTemplate: ${(error as Error).message}`);
      throw error;
    }
  }

  async createAnswer(createAnswerDto: CreateAnswerDto) {
    this.logger.info(
      `createAnswer with createAnswerDto ${JSON.stringify(createAnswerDto)}`,
    );

    try {
      const result =
        await this.customerSatisfactionSurveyRepository.createAnswer(
          createAnswerDto,
        );

      if (result.error) {
        this.logger.error(`Error creating answer: ${result.error.message}`);
        throw new Error(`Failed to create answer: ${result.error.message}`);
      }

      this.logger.info(
        `Answer created successfully for quotation ${createAnswerDto.quotationId}`,
      );
      return result.data;
    } catch (error) {
      this.logger.error(`Error in createAnswer: ${(error as Error).message}`);
      throw error;
    }
  }

  // create() {
  //   return 'This action adds a new customerSatisfactionSurvey';
  // }

  // findAll() {
  //   return `This action returns all customerSatisfactionSurvey`;
  // }

  // findOne(id: number) {
  //   return `This action returns a #${id} customerSatisfactionSurvey`;
  // }

  // update(id: number) {
  //   return `This action updates a #${id} customerSatisfactionSurvey`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} customerSatisfactionSurvey`;
  // }
}
