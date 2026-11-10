import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser } from 'src/auth';
import { SinPlan } from 'src/auth/derecho.decorator';
import { Permiso } from 'src/auth/permiso.decorator';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { GuardarGuiaDto } from './dto/guia.dto';
import { GuiaService } from './guia.service';

// Mi empresa → «Guía de la casa» (doc 20 §18). Solo administración la ve y
// la edita (Felipe, 10-11-2026: «solo administración»); el resto del
// equipo le pregunta a BelIA, que la lee en su cerebro.
@Controller('guia-de-la-casa')
export class GuiaController {
  constructor(private readonly guia: GuiaService) {}

  @SinPlan()
  @Roles(...ADMIN_ONLY)
  @Permiso('mi_empresa')
  @Get()
  leer(@CurrentUser() user: User) {
    return this.guia.leer(user.company_id);
  }

  @SinPlan()
  @Roles(...ADMIN_ONLY)
  @Permiso('mi_empresa')
  @Put()
  guardar(@CurrentUser() user: User, @Body() dto: GuardarGuiaDto) {
    return this.guia.guardar(user, dto.secciones);
  }
}
