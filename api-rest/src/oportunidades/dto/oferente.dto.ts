import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { TIPOS_DE_DOCUMENTO } from '../oferente/oferente.service';

/** Los datos de la empresa como oferente (doc 17 §5.5). Vacío = borrar el
 *  dato. El nombre y los datos bancarios NO van aquí: viven en
 *  Configuración de empresa. */
export class GuardarOferenteDto {
  @IsOptional() @IsString() @MaxLength(200) razon_social?: string;
  @IsOptional() @IsString() @MaxLength(20) rut?: string;
  @IsOptional() @IsString() @MaxLength(200) giro?: string;
  @IsOptional() @IsString() @MaxLength(300) direccion?: string;
  @IsOptional() @IsString() @MaxLength(100) comuna?: string;
  @IsOptional() @IsString() @MaxLength(100) region?: string;
  @IsOptional() @IsString() @MaxLength(40) telefono?: string;
  @IsOptional() @IsString() @MaxLength(200) correo?: string;
  @IsOptional() @IsString() @MaxLength(200) representante_nombre?: string;
  @IsOptional() @IsString() @MaxLength(20) representante_rut?: string;
  @IsOptional() @IsString() @MaxLength(100) representante_cargo?: string;
  @IsOptional() @IsString() @MaxLength(5000) experiencia?: string;
  @IsOptional() @IsString() @MaxLength(5000) instalaciones?: string;
}

/** Los campos que acompañan un documento de la carpeta (multipart). */
export class SubirDocumentoDto {
  @IsIn(TIPOS_DE_DOCUMENTO)
  tipo!: string;

  /** AAAA-MM-DD; vacío = no vence. */
  @IsOptional()
  @Matches(/^(\d{4}-\d{2}-\d{2})?$/, {
    message: 'La fecha de vencimiento va como AAAA-MM-DD.',
  })
  vence?: string;
}
