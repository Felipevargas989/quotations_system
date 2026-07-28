import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser, Public } from 'src/auth';
import type { User } from 'src/users/entities/user.entity';
import { logSafe } from '../logging/log-safe';
import { CreateSuscriptionDto } from './dto/create-suscription.dto';
import { NotifySuperAdminDto } from './dto/notify-super-admin.dto';
import { RegisterLeadDto } from './dto/register-lead.dto';
import { SuperAdminService } from './super-admin.service';

// El AuthGuard adjunta también el correo (para la allowlist).
type UserConCorreo = User & { email?: string };

@Controller('super-admin')
export class SuperAdminController {
  constructor(
    private readonly superAdminService: SuperAdminService,
    private readonly logger: PinoLogger,
  ) {}

  // Techo estricto: acceso público de escritura (Fase 3).
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Public()
  @Post('suscription')
  createSuscription(@Body() createSuscriptionDto: CreateSuscriptionDto) {
    this.logger.info(
      `POST /super-admin/suscription with createSuscriptionDto ${logSafe(createSuscriptionDto)}`,
    );
    return this.superAdminService.createSuscription(createSuscriptionDto);
  }

  @Public()
  // ---------- Mudanza #7 (28-07): empresas del área super-admin ----------
  // Todas exigen estar en SUPER_ADMIN_EMAILS (antes bastaba la sesión).
  @Get('companies')
  listCompanies(@CurrentUser() user: UserConCorreo) {
    this.superAdminService.assertSuperAdmin(user.email);
    return this.superAdminService.listCompanies();
  }

  @Post('companies')
  createCompany(
    @Body() body: { name: string },
    @CurrentUser() user: UserConCorreo,
  ) {
    this.superAdminService.assertSuperAdmin(user.email);
    return this.superAdminService.createCompanyOnly(body.name);
  }

  @Patch('companies/:id')
  updateCompany(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; is_active?: boolean },
    @CurrentUser() user: UserConCorreo,
  ) {
    this.superAdminService.assertSuperAdmin(user.email);
    return this.superAdminService.updateCompanyById(id, body);
  }

  @Get('stats/last-month')
  getStatsLastMonth(@CurrentUser() user: UserConCorreo) {
    this.superAdminService.assertSuperAdmin(user.email);
    this.logger.info(`GET /super-admin/stats/last-month`);
    return this.superAdminService.getStatsLastMonth();
  }

  // Mudanza #1 de "una sola puerta" (28-07): la landing registra el
  // lead POR ACÁ (validado + guardado + aviso en una llamada), ya no
  // directo a Supabase desde el navegador.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Public()
  @Post('lead')
  registerLead(@Body() registerLeadDto: RegisterLeadDto) {
    this.logger.info('POST /super-admin/lead (campos personales redactados)');
    return this.superAdminService.registerLead(registerLeadDto);
  }

  // Techo estricto: acceso público de escritura (Fase 3).
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Public()
  @Post('new-lead')
  notifySuperAdmins(@Body() notifySuperAdminDto: NotifySuperAdminDto) {
    this.logger.info(
      `POST /super-admin/new-lead with body ${logSafe(notifySuperAdminDto)}`,
    );
    return this.superAdminService.notifySuperAdmins(notifySuperAdminDto);
  }
  // @Post()
  // create(@Body() createSuperAdminDto: CreateSuperAdminDto) {
  //   return this.superAdminService.create(createSuperAdminDto);
  // }

  // @Get()
  // findAll() {
  //   return this.superAdminService.findAll();
  // }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.superAdminService.findOne(+id);
  // }

  // @Patch(':id')
  // update(
  //   @Param('id') id: string,
  //   @Body() updateSuperAdminDto: UpdateSuperAdminDto,
  // ) {
  //   return this.superAdminService.update(+id, updateSuperAdminDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.superAdminService.remove(+id);
  // }
}
