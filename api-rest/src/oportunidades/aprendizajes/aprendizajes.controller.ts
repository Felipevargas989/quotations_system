import { Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { AprendizajesService } from './aprendizajes.service';

// Lo que aprendimos de las comisiones (decisión 60 del doc 17). Mismo
// candado que el resto de Oportunidades. El acta se sube con la ruta de
// siempre (`POST :id/adjuntos`, sección 'acta').
@Roles(...ADMIN_ONLY)
@Derecho('oportunidades')
@Controller('oportunidades')
export class AprendizajesController {
  constructor(
    private readonly aprendizajes: AprendizajesService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AprendizajesController.name);
  }

  @Get(':id/aprendizajes')
  estado(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.aprendizajes.estado(user.company_id, id);
  }

  @Post(':id/aprendizajes')
  pedir(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    this.logger.info(
      `POST /oportunidades/${id}/aprendizajes (empresa ${user.company_id})`,
    );
    return this.aprendizajes.pedir(user.company_id, user.id, id);
  }
}
