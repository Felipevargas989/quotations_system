import { permisosDelCargo } from 'src/auth/permisos';
import { UserRole, type User } from 'src/users/entities/user.entity';
import { herramientasPara } from '../herramientas';

// BELIA CON LOS PERMISOS POR CARGO (doc 22, 05-11-2026): apagar una sección
// le saca también a BelIA lo que lee de ella. Que de fábrica nada cambie lo
// prueba auth/tests/permisos-de-fabrica.spec.ts.
const DERECHOS = [
  'base',
  'calendario',
  'post_venta',
  'logistica',
  'personal',
  'asistente',
];

const nombres = (role: UserRole, sin: string[] = [], con: string[] = []) =>
  herramientasPara({
    role,
    derechos: DERECHOS,
    permisos: [
      ...permisosDelCargo(role).filter((p) => !sin.includes(p)),
      ...con,
    ],
  } as unknown as User).map((h) => h.nombre);

describe('BelIA y los permisos por cargo', () => {
  it('apagarle Post-Venta a operaciones le saca los pagos y la cobranza', () => {
    expect(nombres(UserRole.OPERACIONES)).toContain('pagos_del_evento');
    const sin = nombres(UserRole.OPERACIONES, ['postventa']);
    expect(sin).not.toContain('pagos_del_evento');
    expect(sin).not.toContain('cobranza');
    expect(sin).toContain('insumos');
  });

  it('apagarle el Calendario a recepción le saca el calendario', () => {
    expect(nombres(UserRole.RECEPCION, ['calendario'])).not.toContain(
      'calendario',
    );
  });

  it('prenderle Post-Venta a un vendedor le da los pagos, como en la pantalla', () => {
    expect(nombres(UserRole.VENDEDOR, [], ['postventa'])).toContain(
      'pagos_del_evento',
    );
  });

  it('las que proponen siguen con su cargo: prenderle Clientes a recepción no le da corregir clientes', () => {
    expect(nombres(UserRole.RECEPCION, [], ['clientes'])).not.toContain(
      'proponer_cambio_de_cliente',
    );
    expect(nombres(UserRole.VENDEDOR, ['clientes'])).not.toContain(
      'proponer_cambio_de_cliente',
    );
  });
});
