import { SetMetadata } from '@nestjs/common';
import type { Permiso as NombreDePermiso } from './permisos';

// LOS PERMISOS DE CADA PUERTA (doc 22 §4.2, 05-11-2026). Van junto al
// `@Roles` de siempre, que se queda: es lo de hoy, y la prueba de fábrica
// exige que con todo de fábrica la cuenta dé exactamente ese `@Roles`.
//
// @Permiso('postventa', 'cotizaciones'): la puerta es de esas secciones. Se
// abre a todo cargo que tenga prendida alguna (una puerta que usan varias
// pantallas sigue abierta mientras el cargo tenga una).
//
// @DentroDe('postventa'): una acción fina dentro de esa sección. Exige el
// `@Roles` de hoy Y que el cargo la tenga prendida.
//
// El de la ruta manda sobre el del controlador, como `@Roles`. La cuenta
// la hace RolesGuard con `pasa` (auth/permisos.ts).
export const PERMISO_KEY = 'permiso';
export const DENTRO_DE_KEY = 'dentroDe';

export const Permiso = (...permisos: NombreDePermiso[]) =>
  SetMetadata(PERMISO_KEY, permisos);

export const DentroDe = (...permisos: NombreDePermiso[]) =>
  SetMetadata(DENTRO_DE_KEY, permisos);
