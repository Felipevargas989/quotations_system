import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser, Public } from 'src/auth';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import { CompaniesRepository } from 'src/companies/companies.repository';
import type { User } from 'src/users/entities/user.entity';
import {
  CrearAudienciaDto,
  CrearCampanaDto,
  EditarCampanaDto,
  ImportarContactosDto,
  PreviaSegmentoDto,
  ReenviarDto,
} from './dto/marketing.dto';
import { MarketingService } from './marketing.service';
import type { MarcaEmpresa } from './plantilla';

// SOLO ADMINISTRADOR (revisión 26-08): la matriz del frontend ya lo
// decía (permissions.ts: marketing = ADMIN_ONLY) y el backend no lo
// aplicaba — cualquier sesión podía exportar correos o disparar
// campañas por API. Las rutas @Public (webhook, baja) no pasan por
// acá: RolesGuard las deja ir primero.
@Roles(...ADMIN_ONLY)
@Controller('marketing')
export class MarketingController {
  constructor(
    private readonly marketing: MarketingService,
    private readonly companies: CompaniesRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MarketingController.name);
  }

  /** La marca completa del remitente (Configuración + migración 95):
   *  nombre, logo, tagline, canales y paleta. Los correos la visten. */
  private async empresaDe(companyId: number): Promise<MarcaEmpresa> {
    const pordefecto: MarcaEmpresa = {
      nombre: 'Eventia',
      logo: null,
      banner: null,
      tagline: null,
      replyTo: null,
      whatsapp: null,
      instagram: null,
      facebook: null,
      sitioWeb: null,
      colorPrimario: '#134686',
      colorSecundario: '#f9fafb',
    };
    // Si la consulta FALLA (error transitorio), se corta el envío en
    // vez de despachar toda la campaña con marca genérica y sin
    // replyTo (revisión 26-08). El pordefecto queda solo para el caso
    // real de "la empresa no existe".
    const { data, error } = await this.companies.findOne(companyId);
    // PGRST116 = cero filas con .single(): empresa inexistente de
    // verdad → marca por defecto. Cualquier otro error corta el envío
    // con un mensaje que el administrador entiende (503), no un 500.
    if (error && error.code !== 'PGRST116') {
      this.logger.error(`empresaDe(${companyId}): ${error.message}`);
      throw new ServiceUnavailableException(
        'No se pudo cargar la marca de la empresa; intenta de nuevo',
      );
    }
    {
      if (!data) return pordefecto;
      return {
        nombre: data.name ?? 'Eventia',
        logo: data.logo_url?.trim() || null,
        banner: data.banner_url?.trim() || null,
        tagline: data.tagline?.trim() || null,
        whatsapp: data.whatsapp?.trim() || null,
        instagram: data.instagram?.trim() || null,
        facebook: data.facebook?.trim() || null,
        sitioWeb: data.sitio_web?.trim() || null,
        colorPrimario: data.colors?.primary?.trim() || '#134686',
        colorSecundario: data.colors?.secondary?.trim() || '#f9fafb',
        replyTo: data.notifications?.replyTo?.trim() || null,
      };
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

  /** Quiénes están dentro de una importada (bajas marcadas). El nombre
   *  va por query: puede traer espacios y tildes. */
  @Get('audiencias/importada')
  contactosDeImportada(
    @Query('nombre') nombre: string,
    @CurrentUser() user: User,
  ) {
    return this.marketing.contactosDeImportada(user.company_id, nombre ?? '');
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

  /** Editar un borrador desde su ficha; el motor invalida la prueba. */
  @Patch('campanas/:id')
  editar(
    @Param('id') id: string,
    @Body() dto: EditarCampanaDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`PATCH /marketing/campanas/${id}`);
    return this.marketing.editarCampana(+id, user.company_id, dto);
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
      await this.empresaDe(user.company_id),
    );
  }

  @Post('campanas/:id/enviar')
  async enviar(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`POST /marketing/campanas/${id}/enviar`);
    return this.marketing.enviarCampana(
      +id,
      user.company_id,
      await this.empresaDe(user.company_id),
    );
  }

  /** La ficha completa de la campaña: KPIs + destinatarios con sellos. */
  @Get('campanas/:id/detalle')
  detalle(@Param('id') id: string, @CurrentUser() user: User) {
    return this.marketing.detalleDe(+id, user.company_id);
  }

  /** El correo tal como salió, renderizado con la marca de hoy. */
  @Get('campanas/:id/html')
  async html(@Param('id') id: string, @CurrentUser() user: User) {
    return this.marketing.htmlDe(
      +id,
      user.company_id,
      await this.empresaDe(user.company_id),
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
      await this.empresaDe(user.company_id),
      dto.asunto,
    );
  }

  /** El webhook de Resend: abierto/click/rebote/queja. Público — la
   *  firma Svix se verifica cuando RESEND_WEBHOOK_SECRET está puesto;
   *  y un evento solo marca sellos si su resend_id existe acá. */
  @Public()
  // Freno holgado: una campaña de cientos dispara cientos de avisos en
  // el primer minuto y un 429 botaría rebotes reales (la barredora lo
  // pilló). La puerta de verdad es la FIRMA, no la velocidad.
  @Throttle({ default: { limit: 1200, ttl: 60_000 } })
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
  // DOS TIEMPOS (revisión 26-08): el GET solo CONFIRMA — los escáneres
  // de seguridad corporativos (Outlook SafeLinks y compañía) abren
  // todos los links de un correo, y con la baja en el GET daban de
  // baja gente sin querer. La baja real corre en el POST, que es
  // además el formato "un clic" que Gmail/Outlook usan con las
  // cabeceras List-Unsubscribe.
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('baja')
  bajaConfirmar(
    @Query('c') c: string,
    @Query('e') e: string,
    @Query('t') t: string,
  ) {
    const valida = this.marketing.bajaValida(c, e, t);
    if (!valida) return 'El enlace no es válido.';
    const destino = `baja?c=${encodeURIComponent(c)}&e=${encodeURIComponent(e)}&t=${encodeURIComponent(t)}`;
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Dejar de recibir correos</title></head>
<body style="margin:0;padding:40px 16px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;color:#111827;">
  <div style="max-width:420px;margin:0 auto;background:#fff;border-radius:12px;padding:32px 24px;">
    <p style="font-size:16px;margin:0 0 20px;">¿Quieres dejar de recibir estos correos?</p>
    <form method="POST" action="${destino}">
      <button type="submit" style="background:#dc2626;color:#fff;border:0;border-radius:8px;padding:12px 28px;font-size:15px;font-weight:600;cursor:pointer;">Sí, darme de baja</button>
    </form>
    <p style="font-size:12px;color:#6b7280;margin:16px 0 0;">Si llegaste acá por error, simplemente cierra esta página.</p>
  </div>
</body></html>`;
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('baja')
  async bajaEjecutar(
    @Query('c') c: string,
    @Query('e') e: string,
    @Query('t') t: string,
  ) {
    const ok = await this.marketing.procesarBaja(c, e, t);
    return ok
      ? 'Listo: no recibirás más correos de este tipo. Puedes cerrar esta página.'
      : 'El enlace no es válido.';
  }
}
