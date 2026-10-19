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
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PostulacionController.name);
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
