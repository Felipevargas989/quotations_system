import { SetMetadata } from '@nestjs/common';
import { UserRole } from 'src/users/entities/user.entity';

// Fase 3 (28-07): el CARGO se aplica en el backend, no solo en pantalla.
//
// @Roles(...) declara qué cargos pueden usar una ruta (o un controller
// completo). El que manda es RolesGuard. La matriz espejo vive en el
// frontend (constants/permissions.ts) — si se cambia un lado, se cambia
// el otro.
//
// Grupos de conveniencia, mismos nombres que el frontend:
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export const ADMIN_ONLY = [UserRole.ADMINISTRADOR];
export const OPERATIONS_AND_UP = [UserRole.OPERACIONES, UserRole.ADMINISTRADOR];
export const SALES_AND_UP = [
  UserRole.VENDEDOR,
  UserRole.OPERACIONES,
  UserRole.ADMINISTRADOR,
];

// Todo el que atiende al cliente, recepción incluida (12-08). Espejo
// de ROLE_GROUPS.RECEPTION_AND_UP en el frontend: los dos lados tienen
// que decir lo mismo o la pantalla muestra algo que el servidor niega.
export const RECEPTION_AND_UP = [UserRole.RECEPCION, ...SALES_AND_UP];
