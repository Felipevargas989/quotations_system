import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { User } from 'src/users/entities/user.entity';
import { CambiarPermisoDto } from './dto/cambiar-permiso.dto';
import { CambiarTipoDto } from './dto/cambiar-tipo.dto';
import { Permiso } from './permiso.decorator';
import { PermisosService } from './permisos.service';
import { ADMIN_ONLY, Roles } from './roles.decorator';
import { CurrentUser } from './user.decorator';

// La pantalla «Permisos por cargo» (doc 22 §5): Mi empresa → Usuarios. Sus
// puertas son de `usuarios`, que es fijo del administrador: nadie se puede
// sacar a sí mismo de acá.
@Roles(...ADMIN_ONLY)
@Permiso('usuarios')
@Controller('permisos')
export class PermisosController {
  constructor(
    private readonly permisos: PermisosService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PermisosController.name);
  }

  @Get()
  pantalla(@CurrentUser() user: User) {
    this.logger.info(`GET /permisos with user ${user.id}`);
    return this.permisos.pantalla(user.company_id, user.derechos);
  }

  @Put()
  cambiar(@Body() dto: CambiarPermisoDto, @CurrentUser() user: User) {
    this.logger.info(
      `PUT /permisos ${dto.cargo} ${dto.permiso} → ${dto.prendido} with user ${user.id}`,
    );
    return this.permisos.cambiar(user, dto.cargo, dto.permiso, dto.prendido);
  }

  // El bloque «Tipos de cliente» (doc 22 §9).
  @Put('tipos')
  cambiarTipo(@Body() dto: CambiarTipoDto, @CurrentUser() user: User) {
    this.logger.info(
      `PUT /permisos/tipos ${dto.cargo} ${dto.tipo} → ${dto.prendido} with user ${user.id}`,
    );
    return this.permisos.cambiarTipo(user, dto.cargo, dto.tipo, dto.prendido);
  }

  @Post('fabrica')
  volverAFabrica(@CurrentUser() user: User) {
    this.logger.info(`POST /permisos/fabrica with user ${user.id}`);
    return this.permisos.volverAFabrica(user);
  }
}
