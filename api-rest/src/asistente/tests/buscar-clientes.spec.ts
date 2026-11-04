import { QuotationStatus } from 'src/quotations/constants/constants';
import { UserRole, type User } from 'src/users/entities/user.entity';
import type { FilaDeCliente } from '../asistente.repository';
import { buscarClientes, calzaCliente } from '../herramientas/buscar-clientes';
import type { ContextoDeHerramienta } from '../herramientas/comun';

// BUSCAR CLIENTES COMO EL BUSCADOR DE LA CASA, Y VARIOS DE UNA VEZ
// (04-11-2026: una pregunta buscó 24 clientes, uno por uno).

const cliente = (
  id: string,
  name: string,
  contact_person: string | null = null,
): FilaDeCliente => ({
  id,
  name,
  contact_person,
  client_type: 'Empresa',
  email: null,
  phone: null,
});

const CLIENTES = [
  cliente('c1', 'Universidad de Concepción'),
  cliente(
    'c2',
    'Hospital Comunitario de Salud Familiar de Bulnes',
    'Nicol Aedo',
  ),
  cliente('c3', 'Matías Pérez'),
  cliente('c4', 'Ecofor'),
];

const usuario = (role: UserRole): User =>
  ({ id: 'u1', company_id: 1, role }) as unknown as User;

const contexto = (role = UserRole.VENDEDOR) => {
  const repositorio = {
    clientesDeLaEmpresa: jest.fn().mockResolvedValue(CLIENTES),
    cotizacionesDeClientes: jest.fn().mockResolvedValue([
      {
        id: 'q1',
        client_id: 'c2',
        quotation_number: 739,
        quotation_status: QuotationStatus.ENVIADA,
        event_type: 'Paseo fin de año',
        event_date: '2026-12-26T00:00:00+00:00',
        total_amount: 4_430_000,
      },
    ]),
  };
  const ctx = {
    usuario: usuario(role),
    repositorio,
  } as unknown as ContextoDeHerramienta;
  return { ctx, repositorio };
};

describe('calzaCliente', () => {
  it('sin tildes y por palabras, en cualquier orden', () => {
    expect(calzaCliente('matias', CLIENTES[2])).toBe(true);
    expect(calzaCliente('concepcion universidad', CLIENTES[0])).toBe(true);
    expect(calzaCliente('bulnes hospital', CLIENTES[1])).toBe(true);
  });

  it('también por el contacto, y todas las palabras tienen que estar', () => {
    expect(calzaCliente('nicol aedo', CLIENTES[1])).toBe(true);
    expect(calzaCliente('hospital rudel', CLIENTES[1])).toBe(false);
    expect(calzaCliente('rudel', CLIENTES[3])).toBe(false);
  });
});

describe('buscar_clientes', () => {
  it('un nombre: como siempre, con la lista y sus últimas cotizaciones', async () => {
    const { ctx } = contexto();
    const r = (await buscarClientes.ejecutar({ texto: 'bulnes' }, ctx)) as {
      encontrados: number;
      clientes: Array<{ id: string; ultimas: unknown[] }>;
    };
    expect(r.encontrados).toBe(1);
    expect(r.clientes[0]).toMatchObject({ id: 'c2' });
    expect(r.clientes[0].ultimas[0]).toMatchObject({
      numero: 739,
      total: '$4.430.000',
    });
  });

  it('varios nombres: una sola lectura de la base, cada uno con lo suyo', async () => {
    const { ctx, repositorio } = contexto();
    const r = (await buscarClientes.ejecutar(
      { textos: ['matias', 'ecofor', 'nadie'] },
      ctx,
    )) as {
      busquedas: Array<{
        texto: string;
        encontrados: number;
        clientes: Array<{ id: string }>;
      }>;
    };
    expect(repositorio.clientesDeLaEmpresa).toHaveBeenCalledTimes(1);
    expect(repositorio.cotizacionesDeClientes).toHaveBeenCalledTimes(1);
    expect(repositorio.cotizacionesDeClientes).toHaveBeenCalledWith(1, [
      'c3',
      'c4',
    ]);
    expect(r.busquedas.map((b) => [b.texto, b.encontrados])).toEqual([
      ['matias', 1],
      ['ecofor', 1],
      ['nadie', 0],
    ]);
  });

  it('a recepción, sin el total ni el enlace', async () => {
    const { ctx } = contexto(UserRole.RECEPCION);
    const r = (await buscarClientes.ejecutar({ texto: 'bulnes' }, ctx)) as {
      clientes: Array<{ ultimas: Array<Record<string, unknown>> }>;
    };
    expect(r.clientes[0].ultimas[0]).not.toHaveProperty('total');
    expect(r.clientes[0].ultimas[0]).not.toHaveProperty('enlace');
  });

  it('sin nombre, avisa', async () => {
    const { ctx } = contexto();
    await expect(
      buscarClientes.ejecutar({ textos: ['', 'a'] }, ctx),
    ).rejects.toThrow('Falta el nombre');
  });
});
