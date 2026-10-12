import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

// GRUPOS DE MENÚS GUARDADOS (12-10-2026, migración 121). Cada categoría
// tiene sus grupos; el nombre se recorta en las reglas comunes.

export class CrearGrupoDeMenusDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  category: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;
}

export class NombreDeGrupoDeMenusDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;
}

/** El orden completo de UNA categoría, de arriba abajo. */
export class OrdenDeGruposDeMenusDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  category: string;

  @IsArray()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  ids: number[];
}

/** El grupo de un menú: un id de su misma categoría, o null para sacarlo
 *  de su grupo ("Otros"). Tiene que venir: si falta, es 400. */
export class AsignarGrupoDeMenuDto {
  @ValidateIf(
    (o: { menu_group_id?: number | null }) => o.menu_group_id !== null,
  )
  @IsInt()
  menu_group_id: number | null;
}
