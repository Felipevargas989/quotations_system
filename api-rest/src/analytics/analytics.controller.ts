import { Controller, Get, Query } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { tieneDerecho } from 'src/auth/derechos';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { AnalyticsService } from './analytics.service';
import { GetCompleteStatsDto } from './dto/get-complete-stats.dto';
import { GetDashboardStatsDto } from './dto/get-dashboard-stats.dto';

// Sección de administrador (Fase 3): el cargo se exige acá.
@Roles(...ADMIN_ONLY)
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly logger: PinoLogger,
  ) {}

  @Get('dashboard')
  getDashboardStats(
    @CurrentUser() user: User,
    @Query() getDashboardStatsDto: GetDashboardStatsDto,
  ) {
    this.logger.info(`GET /analytics/dashboard`);

    return this.analyticsService.getDashboardStats(
      user.company_id,
      {
        start_date: getDashboardStatsDto.start_date,
        end_date: getDashboardStatsDto.end_date,
      },
      // El nivel 1 del Dashboard (los KPIs) está en todos los planes;
      // Ingresos y Caja es del nivel 2 (paso 3.2, 14-09-2026). La puerta
      // NO lleva candado: la misma respuesta sirve a los dos niveles y el
      // servicio entrega solo los bloques que corresponden.
      tieneDerecho(user.derechos, 'dashboard_2'),
    );
  }

  // La sección Análisis (ingresos por tipo de cliente, top clientes,
  // clientes recurrentes) es del nivel 2 del Dashboard, que entra con
  // Gestiona y Cobra (paso 3.2, 14-09-2026).
  @Derecho('dashboard_2')
  @Get('complete')
  getCompleteStats(
    @CurrentUser() user: User,
    @Query() getCompleteStatsDto: GetCompleteStatsDto,
  ) {
    this.logger.info(`GET /analytics/complete`);

    return this.analyticsService.getCompleteStats(
      user.company_id,
      getCompleteStatsDto,
    );
  }
}
