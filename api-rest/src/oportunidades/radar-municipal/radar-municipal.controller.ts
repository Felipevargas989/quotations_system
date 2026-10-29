import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { RadarMunicipalService } from './radar-municipal.service';

// La pestaña «Radar municipal» de Oportunidades (decisión 108, solo en el
// laboratorio). Solo administrador, como el resto del módulo.
@Roles(...ADMIN_ONLY)
@Derecho('oportunidades')
@Controller('oportunidades/radar-municipal')
export class RadarMunicipalController {
  constructor(private readonly radar: RadarMunicipalService) {}

  /** Todo lo de la pestaña. `anio`: por omisión, el último completo.
   *  `region`: por omisión, las de la empresa; «chile» = todo el país. */
  @Get()
  tablero(
    @CurrentUser() user: User,
    @Query('anio') anio?: string,
    @Query('region') region?: string,
  ) {
    const n = Number.parseInt(anio ?? '', 10);
    return this.radar.tablero(user.company_id, {
      anio: Number.isFinite(n) ? n : undefined,
      region: region?.trim() || undefined,
    });
  }
}
