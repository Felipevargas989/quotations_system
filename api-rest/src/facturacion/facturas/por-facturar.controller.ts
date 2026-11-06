import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { Permiso } from 'src/auth/permiso.decorator';
import { OPERATIONS_AND_UP, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { FacturasService } from './facturas.service';

// «Por facturar» de la sección Facturación (doc 19 §9.21): los eventos
// aceptados o realizados a los que les queda algo por emitir. Lo ven los
// que ven «Documentos» (`facturacion_documentos`); facturar cada uno sigue
// siendo del administrador (D5), por la ruta del evento. Solo con el
// módulo propio `facturacion`, y la empresa sale SIEMPRE de la sesión.
@Derecho('facturacion')
@Controller('facturacion/por-facturar')
export class PorFacturarController {
  constructor(private readonly facturas: FacturasService) {}

  @Permiso('facturacion_documentos')
  @Get()
  @Roles(...OPERATIONS_AND_UP)
  porFacturar(@CurrentUser() user: User) {
    return this.facturas.porFacturar(user.company_id);
  }
}
