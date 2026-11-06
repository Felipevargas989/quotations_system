import { IsBoolean, IsIn } from 'class-validator';
import { UserRole } from 'src/users/entities/user.entity';
import { CARGOS, CATALOGO_DE_PERMISOS, type Permiso } from '../permisos';

// Un interruptor de la pantalla de permisos (doc 22 §5): un cargo, un
// permiso y cómo queda.
export class CambiarPermisoDto {
  @IsIn(CARGOS)
  cargo: UserRole;

  @IsIn(CATALOGO_DE_PERMISOS.map((p) => p.clave))
  permiso: Permiso;

  @IsBoolean()
  prendido: boolean;
}
