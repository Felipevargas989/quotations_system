import { IsOptional, IsString, Matches } from 'class-validator';

// El personaje y el color de cada uno (migración 167, 27-10-2026). La
// lista de personajes vive en la app; acá solo se cuida la forma, la
// misma que exige el CHECK de la base. null = quitarlo y volver a la
// letra con el color automático.
export class UpdateAparienciaDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]{1,40}$/)
  personaje?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-f]{6}$/)
  color?: string | null;
}
