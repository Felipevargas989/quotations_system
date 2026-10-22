import { Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { ResumenDeNegocioService } from './resumen-de-negocio.service';

// «Seguir» una licitación (decisión 30 del doc 17): el resumen de negocio.
// Mismo candado que el resto de Oportunidades.
@Roles(...ADMIN_ONLY)
@Derecho('oportunidades')
@Controller('oportunidades')
export class SeguimientoController {
  constructor(
    private readonly resumen: ResumenDeNegocioService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SeguimientoController.name);
  }

  @Get(':id/resumen-de-negocio')
  ultimo(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.resumen.ultimo(user.company_id, id);
  }

  @Post(':id/resumen-de-negocio')
  pedir(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    this.logger.info(
      `POST /oportunidades/${id}/resumen-de-negocio (empresa ${user.company_id})`,
    );
    return this.resumen.pedir(user.company_id, user.id, id);
  }
}
