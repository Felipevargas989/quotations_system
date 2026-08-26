import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser, Public } from 'src/auth';
import { CompaniesRepository } from 'src/companies/companies.repository';
import type { User } from 'src/users/entities/user.entity';
import {
  CrearAudienciaDto,
  CrearCampanaDto,
  ImportarContactosDto,
  PreviaSegmentoDto,
  ReenviarDto,
} from './dto/marketing.dto';
import { MarketingService } from './marketing.service';

@Controller('marketing')
export class MarketingController {
  constructor(
    private readonly marketing: MarketingService,
    private readonly companies: CompaniesRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MarketingController.name);
  }

  private async nombreEmpresa(companyId: number): Promise<string> {
    try {
      const { data } = await this.companies.findOne(companyId);
      return data?.name ?? 'Eventia';
    } catch {
      return 'Eventia';
    }
  }

  // ---- Audiencias ----
  /** La estantería completa: guardadas (conteo en vivo), importadas,
   *  y la materia prima de los filtros (tipos de cliente y evento). */
  @Get('audiencias')
  async audiencias(@CurrentUser() user: User) {
    const [estanteria, importadas, tipos, tiposEvento] = await Promise.all([
      this.marketing.listarAudiencias(user.company_id),
      this.marketing.audienciasImportadas(user.company_id),
      this.marketing.tiposDeCliente(user.company_id),
      this.marketing.tiposDeEvento(user.company_id),
    ]);
    return {
      guardadas: estanteria.guardadas,
      clientes_con_correo: estanteria.clientes_con_correo,
      importadas,
      tipos,
      tipos_evento: tiposEvento,
    };
  }

  @Post('audiencias')
  crearAudiencia(@Body() dto: CrearAudienciaDto, @CurrentUser() user: User) {
    this.logger.info(`POST /marketing/audiencias ${dto.nombre}`);
    return this.marketing.crearAudiencia(dto, user.company_id);
  }

  @Delete('audiencias/:id')
  async borrarAudiencia(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`DELETE /marketing/audiencias/${id}`);
    await this.marketing.borrarAudiencia(+id, user.company_id);
    return { ok: true };
  }

  /** La previa EN VIVO del constructor de segmentos (Fase 3). */
  @Post('segmento/previa')
  previaSegmento(@Body() dto: PreviaSegmentoDto, @CurrentUser() user: User) {
    return this.marketing.previaSegmento(dto, user.company_id);
  }

  @Post('contactos/importar')
  importar(@Body() dto: ImportarContactosDto, @CurrentUser() user: User) {
    this.logger.info(
      `POST /marketing/contactos/importar ${dto.audiencia} (${dto.contactos.length})`,
    );
    return this.marketing.importarContactos(dto, user.company_id);
  }

  // ---- Campañas ----
  @Get('campanas')
  campanas(@CurrentUser() user: User) {
    return this.marketing.campanas(user.company_id);
  }

  @Post('campanas')
  crear(@Body() dto: CrearCampanaDto, @CurrentUser() user: User) {
    this.logger.info(`POST /marketing/campanas ${dto.nombre}`);
    return this.marketing.crearCampana(dto, user.company_id);
  }

  @Get('campanas/:id/destinatarios')
  destinatarios(@Param('id') id: string, @CurrentUser() user: User) {
    return this.marketing.destinatariosDe(+id, user.company_id);
  }

  @Post('campanas/:id/prueba')
  async prueba(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`POST /marketing/campanas/${id}/prueba`);
    return this.marketing.enviarPrueba(
      +id,
      user.company_id,
      user.email,
      await this.nombreEmpresa(user.company_id),
    );
  }

  @Post('campanas/:id/enviar')
  async enviar(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`POST /marketing/campanas/${id}/enviar`);
    return this.marketing.enviarCampana(
      +id,
      user.company_id,
      await this.nombreEmpresa(user.company_id),
    );
  }

  // ---- Fase 2: resultados y reenvío ----
  @Get('campanas/:id/resultados')
  resultados(@Param('id') id: string, @CurrentUser() user: User) {
    return this.marketing.resultadosDe(+id, user.company_id);
  }

  @Get('campanas/:id/sin-abrir')
  async sinAbrir(@Param('id') id: string, @CurrentUser() user: User) {
    const filas = await this.marketing.sinAbrirDe(+id, user.company_id);
    return { sin_abrir: filas.length };
  }

  @Post('campanas/:id/reenviar')
  async reenviar(
    @Param('id') id: string,
    @Body() dto: ReenviarDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /marketing/campanas/${id}/reenviar`);
    return this.marketing.reenviarANoAbiertos(
      +id,
      user.company_id,
      await this.nombreEmpresa(user.company_id),
      dto.asunto,
    );
  }

  /** El webhook de Resend: abierto/click/rebote/queja. Público — la
   *  firma Svix se verifica cuando RESEND_WEBHOOK_SECRET está puesto;
   *  y un evento solo marca sellos si su resend_id existe acá. */
  @Public()
  @Post('webhook')
  webhook(
    @Req() req: { rawBody?: Buffer },
    @Body() evento: { type?: string; data?: { email_id?: string } },
    @Headers('svix-id') svixId?: string,
    @Headers('svix-timestamp') svixTs?: string,
    @Headers('svix-signature') svixFirma?: string,
  ) {
    const crudo = req.rawBody?.toString('utf8') ?? JSON.stringify(evento);
    if (
      !this.marketing.verificarFirmaSvix(crudo, {
        id: svixId,
        timestamp: svixTs,
        firma: svixFirma,
      })
    ) {
      this.logger.warn('webhook de Resend con firma inválida: ignorado');
      return { ok: false };
    }
    return this.marketing.procesarEventoResend(evento);
  }

  // ---- La baja: pública, firmada, sin sesión ----
  @Public()
  @Get('baja')
  async baja(
    @Query('c') c: string,
    @Query('e') e: string,
    @Query('t') t: string,
  ) {
    const ok = await this.marketing.procesarBaja(c, e, t);
    // Página mínima: el clic viene de un correo, sin app ni sesión.
    return ok
      ? 'Listo: no recibirás más correos de este tipo. Puedes cerrar esta página.'
      : 'El enlace no es válido.';
  }
}
