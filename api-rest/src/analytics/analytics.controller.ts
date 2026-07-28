import { Controller, Get, Query } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import type { User } from 'src/users/entities/user.entity';
import { AnalyticsService } from './analytics.service';
import { GetCompleteStatsDto } from './dto/get-complete-stats.dto';
import { GetDashboardStatsDto } from './dto/get-dashboard-stats.dto';
import { Roles, ADMIN_ONLY } from 'src/auth/roles.decorator';

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

    return this.analyticsService.getDashboardStats(user.company_id, {
      start_date: getDashboardStatsDto.start_date,
      end_date: getDashboardStatsDto.end_date,
    });
  }

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
