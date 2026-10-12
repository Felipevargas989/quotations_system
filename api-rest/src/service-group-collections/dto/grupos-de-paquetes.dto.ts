import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// GRUPOS DE PAQUETES (12-10-2026, migración 120). El nombre se recorta en
// el service; acá solo se exige que venga algo.

export class NombreDeGrupoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;
}

/** El orden completo, de arriba abajo. Los id que no son de la empresa se
 *  descartan en el service. */
export class OrdenDeGruposDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  ids: number[];
}

/** Lo que se puede cambiar de un paquete ya creado: su nombre y su grupo.
 *  `package_group_id: null` lo saca de su grupo (queda en "Otros"). */
export class ActualizarPaqueteDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsInt()
  package_group_id?: number | null;
}
