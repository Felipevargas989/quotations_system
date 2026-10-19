import { Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { ComparacionService } from './comparacion.service';

// La comparación de ofertas (decisión 41 del doc 17). Mismo candado que el
// resto de Oportunidades. Las ofertas de la competencia se suben con la
// ruta de siempre (`POST :id/adjuntos`, sección 'competencia').
@Roles(...ADMIN_ONLY)
@Derecho('oportunidades')
@Controller('oportunidades')
export class ComparacionController {
  constructor(
    private readonly comparacion: ComparacionService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ComparacionController.name);
  }

  @Get(':id/comparacion')
  ultima(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.comparacion.ultima(user.company_id, id);
  }

  @Post(':id/comparacion')
  pedir(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    this.logger.info(
      `POST /oportunidades/${id}/comparacion (empresa ${user.company_id})`,
    );
    return this.comparacion.pedir(user.company_id, user.id, id);
  }
}
