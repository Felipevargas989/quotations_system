import { IsBoolean, IsOptional } from 'class-validator';

/** «Seguir» y «No es mi competidor» (decisión 70), o deshacerlos. */
export class MarcarCompetidorDto {
  @IsOptional()
  @IsBoolean()
  seguido?: boolean;

  @IsOptional()
  @IsBoolean()
  descartado?: boolean;
}
