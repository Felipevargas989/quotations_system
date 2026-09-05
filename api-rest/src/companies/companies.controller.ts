import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser, Public } from 'src/auth';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { CompaniesService } from './companies.service';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly logger: PinoLogger,
  ) {}

  // @Post()
  // create(@Body() createCompanyDto: CreateCompanyDto) {
  //   return this.companiesService.create(createCompanyDto);
  // }

  // @Get()
  // findAll() {
  //   return this.companiesService.findAll();
  // }

  // Mudanza #7 (28-07): la puerta PÚBLICA entrega solo la cara visible
  // de la empresa (nombre, logo, colores, moneda) — antes entregaba la
  // ficha completa, configuración de notificaciones incluida.
  @Public()
  @Get('public/:id')
  async findOnePublic(@Param('id') id: string) {
    this.logger.info(`GET /companies/public/${id}`);
    const { data, error } = await this.companiesService.findOne(+id);
    if (error || !data) return { data: null, error: 'No encontrada' };
    // La marca del formulario público (05-09): banner, sitio y redes
    // son datos públicos — salen en cada correo de la empresa.
    const {
      id: cid,
      name,
      logo_url,
      banner_url,
      tagline,
      sitio_web,
      whatsapp,
      instagram,
      facebook,
      colors,
      currency,
    } = data as unknown as {
      id: number;
      name: string;
      logo_url?: string | null;
      banner_url?: string | null;
      tagline?: string | null;
      sitio_web?: string | null;
      whatsapp?: string | null;
      instagram?: string | null;
      facebook?: string | null;
      colors?: unknown;
      currency?: string | null;
    };
    return {
      data: {
        id: cid,
        name,
        logo_url,
        banner_url,
        tagline,
        sitio_web,
        whatsapp,
        instagram,
        facebook,
        colors,
        currency,
      },
      error: null,
    };
  }

  // La ficha completa exige sesión (la usa Configuración de Empresa).
  @Get(':id')
  findOne(@Param('id') id: string) {
    this.logger.info(`GET /companies/${id}`);
    return this.companiesService.findOne(+id);
  }

  @Roles(...ADMIN_ONLY)
  @Patch()
  update(
    @CurrentUser() user: User,
    @Body() updateCompanyDto: UpdateCompanyDto,
  ) {
    return this.companiesService.update(user.company_id, updateCompanyDto);
  }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.companiesService.remove(+id);
  // }
}
