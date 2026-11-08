import { Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { Permiso } from 'src/auth/permiso.decorator';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { BoletasService } from '../boletas/boletas.service';
import { FacturasAnterioresService } from './facturas-anteriores.service';

// TUS FACTURAS ANTERIORES (doc 19 §9.29): cómo va y «Leer mis facturas
// anteriores». Del administrador, con «Tarifario y conexión»
// (`facturacion_ajustes`), como la nómina del SII y «Probar la conexión».
// Lo que se busca con ellas sale por `GET /facturacion/razon-social`.
@Derecho('facturacion')
@Controller('facturacion/facturas-anteriores')
export class FacturasAnterioresController {
  constructor(
    private readonly facturas: FacturasAnterioresService,
    private readonly boletas: BoletasService,
  ) {}

  @Permiso('facturacion_ajustes')
  @Get()
  @Roles(...ADMIN_ONLY)
  estado(@CurrentUser() user: User) {
    return this.facturas.estado(user.company_id);
  }

  @Permiso('facturacion_ajustes')
  @Post('leer')
  @Roles(...ADMIN_ONLY)
  async leer(@CurrentUser() user: User) {
    return this.facturas.leer(user.company_id, {
      id: user.id ?? null,
      nombre: await this.boletas.nombreDe(user),
    });
  }
}
