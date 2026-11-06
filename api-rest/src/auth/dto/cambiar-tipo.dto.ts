import { IsBoolean, IsIn, IsInt, Min } from 'class-validator';
import { UserRole } from 'src/users/entities/user.entity';
import { CARGOS } from '../permisos';

// Un interruptor del bloque «Tipos de cliente» (doc 22 §9): un cargo, el id
// del tipo y cómo queda.
export class CambiarTipoDto {
  @IsIn(CARGOS)
  cargo: UserRole;

  @IsInt()
  @Min(1)
  tipo: number;

  @IsBoolean()
  prendido: boolean;
}
