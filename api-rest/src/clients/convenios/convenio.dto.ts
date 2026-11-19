import {
  Equals,
  IsDateString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Validate,
} from 'class-validator';
import { RutChileno } from 'src/people/dto/create-person.dto';

/** «Enviar convenio»: a qué persona del cliente. */
export class EnviarConvenioDto {
  @IsInt()
  contact_id: number;
}

/** «Subir firmado»: el PDF ya subido por la puerta única y la fecha. */
export class FirmadoEnPapelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  file_url: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  file_name: string;

  @IsDateString({}, { message: 'Falta la fecha de la firma' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha va como aaaa-mm-dd' })
  fecha_firma: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  firmante?: string;
}

/** Un documento del cliente ya subido por la puerta única. */
export class AgregarDocumentoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  file_url: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  file_name: string;
}

/** El formulario de la página pública (doc 24 §B). */
export class AceptarConvenioDto {
  @IsString({ message: 'Falta la razón social' })
  @IsNotEmpty({ message: 'Falta la razón social' })
  @MaxLength(150)
  razon_social: string;

  @Validate(RutChileno)
  rut_empresa: string;

  @IsString({ message: 'Falta el nombre del representante' })
  @IsNotEmpty({ message: 'Falta el nombre del representante' })
  @MaxLength(120)
  representante_nombre: string;

  @Validate(RutChileno)
  representante_rut: string;

  @IsString({ message: 'Falta el cargo' })
  @IsNotEmpty({ message: 'Falta el cargo' })
  @MaxLength(80)
  representante_cargo: string;

  @IsEmail({}, { message: 'Ese correo no se ve bien' })
  @MaxLength(200)
  correo: string;

  @IsString({ message: 'Falta el domicilio' })
  @IsNotEmpty({ message: 'Falta el domicilio' })
  @MaxLength(200)
  domicilio: string;

  @IsString({ message: 'Falta la comuna' })
  @IsNotEmpty({ message: 'Falta la comuna' })
  @MaxLength(80)
  comuna: string;

  @IsString({ message: 'Falta la región' })
  @IsNotEmpty({ message: 'Falta la región' })
  @MaxLength(80)
  region: string;

  // La personería: opcional; vacía queda como línea en blanco en el PDF.
  @IsOptional()
  @IsString()
  @MaxLength(150)
  personeria_documento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  personeria_fecha?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  personeria_notario?: string;

  @Equals(true, {
    message: 'Para aceptar hay que marcar «Leí el convenio y lo acepto»',
  })
  acepto: boolean;
}
