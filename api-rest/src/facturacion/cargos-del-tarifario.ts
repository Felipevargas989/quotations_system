import { OPERATIONS_AND_UP } from 'src/auth/roles.decorator';
import { UserRole } from 'src/users/entities/user.entity';

// LOS CARGOS QUE EMITEN CON EL TARIFARIO, DE FÁBRICA (doc 19 §9.23).
//
// Felipe, 07-11: *"el recepcionista solamente puede emitir boletas y
// facturas de cabañas según el tarifario"*. Recepción, operaciones y el
// administrador; el vendedor ya no, y la empresa lo prende en Permisos por
// cargo si lo necesita. Es el `@Roles` de las puertas con
// `@Permiso('boletas')`: la prueba de fábrica exige que diga lo mismo que el
// catálogo (`auth/permisos.ts`).
export const DEL_TARIFARIO = [UserRole.RECEPCION, ...OPERATIONS_AND_UP];
