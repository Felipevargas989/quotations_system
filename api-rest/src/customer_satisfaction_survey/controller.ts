import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser, Public } from 'src/auth';
import type { User } from 'src/users/entities/user.entity';
import { CreateAnswerDto } from './dto/create-answer.dto';
import { CustomerSatisfactionSurveyService } from './service';
import { Throttle } from '@nestjs/throttler';
import { logSafe } from '../logging/log-safe';

@Controller('customer-satisfaction-survey')
export class CustomerSatisfactionSurveyController {
  constructor(
    private readonly customerSatisfactionSurveyService: CustomerSatisfactionSurveyService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CustomerSatisfactionSurveyController.name);
  }

  // Techo estricto: acceso público de escritura (Fase 3).
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Public()
  @Post('template')
  createTemplate(@Query('companyId') companyId: number) {
    this.logger.info(
      `POST /customer-satisfaction-survey/template with companyId ${companyId}`,
    );
    return this.customerSatisfactionSurveyService.createTemplate(companyId);
  }

  @Public()
  @Get('template')
  getTemplate(@Query('companyId') companyId: number) {
    this.logger.info(
      `GET /customer-satisfaction-survey/template with companyId ${companyId}`,
    );
    return this.customerSatisfactionSurveyService.getTemplate(companyId);
  }

  // Techo estricto: acceso público de escritura (Fase 3).
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Public()
  @Post('answer')
  createAnswer(@Body() createAnswerDto: CreateAnswerDto) {
    this.logger.info(
      `POST /customer-satisfaction-survey/answer with createAnswerDto ${logSafe(createAnswerDto)}`,
    );
    return this.customerSatisfactionSurveyService.createAnswer(createAnswerDto);
  }

  @Get('answers')
  findAllAnswersFromCompany(@CurrentUser() user: User) {
    this.logger.info(`GET /customer-satisfaction-survey with user ${user.id}`);
    return this.customerSatisfactionSurveyService.findAllAnswersFromCompany(
      user.company_id,
    );
  }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.customerSatisfactionSurveyService.findOne(+id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string) {
  //   return this.customerSatisfactionSurveyService.update(+id);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.customerSatisfactionSurveyService.remove(+id);
  // }
}
