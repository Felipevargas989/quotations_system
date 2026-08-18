import {
  IsBoolean,
  IsNotEmpty,
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

  // Sin valor por cargo (Felipe, 17-08): el monto vive en cada silla,
  // día a día. La columna sigue en la tabla porque la comparten los
  // arriendos, que sí llevan precio; Personal simplemente no la toca.
}
