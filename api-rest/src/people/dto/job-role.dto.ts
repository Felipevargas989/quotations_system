import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Un cargo es SOLO un nombre. No lleva escrito si participa o no en la
 *  propina: eso se decide en cada reparto (decisión de Felipe, 14-08).
 *  Por eso acá no hay ningún porcentaje ni casilla de "recibe propina". */
export class CreateJobRoleDto {
  @IsString()
  @IsNotEmpty({ message: 'Falta el nombre del cargo' })
  @MaxLength(60)
  name: string;
}

export class UpdateJobRoleDto {
  @IsString()
  @IsOptional()
  @MaxLength(60)
  name?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  // El valor sugerido del cargo. Se edita desde Personal → Cargos desde
  // el 15-08: los cargos salieron de Logística y esta es su única puerta.
  @IsNumber()
  @IsOptional()
  list_price_fixed?: number | null;
}
