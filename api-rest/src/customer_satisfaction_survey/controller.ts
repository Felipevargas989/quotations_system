import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser, Public } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { logSafe } from '../logging/log-safe';
import { CreateAnswerDto } from './dto/create-answer.dto';
import { CustomerSatisfactionSurveyService } from './service';

// Las encuestas de satisfacción entran con Opera y Crece (paso 3.2,
// 14-09-2026). Las tres puertas @Public de más abajo las abre el
// cliente desde su correo: esas no pasan por el guardián y se revisan
// en el servicio, resolviendo la empresa desde la cotización.
@Derecho('encuestas')
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
  // Aislamiento entre empresas (11-09-2026): la empresa sale de la
  // SESIÓN, no del query. Antes, un administrador de cualquier empresa
  // podía sobrescribir el cuestionario de otra con solo cambiar el
  // ?companyId= de la dirección.
  @Roles(...ADMIN_ONLY)
  @Post('template')
  createTemplate(@CurrentUser() user: User) {
    this.logger.info(
      `POST /customer-satisfaction-survey/template with companyId ${user.company_id}`,
    );
    return this.customerSatisfactionSurveyService.createTemplate(
      user.company_id,
    );
  }

  @Public()
  @Get('template')
  getTemplate(@Query('companyId') companyId: number) {
    this.logger.info(
      `GET /customer-satisfaction-survey/template with companyId ${companyId}`,
    );
    return this.customerSatisfactionSurveyService.getTemplate(companyId);
  }

  // ¿Ya fue respondida? (público: la página de la encuesta lo consulta
  // al abrir para mostrar el agradecimiento en vez del formulario)
  @Public()
  @Get('answered')
  async answered(@Query('quotationId') quotationId: string) {
    return {
      answered:
        await this.customerSatisfactionSurveyService.hasAnswer(quotationId),
    };
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

  @Roles(...ADMIN_ONLY)
  @Get('answers')
  findAllAnswersFromCompany(@CurrentUser() user: User) {
    this.logger.info(`GET /customer-satisfaction-survey with user ${user.id}`);
    return this.customerSatisfactionSurveyService.findAllAnswersFromCompany(
      user.company_id,
    );
  }

  // @Roles(...ADMIN_ONLY)
  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.customerSatisfactionSurveyService.findOne(+id);
  // }

  // @Roles(...ADMIN_ONLY)
  // @Patch(':id')
  // update(@Param('id') id: string) {
  //   return this.customerSatisfactionSurveyService.update(+id);
  // }

  // @Roles(...ADMIN_ONLY)
  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.customerSatisfactionSurveyService.remove(+id);
  // }
}
