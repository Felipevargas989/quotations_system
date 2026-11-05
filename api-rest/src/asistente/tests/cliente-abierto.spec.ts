import { QuotationStatus } from 'src/quotations/constants/constants';
import { UserRole } from 'src/users/entities/user.entity';
import type {
  AsistenteRepository,
  CotizacionDeCliente,
  FilaDeCliente,
} from '../asistente.repository';
import {
  ULTIMAS_DEL_CLIENTE_ABIERTO,
  clienteAbierto,
} from '../conversacion/cliente-abierto';

// La ficha del cliente abierto (doc 20 §17, mejora 2): el cliente se lee con
// la empresa de la sesión, viaja con sus cotizaciones más nuevas y, para
// recepción, sin plata.

const RUDEL: FilaDeCliente = {
  id: 'c-rudel',
  name: 'Rudel',
  client_type: 'empresa',
  email: 'compras@rudel.cl',
  phone: '+56911111111',
  contact_person: 'Paula',
} as FilaDeCliente;

const cotizacion = (n: number): CotizacionDeCliente =>
  ({
    id: `q${n}`,
    client_id: 'c-rudel',
    quotation_number: n,
    quotation_status:
      n % 2 ? QuotationStatus.ACEPTADA : QuotationStatus.RECHAZADA,
    event_type: 'Estadía',
    event_date: '2026-11-09T00:00:00+00:00',
    total_amount: 1_000_000 + n,
  }) as CotizacionDeCliente;

const repositorio = (cliente: FilaDeCliente | null) => ({
  clienteDeLaEmpresa: jest.fn().mockResolvedValue(cliente),
  cotizacionesDeClientes: jest
    .fn()
    .mockResolvedValue(
      Array.from({ length: 14 }, (_, i) => cotizacion(500 - i)),
    ),
});

type Ficha = {
  nombre: string;
  cotizaciones: number;
  ganadas: number;
  ultimas: Array<{ numero: number; total?: string; enlace?: string }>;
};

const fichaDe = (bloque: string): Ficha =>
  JSON.parse(bloque.slice(bloque.indexOf('\n') + 1)) as Ficha;

describe('clienteAbierto', () => {
  it('lee el cliente con la empresa de la sesión y trae sus cotizaciones más nuevas', async () => {
    const repo = repositorio(RUDEL);
    const r = await clienteAbierto(
      repo as unknown as AsistenteRepository,
      1,
      'c-rudel',
      UserRole.VENDEDOR,
    );
    expect(repo.clienteDeLaEmpresa).toHaveBeenCalledWith(1, 'c-rudel');
    expect(repo.cotizacionesDeClientes).toHaveBeenCalledWith(1, ['c-rudel']);
    expect(r?.texto).toBe('la ficha del cliente Rudel');
    expect(r?.bloque).toMatch(/^FICHA DEL CLIENTE QUE TIENE ABIERTO/);
    const ficha = fichaDe(r!.bloque);
    expect(ficha.nombre).toBe('Rudel');
    expect(ficha.cotizaciones).toBe(14);
    expect(ficha.ultimas).toHaveLength(ULTIMAS_DEL_CLIENTE_ABIERTO);
    expect(ficha.ultimas[0].numero).toBe(500);
    expect(ficha.ultimas[0].total).toBeDefined();
    expect(ficha.ultimas[0].enlace).toBeDefined();
  });

  it('un cliente de otra empresa no existe: no se lee nada más', async () => {
    const repo = repositorio(null);
    const r = await clienteAbierto(
      repo as unknown as AsistenteRepository,
      1,
      'c-de-otra',
      UserRole.ADMINISTRADOR,
    );
    expect(r).toBeNull();
    expect(repo.cotizacionesDeClientes).not.toHaveBeenCalled();
  });

  it('a recepción le llega sin el total ni el enlace', async () => {
    const r = await clienteAbierto(
      repositorio(RUDEL) as unknown as AsistenteRepository,
      1,
      'c-rudel',
      UserRole.RECEPCION,
    );
    const ficha = fichaDe(r!.bloque);
    expect(ficha.ultimas[0].total).toBeUndefined();
    expect(ficha.ultimas[0].enlace).toBeUndefined();
    expect(r!.bloque).not.toMatch(/\$/);
  });
});
