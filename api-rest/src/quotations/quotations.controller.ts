import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser, Public } from 'src/auth';
import { OPERATIONS_AND_UP, Roles } from 'src/auth/roles.decorator';
import { Company } from 'src/companies/entities/company.entity';
import type { User } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/entities/user.entity';
import { logSafe } from '../logging/log-safe';
import { RequestType } from './constants/constants';
import { CheckConflictsWithExistingQuotationsDto } from './dto/check-conflicts-with-existing-quotations.dto';
import { CreateQuotationPublicDto } from './dto/create-quotation-public.dto';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { GetQuotationsDto } from './dto/get-quotations.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { QuotationsService } from './quotations.service';

@Controller('quotations')
export class QuotationsController {
  constructor(
    private readonly quotationsService: QuotationsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(QuotationsController.name);
  }

  @Post()
  create(
    @Body() createQuotationDto: CreateQuotationDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /quotations with createQuotationDto ${logSafe(createQuotationDto)}`,
    );
    // Regla de Felipe (28-07): recepción crea REQUERIMIENTOS, no
    // cotizaciones formales. Mismo endpoint para ambos (los usa la
    // misma tabla), así que la distinción es por el tipo de solicitud.
    if (
      (user as User & { role?: string }).role === UserRole.RECEPCION &&
      createQuotationDto.request_type !== RequestType.REQUERIMIENTO
    ) {
      throw new ForbiddenException(
        'Recepción puede registrar requerimientos, no crear cotizaciones.',
      );
    }
    return this.quotationsService.create(
      createQuotationDto,
      user.company_id,
      user.id,
    );
  }

  // Techo estricto: acceso público de escritura (Fase 3).
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Public()
  @Post('public/:company_id')
  createPublic(
    @Body() createQuotationPublicDto: CreateQuotationPublicDto,
    @Param('company_id') company_id: Company['id'],
  ) {
    this.logger.info(
      `POST /quotations with createQuotationDto ${logSafe(createQuotationPublicDto)}`,
    );
    return this.quotationsService.createPublic(
      createQuotationPublicDto,
      company_id,
    );
  }

  @Get()
  findAll(
    @CurrentUser() user: User,
    @Query() getQuotationsDto: GetQuotationsDto,
  ) {
    this.logger.info(
      `GET /quotations with user ${user.id} with params ${JSON.stringify(getQuotationsDto)}`,
    );
    return this.quotationsService.findAll({
      companyId: user.company_id,
      request_type: getQuotationsDto.request_type,
      statuses: getQuotationsDto.statuses,
      sort_by: getQuotationsDto.sort_by,
      sort_order: getQuotationsDto.sort_order,
    });
  }

  @Get('check-conflicts')
  checkConflictsWithExistingQuotations(
    @Query()
    params: CheckConflictsWithExistingQuotationsDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `GET /quotations/check-conflicts with params ${JSON.stringify(params)}`,
    );
    return this.quotationsService.checkConflictsWithExistingQuotations(
      params,
      user.company_id,
    );
  }

  // This is public becaue it is used to display the quotation details in the public customer satisfaction survey
  // TODO: maybe create public endpoint for this, instead of using the current one
  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    this.logger.info(`GET /quotations/${id}`);
    return this.quotationsService.findOne(id);
  }

  // Declara el evento REALIZADO y dispara la encuesta de satisfacción al
  // cliente (una sola vez; ver QuotationsService.markEventDone).
  @Roles(...OPERATIONS_AND_UP)
  @Post(':id/realizado')
  markEventDone(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`POST /quotations/${id}/realizado`);
    return this.quotationsService.markEventDone(id, user.company_id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateQuotationDto: UpdateQuotationDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `PATCH /quotations/${id} with updateQuotationDto ${JSON.stringify(updateQuotationDto)}`,
    );
    return this.quotationsService.update(
      id,
      updateQuotationDto,
      user.company_id,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.quotationsService.remove(id, user.company_id);
  }
}
