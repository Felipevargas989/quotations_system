import { IsIn } from 'class-validator';

// El único dato que decide el cliente: cuál de los tres planes. Todo
// lo demás (empresa, correo) sale de su sesión — jamás del cuerpo.
export class SuscribirDto {
  @IsIn(['cotiza', 'gestiona', 'crece'], {
    message: 'Ese plan no existe',
  })
  plan: 'cotiza' | 'gestiona' | 'crece';
}
