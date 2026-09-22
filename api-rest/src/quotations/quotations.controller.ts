import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser, Public } from 'src/auth';
import { DerechosService } from 'src/auth/derechos.service';
import {
  ADMIN_ONLY,
  OPERATIONS_AND_UP,
  RECEPTION_AND_UP,
  Roles,
  SALES_AND_UP,
} from 'src/auth/roles.decorator';
import { Company } from 'src/companies/entities/company.entity';
import type { User } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/entities/user.entity';
import { logSafe } from '../logging/log-safe';
import { RequestType } from './constants/constants';
import { CheckConflictsWithExistingQuotationsDto } from './dto/check-conflicts-with-existing-quotations.dto';
import { CreateQuotationPublicDto } from './dto/create-quotation-public.dto';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { EstadoCosechaDto } from './dto/estado-cosecha.dto';
import { GetQuotationsDto } from './dto/get-quotations.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { EnvioCotizacionService } from './envio-cotizacion.service';
import { QuotationsService } from './quotations.service';
import { RescateDelFormularioService } from './rescate-del-formulario.service';

@Controller('quotations')
export class QuotationsController {
  constructor(
    private readonly quotationsService: QuotationsService,
    private readonly envioCotizacion: EnvioCotizacionService,
    private readonly logger: PinoLogger,
    // Para las puertas públicas, que no tienen sesión de dónde sacar los
    // derechos de la empresa (paso 3.2, 14-09-2026).
    private readonly derechosService: DerechosService,
    // La red bajo el formulario público (seguro 1, 22-09-2026).
    private readonly rescate: RescateDelFormularioService,
  ) {
    this.logger.setContext(QuotationsController.name);
  }

  @Roles(...RECEPTION_AND_UP)
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
      // Los derechos del plan viajan en la sesión (paso 3.2, 14-09-2026):
      // el tope de cotizaciones del mes y los eventos de varios días se
      // revisan dentro del servicio, antes de tocar la base.
      {
        derechos: user.derechos,
        cotizaciones_mes: user.cotizaciones_mes,
        plan: user.plan,
      },
    );
  }

  // Techo estricto: acceso público de escritura (Fase 3).
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Public()
  @Post('public/:company_id')
  async createPublic(
    @Body() createQuotationPublicDto: CreateQuotationPublicDto,
    @Param('company_id') company_id: Company['id'],
  ) {
    this.logger.info(
      `POST /quotations with createQuotationDto ${logSafe(createQuotationPublicDto)}`,
    );
    // Acá no hay sesión: la empresa es la de la dirección, y sus derechos
    // se preguntan aparte (paso 3.2, 14-09-2026). Con ellos el servicio
    // decide si la solicitud entra al embudo de Consultas o como
    // requerimiento normal; el formulario funciona igual en todo plan.
    try {
      const derechos = await this.derechosService.deEmpresa(company_id);
      return await this.quotationsService.createPublic(
        createQuotationPublicDto,
        company_id,
        derechos,
      );
    } catch (e) {
      // Errores de VALIDACIÓN del propio motor (400/409: tipo de evento
      // inválido, cupo del plan) no son una caída: se devuelven tal cual.
      if (esErrorDeNegocio(e)) throw e;
      // LA RED (22-09-2026): la base falló. Si el lead llega por correo a
      // los super-administradores, el visitante ve el "gracias" de siempre.
      const aSalvo = await this.rescate.rescatar(
        createQuotationPublicDto,
        company_id,
        e,
      );
      if (aSalvo) return { tipo: 'rescatada' as const };
      throw e;
    }
  }

  @Roles(...RECEPTION_AND_UP)
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
      eventDateFrom: getQuotationsDto.event_date_from
        ? new Date(`${getQuotationsDto.event_date_from}T00:00:00Z`)
        : undefined,
    });
  }

  @Roles(...RECEPTION_AND_UP)
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

  // La hoja para el navegador invisible del PDF (doc 13): token
  // firmado de corta vida, misma lista blanca que el portal. VA ANTES
  // de ':id' o esa ruta se la come.
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('imprimir/:token')
  hojaParaImprimir(@Param('token') token: string) {
    this.logger.info('GET /quotations/imprimir (token oculto)');
    return this.envioCotizacion.hojaParaImprimir(token);
  }

  // This is public becaue it is used to display the quotation details in the public customer satisfaction survey
  // TODO: maybe create public endpoint for this, instead of using the current one
  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    this.logger.info(`GET /quotations/${id}`);
    return this.quotationsService.findOne(id);
  }

  // El botón "Enviar cotización" (doc 13): correo tipo + PDF del motor.
  @Roles(...SALES_AND_UP)
  @Post(':id/enviar-correo')
  enviarPorCorreo(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`POST /quotations/${id}/enviar-correo`);
    return this.envioCotizacion.enviar(id, user);
  }

  // Declara el evento REALIZADO y dispara la encuesta de satisfacción al
  // cliente (una sola vez; ver QuotationsService.markEventDone).
  @Roles(...OPERATIONS_AND_UP)
  @Post(':id/realizado')
  markEventDone(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`POST /quotations/${id}/realizado`);
    return this.quotationsService.markEventDone(id, user.company_id, {
      derechos: user.derechos,
    });
  }

  // La puerta de VUELTA (05-08, pedido de Felipe): des-marca un evento
  // realizado por error. Solo administrador. La encuesta ya enviada no
  // se toca (y si se re-marca, no se reenvia: survey_sent_at manda).
  @Roles(...ADMIN_ONLY)
  @Post(':id/volver-a-pendiente')
  unmarkEventDone(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`POST /quotations/${id}/volver-a-pendiente`);
    return this.quotationsService.unmarkEventDone(id, user.company_id);
  }

  // La palabra final sobre una fila de la cosecha del mes. Cualquiera
  // que venda puede corregirla: es su oficio, no una decisión de sistema.
  @Roles(...SALES_AND_UP)
  @Post(':id/cosecha')
  setHarvestStatus(
    @Param('id') id: string,
    @Body() body: EstadoCosechaDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /quotations/${id}/cosecha ${body.estado ?? 'auto'}`);
    return this.quotationsService.setHarvestStatus(
      id,
      user.company_id,
      user.id,
      body.estado,
    );
  }

  @Roles(...RECEPTION_AND_UP)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateQuotationDto: UpdateQuotationDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `PATCH /quotations/${id} with updateQuotationDto ${JSON.stringify(updateQuotationDto)}`,
    );
    // Espejo del candado de create (28-07): recepción trabaja
    // requerimientos, no cotizaciones. Acá el tipo NO viene en el
    // cuerpo —hay que ir a buscarlo—, así que la comprobación vive en
    // el servicio, que ya carga la cotización de todos modos (12-08).
    return this.quotationsService.update(
      id,
      updateQuotationDto,
      user.company_id,
      (user as User & { role?: string }).role,
      { derechos: user.derechos, plan: user.plan },
    );
  }

  @Roles(...RECEPTION_AND_UP)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    // Recepción solo borra requerimientos (14-09-2026): el service revisa
    // el tipo de la cotización guardada, igual que al editar.
    return this.quotationsService.remove(
      id,
      user.company_id,
      (user as User & { role?: string }).role,
    );
  }
}

/** Un HttpException con código 4xx es una respuesta del negocio (validación,
 *  cupo, duplicado), no una caída: el rescate solo entra cuando la base falla. */
const esErrorDeNegocio = (e: unknown): boolean =>
  e instanceof HttpException && e.getStatus() >= 400 && e.getStatus() < 500;
