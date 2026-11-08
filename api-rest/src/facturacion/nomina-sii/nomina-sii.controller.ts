import { Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { Permiso } from 'src/auth/permiso.decorator';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { BoletasService } from '../boletas/boletas.service';
import { NominaSiiService } from './nomina-sii.service';

// LA NÓMINA DEL SII (doc 19 §9.27): cómo está y «Cargar la nómina del SII».
// Del administrador, con «Tarifario y conexión» (`facturacion_ajustes`),
// como «Probar la conexión». La nómina es pública y de nadie: lo que se
// busca con ella sale por `GET /facturacion/razon-social`.
@Derecho('facturacion')
@Controller('facturacion/nomina-sii')
export class NominaSiiController {
  constructor(
    private readonly nomina: NominaSiiService,
    private readonly boletas: BoletasService,
  ) {}

  @Permiso('facturacion_ajustes')
  @Get()
  @Roles(...ADMIN_ONLY)
  estado() {
    return this.nomina.estado();
  }

  @Permiso('facturacion_ajustes')
  @Post('cargar')
  @Roles(...ADMIN_ONLY)
  async cargar(@CurrentUser() user: User) {
    return this.nomina.cargar({
      id: user.id ?? null,
      nombre: await this.boletas.nombreDe(user),
    });
  }
}
