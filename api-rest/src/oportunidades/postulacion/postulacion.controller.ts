import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { ArmarLaOfertaService } from './armar-la-oferta.service';
import { CotizacionDeLaPostulacionService } from './cotizacion-de-la-postulacion.service';
import { FijarOfertaDto, LlevarACotizacionDto } from './postulacion.dto';

// La cotización de la postulación y «¿Calza el precio?» (decisión 29 del
// doc 17). Mismo candado que el resto de Oportunidades: administrador y el
// derecho `oportunidades`. Aparte del controlador grande para no engordarlo.
@Roles(...ADMIN_ONLY)
@Derecho('oportunidades')
@Controller('oportunidades')
export class PostulacionController {
  constructor(
    private readonly cotizacion: CotizacionDeLaPostulacionService,
    private readonly armar: ArmarLaOfertaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PostulacionController.name);
  }

  /** La oferta armada con IA (decisión 33): la matriz «especificación →
   *  qué se ofrece» y lo que falta en el catálogo. */
  @Get(':id/oferta')
  oferta(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.armar.ultimo(user.company_id, id);
  }

  @Post(':id/oferta')
  armarLaOferta(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /oportunidades/${id}/oferta (empresa ${user.company_id})`,
    );
    return this.armar.pedir(user.company_id, user.id, id);
  }

  @Get(':id/cotizacion')
  estado(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.cotizacion.estado(user.company_id, id);
  }

  @Post(':id/cotizacion')
  llevar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LlevarACotizacionDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /oportunidades/${id}/cotizacion ${dto.numero ? `(vincular N° ${dto.numero})` : ''} (empresa ${user.company_id})`,
    );
    return this.cotizacion.llevar(user, id, dto.numero);
  }

  @Post(':id/cotizacion/oferta')
  fijarOferta(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FijarOfertaDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /oportunidades/${id}/cotizacion/oferta (empresa ${user.company_id})`,
    );
    return this.cotizacion.fijarOferta(user, id, dto.total);
  }
}
