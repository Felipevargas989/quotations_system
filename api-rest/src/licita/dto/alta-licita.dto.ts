import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// EL ALTA DE LICITA (25-11). Lo único que manda el navegador es el nombre de
// la empresa: el correo y el nombre de la persona salen de Auth (con la
// llave de servicio), nunca del cuerpo. El motor rechaza campos de más
// (`forbidNonWhitelisted` en `main.ts`).
export class AltaLicitaDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Falta el nombre de la empresa' })
  // Mismo tope que el alta de Eventia (`SignupDto.company_name`).
  @MaxLength(120)
  nombre_empresa: string;
}
