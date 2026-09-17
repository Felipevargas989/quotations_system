import { IsEmail, IsIn, IsOptional, MaxLength } from 'class-validator';

// El cliente decide dos cosas: cuál de los tres planes, y con qué
// correo entra a Mercado Pago. Lo segundo existe porque el proveedor
// EXIGE que el correo de la suscripción sea el de la cuenta que paga
// (medido el 17-09: con otro correo, el checkout muere en "tu e-mail
// no coincide con el de la suscripción"). La empresa sale de la
// sesión — jamás del cuerpo.
export class SuscribirDto {
  @IsIn(['cotiza', 'gestiona', 'crece'], {
    message: 'Ese plan no existe',
  })
  plan: 'cotiza' | 'gestiona' | 'crece';

  /** El correo de la cuenta de Mercado Pago del que paga. Si no
   *  viene, se usa el del usuario de la sesión. */
  @IsOptional()
  @IsEmail({}, { message: 'Ese correo no parece válido' })
  @MaxLength(200)
  correo_mercado_pago?: string;
}
