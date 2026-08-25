import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser, Public } from 'src/auth';
import { CompaniesRepository } from 'src/companies/companies.repository';
import type { User } from 'src/users/entities/user.entity';
import { CrearCampanaDto, ImportarContactosDto } from './dto/marketing.dto';
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
  @Get('audiencias')
  async audiencias(@CurrentUser() user: User) {
    const [importadas, tipos] = await Promise.all([
      this.marketing.audienciasImportadas(user.company_id),
      this.marketing.tiposDeCliente(user.company_id),
    ]);
    return { importadas, tipos };
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
