import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { MarcarCompetidorDto } from '../dto/marcar-competidor.dto';
import { CompetenciaService } from './competencia.service';

// Competidores reales (decisiones 70 y 71 del doc 17). Bajo «competencia», no
// «competidores»: «competidores/:rut» es la ficha de siempre y se tragaría
// las rutas nuevas. «zona» va antes que «:rut» (Nest las prueba en orden).
// Sin botón de leer: las actas y el rubro se leen solos (decisión 71).
@Roles(...ADMIN_ONLY)
@Derecho('oportunidades')
@Controller('oportunidades')
export class CompetenciaController {
  constructor(
    private readonly competencia: CompetenciaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CompetenciaController.name);
  }

  /** «Tus competidores» y cuántas actas de la zona van leídas. */
  @Get('competencia')
  estado(@CurrentUser() user: User) {
    return this.competencia.estado(user.company_id);
  }

  /** «Quién gana en tu zona», solo lo del rubro, y cuánto va revisado. */
  @Get('competencia/zona')
  zona(@CurrentUser() user: User) {
    return this.competencia.zona(user.company_id);
  }

  /** El estudio de mercado de un competidor. */
  @Get('competencia/:rut')
  ficha(@Param('rut') rut: string, @CurrentUser() user: User) {
    return this.competencia.ficha(user.company_id, rut);
  }

  /** «Seguir» o «No es mi competidor» (o deshacerlo). */
  @Patch('competencia/:rut')
  marcar(
    @Param('rut') rut: string,
    @Body() dto: MarcarCompetidorDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `PATCH /oportunidades/competencia/${rut} (empresa ${user.company_id})`,
    );
    return this.competencia.marcar(user.company_id, rut, dto);
  }
}
