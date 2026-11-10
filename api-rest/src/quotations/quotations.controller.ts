import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser, Public } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { DerechosService } from 'src/auth/derechos.service';
import { DentroDe, Permiso } from 'src/auth/permiso.decorator';
import {
  ADMIN_ONLY,
  OPERATIONS_AND_UP,
  RECEPTION_AND_UP,
  Roles,
} from 'src/auth/roles.decorator';
import { SesionOpcional } from 'src/auth/sesion-opcional.service';
import {
  AlcanceDeRecepcion,
  esRecepcion,
  paraLaAgenda,
  revisarLoQueCotiza,
  type CotizacionParaElAlcance,
} from 'src/clients/alcance-de-recepcion';
import { DelEvento } from 'src/clients/del-evento.decorator';
import { Company } from 'src/companies/entities/company.entity';
import type { User } from 'src/users/entities/user.entity';
import { logSafe } from '../logging/log-safe';
import { ChoquesDeFechaService } from './choques/choques.service';
import { filaSinComentario, sinComentarioAjeno } from './comentario-interno';
import { RequestType } from './constants/constants';
import { AvisoDeCierreDto } from './dto/aviso-de-cierre.dto';
import { CheckConflictsWithExistingQuotationsDto } from './dto/check-conflicts-with-existing-quotations.dto';
import { CreateQuotationPublicDto } from './dto/create-quotation-public.dto';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { DecisionDeChoqueDto } from './dto/decision-de-choque.dto';
import { EstadoCosechaDto } from './dto/estado-cosecha.dto';
import { GetQuotationsDto } from './dto/get-quotations.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { EnvioCotizacionService } from './envio-cotizacion.service';
import { GenerarCotizacionService } from './generar/generar.service';
import { QuotationsService } from './quotations.service';
import { RescateDelFormularioService } from './rescate-del-formulario.service';
import { SeguimientoConIAService } from './seguimiento/seguimiento.service';

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
    // Quién pregunta en GET /quotations/:id, que es pública (17-10-2026).
    private readonly sesionOpcional: SesionOpcional,
    // El botón «✨ Crear con IA» (doc 16 §6, 17-10-2026).
    private readonly generarCotizacion: GenerarCotizacionService,
    private readonly seguimientoConIA: SeguimientoConIAService,
    // Los choques de fecha con una aceptada (mapa 02 §5.6, 18-10-2026).
    private readonly choques: ChoquesDeFechaService,
    // Lo que ve recepción: requerimientos y cotizaciones de particulares
    // (doc 21, 04-11-2026).
    private readonly alcance: AlcanceDeRecepcion,
  ) {
    this.logger.setContext(QuotationsController.name);
  }

  @Roles(...RECEPTION_AND_UP)
  @Permiso('requerimientos', 'cotizaciones')
  @Post()
  async create(
    @Body() createQuotationDto: CreateQuotationDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /quotations with createQuotationDto ${logSafe(createQuotationDto)}`,
    );
    // Regla de Felipe (28-07): recepción crea REQUERIMIENTOS, no
    // cotizaciones formales. Mismo endpoint para ambos (los usa la
    // misma tabla), así que la distinción es por el tipo de solicitud.
    // Desde el doc 21 (04-11-2026), también cotizaciones de clientes
    // particulares, sin descuento y sin aceptarlas. Desde el doc 22 §9, cada
    // cargo cotiza solo a clientes de los tipos que trabaja (a recepción, de
    // fábrica, los particulares).
    if (createQuotationDto.request_type !== RequestType.REQUERIMIENTO) {
      await this.alcance.exigirElTipoDelCliente(
        user,
        createQuotationDto.client_id,
      );
      if (esRecepcion(user)) revisarLoQueCotiza(createQuotationDto);
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
      // El visitante recibe la fila recién creada: sin el comentario
      // interno, aunque nazca vacío (17-10-2026).
      return filaSinComentario(
        await this.quotationsService.createPublic(
          createQuotationPublicDto,
          company_id,
          derechos,
        ),
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
  @Permiso(
    'requerimientos',
    'cotizaciones',
    'calendario',
    'dashboard',
    'personal',
  )
  @Get()
  async findAll(
    @CurrentUser() user: User,
    @Query() getQuotationsDto: GetQuotationsDto,
  ) {
    this.logger.info(
      `GET /quotations with user ${user.id} with params ${JSON.stringify(getQuotationsDto)}`,
    );
    const filas = await this.quotationsService.findAll({
      companyId: user.company_id,
      request_type: getQuotationsDto.request_type,
      statuses: getQuotationsDto.statuses,
      sort_by: getQuotationsDto.sort_by,
      sort_order: getQuotationsDto.sort_order,
      eventDateFrom: getQuotationsDto.event_date_from
        ? new Date(`${getQuotationsDto.event_date_from}T00:00:00Z`)
        : undefined,
    });
    // Recepción: los requerimientos y las cotizaciones de particulares
    // (doc 21). Antes le llegaban todas con montos y solo la pantalla las
    // escondía. En el calendario sigue viendo todos los eventos, los demás
    // sin plata. Y los permisos por cargo (doc 22 §4.4): sin Calendario no
    // hay vista de calendario, y sin Cotizaciones, Dashboard ni Personal,
    // solo requerimientos.
    return this.alcance.deLaLista(user, filas, getQuotationsDto.vista);
  }

  @Roles(...RECEPTION_AND_UP)
  @Permiso(
    'requerimientos',
    'cotizaciones',
    'clientes',
    'calendario',
    'postventa',
  )
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
  // El comentario interno (17-10-2026, migración 128) solo viaja si quien
  // pregunta trae una sesión de la misma empresa: la encuesta, que abre
  // esta puerta sin sesión, recibe la cotización sin él.
  @Public()
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    this.logger.info(`GET /quotations/${id}`);
    const [respuesta, perfil] = await Promise.all([
      this.quotationsService.findOne(id),
      this.sesionOpcional.perfilDe(authorization),
    ]);
    const empresa = perfil?.company_id ?? null;
    const limpia = sinComentarioAjeno(respuesta, empresa);
    const fila = limpia?.data as
      | ({ company_id?: number | string } & CotizacionParaElAlcance)
      | null;
    if (empresa === null || !fila || Number(fila.company_id) !== empresa) {
      return limpia;
    }
    // Con su sesión, cada cargo ve completos los requerimientos y las
    // cotizaciones de los tipos de cliente que trabaja (doc 22 §9; a
    // recepción, de fábrica, los particulares, doc 21). De las demás, lo que
    // muestra el calendario (la tarjeta pide aquí sus categorías), sin
    // plata.
    if (perfil && !(await this.alcance.ve(perfil, fila))) {
      return { ...limpia, data: paraLaAgenda(fila) };
    }
    // Solo a su empresa: si es la copia de lo postulado en una licitación,
    // la pantalla la muestra de solo lectura (decisión 35 del doc 17).
    return {
      ...limpia,
      data: {
        ...fila,
        de_licitacion: await this.quotationsService.licitacionDe(id, empresa),
      },
    };
  }

  // El botón «✨ Crear con IA» (doc 16 §6, 17-10-2026): arma el
  // requerimiento con Claude y lo deja en solicitada; nunca envía. Solo
  // quien cotiza (convertir es pega de venta, 12-08) y solo la empresa con
  // el módulo propio cotizar_con_ia (Valle del Sol, migración 130).
  // Desde el doc 21, también recepción, en requerimientos de particulares.
  @Roles(...RECEPTION_AND_UP)
  @Derecho('cotizar_con_ia')
  @Permiso('requerimientos')
  @Post(':id/generar')
  async generar(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`POST /quotations/${id}/generar`);
    await this.alcance.exigirElTipo(user, id);
    return this.generarCotizacion.generar(id, user);
  }

  // «✉ Generar seguimiento» (doc 18, 17-10-2026): las cotizaciones cuyo
  // próximo contacto venció y es por correo, y el borrador del seguimiento
  // en el hilo del cliente (Outlook). Nunca envía. Solo quien vende, y solo
  // la empresa con el módulo propio seguimiento_con_ia (migración 140).
  // Desde el doc 21, también recepción: solo sus particulares.
  @Roles(...RECEPTION_AND_UP)
  @Derecho('seguimiento_con_ia')
  @Permiso('cotizaciones', 'postventa')
  @Get('seguimiento/pendientes')
  async seguimientosPendientes(@CurrentUser() user: User) {
    this.logger.info('GET /quotations/seguimiento/pendientes');
    const pendientes = await this.seguimientoConIA.pendientes(user);
    // Solo las de los tipos que trabaja su cargo (doc 22 §9).
    if (!(await this.alcance.tiposDelCargo(user))) return pendientes;
    const ve = await Promise.all(
      pendientes.map((p) => this.alcance.veLaCotizacion(user, p.id)),
    );
    return pendientes.filter((_, i) => ve[i]);
  }

  // Al abrir Cotizaciones (doc 18 §9, Felipe 17-10): le pregunta a Outlook
  // si los borradores que esperan ya salieron; si salieron, anota el envío
  // en la bitácora con el próximo contacto. Sin IA, como mucho una consulta
  // por borrador cada 5 minutos.
  @Roles(...RECEPTION_AND_UP)
  @Derecho('seguimiento_con_ia')
  @Permiso('cotizaciones', 'postventa')
  @Post('seguimiento/revisar')
  revisarSeguimientos(@CurrentUser() user: User) {
    this.logger.info('POST /quotations/seguimiento/revisar');
    return this.seguimientoConIA.revisar(user);
  }

  @Roles(...RECEPTION_AND_UP)
  @Derecho('seguimiento_con_ia')
  @Permiso('cotizaciones', 'postventa')
  @Post(':id/seguimiento')
  async generarSeguimiento(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`POST /quotations/${id}/seguimiento`);
    await this.alcance.exigirElTipo(user, id);
    return this.seguimientoConIA.generar(id, user);
  }

  // Topes de calendario (Felipe, 18-10-2026; mapa 02 §5.6): las cotizaciones
  // vivas cuyas fechas se topan con una aceptada. La lista la ve todo el que
  // ve el tablero; «Sí, puede seguir» es de quien vende.
  @Roles(...RECEPTION_AND_UP)
  @Permiso('cotizaciones', 'postventa')
  @Get('choques/pendientes')
  choquesDeFecha(@CurrentUser() user: User) {
    this.logger.info('GET /quotations/choques/pendientes');
    return this.choques.listar(user);
  }

  @Roles(...RECEPTION_AND_UP)
  @Permiso('cotizaciones', 'postventa')
  @Post(':id/choques/:aceptadaId')
  async decidirChoque(
    @Param('id') id: string,
    @Param('aceptadaId') aceptadaId: string,
    @Body() body: DecisionDeChoqueDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /quotations/${id}/choques/${aceptadaId} (${body.decision})`,
    );
    await this.alcance.exigirElTipo(user, id);
    return this.choques.seguir(user, id, aceptadaId);
  }

  // El botón "Enviar cotización" (doc 13): correo tipo + PDF del motor.
  // Desde el doc 21, también recepción, en particulares.
  @Roles(...RECEPTION_AND_UP)
  @Permiso('cotizaciones')
  @Post(':id/enviar-correo')
  async enviarPorCorreo(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`POST /quotations/${id}/enviar-correo`);
    await this.alcance.exigirElTipo(user, id);
    return this.envioCotizacion.enviar(id, user);
  }

  // El aviso de cierre al rechazar (Felipe, 04-11-2026): el pop-up pide
  // el borrador, la persona lo edita y lo envía. Mismo cargo que enviar.
  @Roles(...RECEPTION_AND_UP)
  @Permiso('cotizaciones')
  @Get(':id/aviso-de-cierre')
  async borradorAvisoDeCierre(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`GET /quotations/${id}/aviso-de-cierre`);
    await this.alcance.exigirElTipo(user, id);
    return this.envioCotizacion.borradorDelAvisoDeCierre(id, user);
  }

  @Roles(...RECEPTION_AND_UP)
  @Permiso('cotizaciones')
  @Post(':id/aviso-de-cierre')
  async enviarAvisoDeCierre(
    @Param('id') id: string,
    @Body() body: AvisoDeCierreDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /quotations/${id}/aviso-de-cierre`);
    await this.alcance.exigirElTipo(user, id);
    return this.envioCotizacion.enviarAvisoDeCierre(id, user, body);
  }

  // Declara el evento REALIZADO y dispara la encuesta de satisfacción al
  // cliente (una sola vez; ver QuotationsService.markEventDone).
  @Roles(...OPERATIONS_AND_UP)
  @Permiso('postventa')
  @DelEvento({ param: 'id' })
  @Post(':id/realizado')
  markEventDone(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`POST /quotations/${id}/realizado`);
    return this.quotationsService.markEventDone(
      id,
      user.company_id,
      { derechos: user.derechos },
      // Firma el cambio de estado en el Seguimiento (09-11-2026).
      user,
    );
  }

  // La puerta de VUELTA (05-08, pedido de Felipe): des-marca un evento
  // realizado por error. Solo administrador. La encuesta ya enviada no
  // se toca (y si se re-marca, no se reenvia: survey_sent_at manda).
  @Roles(...ADMIN_ONLY)
  @DentroDe('postventa')
  @DelEvento({ param: 'id' })
  @Post(':id/volver-a-pendiente')
  unmarkEventDone(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`POST /quotations/${id}/volver-a-pendiente`);
    return this.quotationsService.unmarkEventDone(id, user.company_id, user);
  }

  // La palabra final sobre una fila de la cosecha del mes. La corrige quien
  // tiene el Dashboard, que es donde vive la cosecha: desde el 06-11-2026
  // la puerta es de esa sección (doc 22 §4.3, Felipe: «si hazlo si»), y
  // una cotización de un tipo de cliente que su cargo no trabaja no se
  // toca, como en el resto del Dashboard (doc 22 §9.8).
  @Roles(...ADMIN_ONLY)
  @Permiso('dashboard')
  @DelEvento({ param: 'id' })
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
  @Permiso('requerimientos', 'cotizaciones', 'postventa')
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
      // Quien cambia el estado firma la línea del Seguimiento (09-11-2026).
      user,
    );
  }

  @Roles(...RECEPTION_AND_UP)
  @Permiso('requerimientos', 'cotizaciones')
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
