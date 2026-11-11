import { Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { Permiso } from 'src/auth/permiso.decorator';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { OfertasDeLaCompetenciaService } from '../competencia/ofertas-de-la-competencia.service';
import { ComparacionService } from './comparacion.service';
import { PorQuePerdimosService } from './por-que-perdimos.service';

// La comparación de ofertas (decisión 41 del doc 17) y, desde la decisión
// 97, por qué perdimos. Mismo candado que el resto de Oportunidades. Las
// ofertas de la competencia se suben con la ruta de siempre
// (`POST :id/adjuntos`, sección 'competencia') o, desde la decisión 123, se
// traen del cuadro público de Mercado Público con «Traer las ofertas»
// (`:id/competencia/traer`).
@Roles(...ADMIN_ONLY)
@Derecho('oportunidades')
@Permiso('oportunidades')
@Controller('oportunidades')
export class ComparacionController {
  constructor(
    private readonly comparacion: ComparacionService,
    private readonly porQue: PorQuePerdimosService,
    private readonly ofertas: OfertasDeLaCompetenciaService,
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

  /** El último «por qué perdimos» (decisión 97); null si no hay. */
  @Get(':id/por-que')
  ultimoPorQue(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.porQue.ultima(user.company_id, id);
  }

  @Post(':id/por-que')
  pedirPorQue(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /oportunidades/${id}/por-que (empresa ${user.company_id})`,
    );
    return this.porQue.pedir(user.company_id, user.id, id);
  }

  /** ¿Está trayendo las ofertas de los demás, y cómo terminó la última
   *  vuelta? (decisión 123): la pantalla lo pregunta al entrar a la pestaña
   *  y cada 3 segundos mientras trae. */
  @Get(':id/competencia/traer')
  estadoDeTraerOfertas(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.ofertas.estado(user.company_id, id);
  }

  /** «Traer las ofertas» (decisión 123): los anexos de los demás oferentes
   *  de una licitación, del cuadro de ofertas público de Mercado Público,
   *  a «La competencia». Responde al tiro y sigue por detrás; una vuelta a
   *  la vez (409). */
  @Post(':id/competencia/traer')
  traerOfertas(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /oportunidades/${id}/competencia/traer (empresa ${user.company_id})`,
    );
    return this.ofertas.traerAPedido(user.company_id, id);
  }
}
