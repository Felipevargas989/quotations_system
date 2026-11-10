import { Global, Module } from '@nestjs/common';
import { PermisosController } from './permisos.controller';
import { PermisosService } from './permisos.service';

// Global como el de los derechos: los permisos los piden AuthGuard (para la
// sesión) y el perfil del usuario, que viven en módulos distintos (doc 22,
// 05-11-2026).
@Global()
@Module({
  controllers: [PermisosController],
  providers: [PermisosService],
  exports: [PermisosService],
})
export class PermisosModule {}
