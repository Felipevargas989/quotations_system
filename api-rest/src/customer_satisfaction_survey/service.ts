import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { EmailService } from 'src/email/email.service';
import { EmailStructure } from 'src/email/types';
import { QuotationsService } from 'src/quotations/quotations.service';
import { UserRole } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { logSafe } from '../logging/log-safe';
import { CUSTOMER_SATISFACTION_SURVEY_QUESTIONS } from './constants/questions';
import { CreateAnswerDto } from './dto/create-answer.dto';
import { CustomerSatisfactionSurveyRepository } from './repository';

@Injectable()
export class CustomerSatisfactionSurveyService {
  constructor(
    private readonly customerSatisfactionSurveyRepository: CustomerSatisfactionSurveyRepository,
    private readonly quotationsService: QuotationsService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
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
      `createAnswer with createAnswerDto ${logSafe(createAnswerDto)}`,
    );

    try {
      // get quotation to get the company id
      const { data: quotationResult, error: quotationError } =
        await this.quotationsService.findOne(createAnswerDto.quotationId);

      if (quotationError) {
        this.logger.error(`Error getting quotation: ${quotationError.message}`);
        throw new Error(`Failed to get quotation: ${quotationError.message}`);
      }

      if (!quotationResult) {
        throw new Error(`Quotation not found`);
      }

      const companyId = quotationResult.company_id;

      // get template for the company
      const { data: templateResult, error: templateError } =
        await this.customerSatisfactionSurveyRepository.getTemplate(companyId);

      if (templateError) {
        this.logger.error(`Error getting template: ${templateError.message}`);
        throw new Error(`Failed to get template: ${templateError.message}`);
      }

      if (!templateResult) {
        throw new Error(`Template not found`);
      }

      const result =
        await this.customerSatisfactionSurveyRepository.createAnswer(
          quotationResult.id,
          templateResult.id,
          createAnswerDto.answers,
        );

      if (result.error) {
        this.logger.error(`Error creating answer: ${result.error.message}`);
        throw new Error(`Failed to create answer: ${result.error.message}`);
      }

      this.logger.info(
        `Answer created successfully for quotation ${createAnswerDto.quotationId}`,
      );

      // send email to the company admins
      try {
        // get company admins
        const companyAdmins = await this.usersService.findAll(
          companyId,
          UserRole.ADMINISTRADOR,
        );

        await this.emailService.sendEmail(
          companyAdmins.map((admin) => admin.email),
          EmailStructure.NEW_ANSWER_CUSTOMER_SATISFACTION_SURVEY,
          {
            templateId: templateResult.id,
            answers: createAnswerDto.answers,
          },
        );
      } catch (error) {
        this.logger.error(
          `Error getting company admins: ${(error as Error).message}`,
        );
        // throw new Error(`Failed to get company admins: ${(error as Error).message}`);
      }

      return result.data;
    } catch (error) {
      this.logger.error(`Error in createAnswer: ${(error as Error).message}`);
      throw error;
    }
  }

  async getTemplate(companyId: Company['id']) {
    this.logger.info(`getTemplate with companyId ${companyId}`);

    try {
      const result =
        await this.customerSatisfactionSurveyRepository.getTemplate(companyId);

      if (result.error) {
        this.logger.error(`Error getting template: ${result.error.message}`);
        throw new Error(`Failed to get template: ${result.error.message}`);
      }

      this.logger.info(
        `Template retrieved successfully for company ${companyId}`,
      );
      return result.data;
    } catch (error) {
      this.logger.error(`Error in getTemplate: ${(error as Error).message}`);
      throw error;
    }
  }

  async findAllAnswersFromCompany(companyId: Company['id']) {
    this.logger.info(`findAllAnswersFromCompany with companyId ${companyId}`);

    try {
      const result =
        await this.customerSatisfactionSurveyRepository.findAllAnswersFromCompany(
          companyId,
        );
      if (result.error) {
        this.logger.error(
          `Error in findAllAnswersFromCompany: ${result.error.message}`,
        );
        throw new Error(`Failed to find all: ${result.error.message}`);
      }

      return result.data;
    } catch (error) {
      this.logger.error(`Error in findAll: ${(error as Error).message}`);
      throw error;
    }
  }
}
