import { UserRole } from 'src/users/entities/user.entity';
import {
  CATALOGO_DE_PERMISOS,
  cargosDeFabrica,
  pasa,
  permisosDelCargo,
} from '../permisos';

// LA CUENTA DE LOS PERMISOS POR CARGO (doc 22, 05-11-2026).
describe('Permisos por cargo: la cuenta', () => {
  it('de fábrica, cada cargo con sus secciones de hoy', () => {
    expect(permisosDelCargo(UserRole.RECEPCION)).toEqual([
      'requerimientos',
      'cotizaciones',
      'consultas',
      'belia',
      'calendario',
    ]);
    // El Calendario del vendedor, prendido (Felipe, 05-11-2026).
    expect(permisosDelCargo(UserRole.VENDEDOR)).toEqual([
      'requerimientos',
      'cotizaciones',
      'consultas',
      'clientes',
      'belia',
      'calendario',
    ]);
    expect(permisosDelCargo(UserRole.OPERACIONES)).toEqual([
      'requerimientos',
      'cotizaciones',
      'consultas',
      'clientes',
      'belia',
      'calendario',
      'postventa',
      'proveedores',
    ]);
    expect(permisosDelCargo(UserRole.ADMINISTRADOR)).toEqual(
      CATALOGO_DE_PERMISOS.map((p) => p.clave),
    );
  });

  it('lo que la empresa apartó de fábrica manda', () => {
    const filas = [
      { cargo: 'recepcion', permiso: 'cotizaciones', prendido: false },
      { cargo: 'recepcion', permiso: 'clientes', prendido: true },
      // De otro cargo: no le toca.
      { cargo: 'vendedor', permiso: 'catalogo', prendido: true },
    ];
    const recepcion = permisosDelCargo(UserRole.RECEPCION, filas);
    expect(recepcion).not.toContain('cotizaciones');
    expect(recepcion).toContain('clientes');
    expect(recepcion).not.toContain('catalogo');
  });

  it('Mi empresa y Usuarios no se mueven, digan lo que digan las filas', () => {
    const filas = [
      { cargo: 'administrador', permiso: 'usuarios', prendido: false },
      { cargo: 'administrador', permiso: 'mi_empresa', prendido: false },
      { cargo: 'vendedor', permiso: 'usuarios', prendido: true },
    ];
    expect(permisosDelCargo(UserRole.ADMINISTRADOR, filas)).toEqual(
      expect.arrayContaining(['usuarios', 'mi_empresa']),
    );
    expect(permisosDelCargo(UserRole.VENDEDOR, filas)).not.toContain(
      'usuarios',
    );
  });

  it('una fila de un permiso que no existe no cuenta, y sin cargo no hay ninguno', () => {
    const filas = [{ cargo: 'vendedor', permiso: 'boletas', prendido: true }];
    expect(permisosDelCargo(UserRole.VENDEDOR, filas)).toEqual(
      permisosDelCargo(UserRole.VENDEDOR),
    );
    expect(permisosDelCargo(undefined)).toEqual([]);
    expect(permisosDelCargo('desconocido')).toEqual([]);
  });

  it('pasa: @Permiso abre por sección, @DentroDe exige también el cargo', () => {
    const OA = ['operaciones', 'administrador'];
    expect(
      pasa('vendedor', ['postventa'], { roles: OA, permiso: ['postventa'] }),
    ).toBe(true);
    expect(pasa('operaciones', [], { roles: OA, permiso: ['postventa'] })).toBe(
      false,
    );
    expect(
      pasa('vendedor', ['postventa'], { roles: OA, dentroDe: ['postventa'] }),
    ).toBe(false);
    expect(
      pasa('operaciones', ['postventa'], {
        roles: OA,
        dentroDe: ['postventa'],
      }),
    ).toBe(true);
    // Sin permisos: solo el @Roles, como siempre.
    expect(pasa('vendedor', [], { roles: OA })).toBe(false);
    expect(pasa('vendedor', [], {})).toBe(true);
    expect(pasa(undefined, ['postventa'], { permiso: ['postventa'] })).toBe(
      false,
    );
  });

  it('cargosDeFabrica sale en el orden de los grupos de @Roles', () => {
    expect(cargosDeFabrica({ permiso: ['clientes'] })).toEqual([
      UserRole.VENDEDOR,
      UserRole.OPERACIONES,
      UserRole.ADMINISTRADOR,
    ]);
  });
});
