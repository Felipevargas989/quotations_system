import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { UserRole } from 'src/users/entities/user.entity';

// Lo que guarda la ventanilla de BelIA cuando cambia la conversación (doc
// 20 §13, migración 182): los turnos como los muestra, con sus tarjetas.
// Las tarjetas no se miran por dentro: son solo para pintarlas de nuevo, y
// el «Sí, aplicar» se revisa contra la propuesta guardada (migración 181).

export class TurnoGuardadoDto {
  @IsIn(['persona', 'belia'])
  rol: 'persona' | 'belia';

  @IsString()
  @MaxLength(20_000)
  texto: string;

  /** Un aviso de que no se pudo responder: se muestra, pero no viaja. */
  @IsOptional()
  @IsBoolean()
  error?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsObject({ each: true })
  propuestas?: Record<string, unknown>[];
}

export class GuardarConversacionDto {
  /** El cargo con que la pantalla cree estar conversando. Si no es el de
   *  la sesión, a la persona le cambiaron el cargo: se parte de cero. */
  @IsIn(Object.values(UserRole))
  cargo: UserRole;

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => TurnoGuardadoDto)
  turnos: TurnoGuardadoDto[];
}
