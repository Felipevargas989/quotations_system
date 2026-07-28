import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser, Public } from 'src/auth';
import type { User } from 'src/users/entities/user.entity';
import { CompaniesService } from './companies.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Roles, ADMIN_ONLY } from 'src/auth/roles.decorator';

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
    const { id: cid, name, logo_url, colors, currency } = data as unknown as {
      id: number;
      name: string;
      logo_url?: string | null;
      colors?: unknown;
      currency?: string | null;
    };
    return { data: { id: cid, name, logo_url, colors, currency }, error: null };
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
