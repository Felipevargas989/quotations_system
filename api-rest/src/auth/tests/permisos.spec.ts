import { UserRole } from 'src/users/entities/user.entity';
import {
  CATALOGO_DE_PERMISOS,
  cambiaronSusTipos,
  cargosDeFabrica,
  claveDeTipo,
  pasa,
  permisosDelCargo,
  tipoDeFabrica,
  tiposQueTrabaja,
  trabajaElTipo,
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
      'boletas',
      // La caja de recepción (doc 19 §9.43, 09-11).
      'caja_recepcion',
    ]);
    // El Calendario del vendedor, prendido (Felipe, 05-11-2026). Las
    // boletas y facturas del tarifario, apagadas desde el 07-11 (doc 19
    // §9.23).
    expect(permisosDelCargo(UserRole.VENDEDOR)).toEqual([
      'requerimientos',
      'cotizaciones',
      'consultas',
      'clientes',
      'belia',
      'calendario',
    ]);
    // «Facturar eventos» (07-11): operaciones y el administrador.
    expect(permisosDelCargo(UserRole.OPERACIONES)).toEqual([
      'requerimientos',
      'cotizaciones',
      'consultas',
      'clientes',
      'belia',
      'calendario',
      'postventa',
      'proveedores',
      'boletas',
      'facturacion_eventos',
      'facturacion_documentos',
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
    const filas = [{ cargo: 'vendedor', permiso: 'boletitas', prendido: true }];
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

// LOS TIPOS DE CLIENTE DE CADA CARGO (doc 22 §9).
describe('Permisos por cargo: los tipos de cliente', () => {
  const TIPOS = [
    { id: 2, name: 'Particulares', es_particular: true },
    { id: 4, name: 'Empresas', es_particular: false },
  ];
  const fila = (cargo: string, id: number, prendido: boolean) => ({
    cargo,
    permiso: claveDeTipo(id),
    prendido,
  });

  it('de fábrica es lo de hoy: recepción, los particulares; los demás, todos', () => {
    expect(tipoDeFabrica(UserRole.RECEPCION, TIPOS[0])).toBe(true);
    expect(tipoDeFabrica(UserRole.RECEPCION, TIPOS[1])).toBe(false);
    expect(tipoDeFabrica(UserRole.VENDEDOR, TIPOS[1])).toBe(true);
    expect(tiposQueTrabaja(UserRole.VENDEDOR, TIPOS)).toBeNull();
    expect(tiposQueTrabaja(null, TIPOS)).toBeNull();
    const r = tiposQueTrabaja(UserRole.RECEPCION, TIPOS);
    expect(trabajaElTipo(r, ' PARTICULARES ')).toBe(true);
    expect(trabajaElTipo(r, 'Empresas')).toBe(false);
    expect(trabajaElTipo(r, null)).toBe(false);
  });

  it('un interruptor cambia lo de fábrica, y recepción con todo prendido sigue sin los sin tipo', () => {
    const v = tiposQueTrabaja(UserRole.VENDEDOR, TIPOS, [
      fila(UserRole.VENDEDOR, 4, false),
    ]);
    expect(trabajaElTipo(v, 'Empresas')).toBe(false);
    expect(trabajaElTipo(v, 'Particulares')).toBe(true);
    expect(trabajaElTipo(v, null)).toBe(true);
    expect(
      cambiaronSusTipos(UserRole.VENDEDOR, [fila('vendedor', 4, false)]),
    ).toBe(true);
    expect(
      cambiaronSusTipos(UserRole.OPERACIONES, [fila('vendedor', 4, false)]),
    ).toBe(false);
    const r = tiposQueTrabaja(UserRole.RECEPCION, TIPOS, [
      fila(UserRole.RECEPCION, 4, true),
    ]);
    expect(r).not.toBeNull();
    expect(trabajaElTipo(r, 'Empresas')).toBe(true);
    expect(trabajaElTipo(r, 'Otro')).toBe(false);
  });

  it('una empresa sin tipos: recepción no trabaja ninguno, los demás todo', () => {
    expect(trabajaElTipo(tiposQueTrabaja(UserRole.RECEPCION, []), 'X')).toBe(
      false,
    );
    expect(tiposQueTrabaja(UserRole.ADMINISTRADOR, [])).toBeNull();
  });
});
