import { Body, Controller, Post } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { Permiso } from 'src/auth/permiso.decorator';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { FacturasTraidasService } from './facturas-traidas.service';
import { TraerFacturaDto } from './traer-factura.dto';

/** «Traer factura por N°» (doc 19 §9.36), y la nota de crédito: como las
 *  notas, solo el administrador, con el permiso de las notas. */
@Derecho('facturacion')
@Controller('facturacion')
export class FacturasTraidasController {
  constructor(
    private readonly traidas: FacturasTraidasService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(FacturasTraidasController.name);
  }

  @Permiso('facturacion_notas')
  @Post('documentos/traer')
  @Roles(...ADMIN_ONLY)
  traer(@Body() dto: TraerFacturaDto, @CurrentUser() user: User) {
    this.logger.info(
      `POST /facturacion/documentos/traer (tipo ${dto.tipo ?? 33}, N° ${dto.folio}${dto.guardar ? ', guardar' : ''})`,
    );
    return this.traidas.traer(user, dto.folio, !!dto.guardar, dto.tipo ?? 33);
  }
}
