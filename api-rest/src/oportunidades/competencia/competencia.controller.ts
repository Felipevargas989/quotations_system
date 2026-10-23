import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { MarcarCompetidorDto } from '../dto/marcar-competidor.dto';
import { CompetenciaService } from './competencia.service';

// Competidores reales (decisión 70 del doc 17). Bajo «competencia», no
// «competidores»: «competidores/:rut» ya es la ficha de quién gana en la
// zona y se tragaría las rutas nuevas. Mismo candado que el módulo.
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

  /** «Tus competidores reales» y cómo va la búsqueda en las actas. */
  @Get('competencia')
  estado(@CurrentUser() user: User) {
    return this.competencia.estado(user.company_id);
  }

  /** «Buscar en las actas»: responde al tiro; sigue por detrás. */
  @Post('competencia/buscar')
  buscar(@CurrentUser() user: User) {
    this.logger.info(
      `POST /oportunidades/competencia/buscar (empresa ${user.company_id})`,
    );
    return this.competencia.buscar(user.company_id);
  }

  /** Las licitaciones donde la empresa se cruzó con ese proveedor. */
  @Get('competencia/:rut/encuentros')
  encuentros(@Param('rut') rut: string, @CurrentUser() user: User) {
    return this.competencia.encuentros(user.company_id, rut);
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
