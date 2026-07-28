import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser, Public } from 'src/auth';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { logSafe } from '../logging/log-safe';
import { CreateAnswerDto } from './dto/create-answer.dto';
import { CustomerSatisfactionSurveyService } from './service';

@Controller('customer-satisfaction-survey')
export class CustomerSatisfactionSurveyController {
  constructor(
    private readonly customerSatisfactionSurveyService: CustomerSatisfactionSurveyService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CustomerSatisfactionSurveyController.name);
  }

  // Cerrado el 28-07 (Fase 3, cabos sueltos): esta puerta era @Public
  // y NADIE del frontend la llama (medido con grep) — era una escritura
  // abierta a internet sin uso. Ahora exige sesión de administrador.
  @Roles(...ADMIN_ONLY)
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
