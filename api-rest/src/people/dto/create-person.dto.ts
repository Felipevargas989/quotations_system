import {
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Validate,
  ValidateIf,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { mensajeRut, revisarRut } from '../utils/rut';

/** El RUT se revisa de verdad: forma, dígito verificador (módulo 11) y
 *  los reservados que pasan la matemática pero no son de nadie. */
@ValidatorConstraint({ name: 'rutChileno', async: false })
export class RutChileno implements ValidatorConstraintInterface {
  validate(valor: string) {
    return typeof valor === 'string' && revisarRut(valor) === null;
  }
  defaultMessage(args?: ValidationArguments) {
    return mensajeRut(revisarRut(String(args?.value ?? '')));
  }
}

export class CreatePersonDto {
  @IsString()
  @IsNotEmpty({ message: 'Falta el nombre' })
  @MaxLength(120)
  name: string;

  // El RUT es opcional al crear: a veces se carga a la persona antes de
  // tenerlo. Pero si viene, tiene que estar bien — y no se puede repetir
  // dentro de la empresa (eso lo cuida la base).
  @ValidateIf((o: { rut?: string | null }) => !!o.rut)
  @Validate(RutChileno)
  rut?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @ValidateIf((o: { email?: string | null }) => !!o.email)
  @IsEmail({}, { message: 'Ese correo no se ve bien' })
  email?: string;

  // Código de institución de la CMF: 3 dígitos CON los ceros adelante.
  @ValidateIf((o: { bank_code?: string | null }) => !!o.bank_code)
  @Matches(/^[0-9]{3}$/, { message: 'El banco no es de la lista' })
  bank_code?: string;

  @ValidateIf((o: { account_type?: string | null }) => !!o.account_type)
  @IsIn(['cuenta_rut', 'corriente', 'vista', 'ahorro'], {
    message: 'Ese tipo de cuenta no existe',
  })
  account_type?: string;

  // SOLO DÍGITOS. Sin puntos, sin guiones, sin espacios — y guardado como
  // texto, porque hay cuentas chilenas reales que parten en 0051 y como
  // número se perderían esos ceros. El rango es ancho a propósito: no
  // existe un largo fijo, Santander tiene cuentas de 8 y de 10 dígitos.
  @ValidateIf((o: { account_number?: string | null }) => !!o.account_number)
  @Matches(/^[0-9]{5,20}$/, {
    message: 'La cuenta va solo con números, sin puntos ni guiones',
  })
  account_number?: string;

  @IsInt()
  @IsOptional()
  default_role_id?: number;

  @IsIn(['planta', 'freelance'])
  @IsOptional()
  default_kind?: string;

  // El horario habitual (opcional): se usa al asignar un día si no se
  // indica otro. Sin él rige el estándar 09:00–19:00 con 1 h de colación.
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  default_starts_at?: string | null;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  default_ends_at?: string | null;

  @IsOptional()
  @IsInt()
  default_break_minutes?: number | null;

  // Días libres semanales (0=domingo..6=sábado): la carga automática de
  // planta se los salta.
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  days_off?: number[] | null;

  @IsIn(['activa', 'no_disponible', 'bloqueada'])
  @IsOptional()
  status?: string;

  // Bloquear sin decir por qué no sirve de nada: en ocho meses nadie se
  // acuerda. La base también lo exige.
  @ValidateIf((o: { status?: string }) => o.status === 'bloqueada')
  @IsString()
  @IsNotEmpty({ message: 'Para bloquear hay que decir por qué' })
  blocked_reason?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
