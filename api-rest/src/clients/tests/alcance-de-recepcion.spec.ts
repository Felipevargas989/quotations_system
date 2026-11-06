import { ForbiddenException } from '@nestjs/common';
import {
  claveDeTipo,
  tiposQueTrabaja,
  type FilaDePermiso,
} from 'src/auth/permisos';
import type { PermisosService } from 'src/auth/permisos.service';
import { UserRole } from 'src/users/entities/user.entity';
import {
  AlcanceDeRecepcion,
  revisarLoQueCotiza,
  sinMontosDelResumen,
} from '../alcance-de-recepcion';
import type { ClientsRepository } from '../clients.repository';

// LO QUE VE RECEPCIÓN DE LAS COTIZACIONES (doc 21, 04-11-2026): todos los
// requerimientos y, de las cotizaciones, solo las de clientes particulares;
// vendedor para arriba, todo. Desde el doc 22 §9, eso es lo de fábrica: los
// interruptores de cada tipo y cargo lo cambian (al final).

const recepcion = { role: UserRole.RECEPCION, company_id: 1 };
const vendedor = { role: UserRole.VENDEDOR, company_id: 1 };

const TIPOS = [
  { id: 2, name: 'Particulares', es_particular: true },
  { id: 4, name: 'Empresas', es_particular: false },
  { id: 7, name: 'Club Adulto Mayor', es_particular: false },
  { id: 3, name: 'Tour Operadores', es_particular: false },
  { id: 5, name: 'Iglesias', es_particular: false },
];

/** Sin la pieza de los permisos: lo de fábrica, leído de la base. */
const armar = () => {
  const repositorio = {
    tiposConMarca: jest.fn().mockResolvedValue(TIPOS),
    clienteDeLaCotizacion: jest.fn(),
    tipoDelCliente: jest.fn(),
    clientesDeLasCotizaciones: jest.fn(),
    cotizacionDeLaFila: jest.fn(),
  };
  const alcance = new AlcanceDeRecepcion(
    repositorio as unknown as ClientsRepository,
  );
  return { alcance, repositorio };
};

/** Con los interruptores de la empresa (lo que apartó de fábrica). */
const conInterruptores = (filas: FilaDePermiso[]) => {
  const { repositorio } = armar();
  const permisos = {
    tiposDe: jest.fn().mockResolvedValue(TIPOS),
    tiposDelCargo: jest.fn((_empresa: number, cargo?: string | null) =>
      Promise.resolve(tiposQueTrabaja(cargo, TIPOS, filas)),
    ),
  };
  const alcance = new AlcanceDeRecepcion(
    repositorio as unknown as ClientsRepository,
    permisos as unknown as PermisosService,
  );
  return { alcance, repositorio, permisos };
};

const cotizacion = (tipo: string | null, request_type = 'cotizacion') => ({
  request_type,
  clients: { client_type: tipo },
});

describe('AlcanceDeRecepcion', () => {
  it('recepción ve los requerimientos de todos y las cotizaciones de particulares', async () => {
    const { alcance } = armar();
    expect(await alcance.ve(recepcion, cotizacion('Particulares'))).toBe(true);
    expect(await alcance.ve(recepcion, cotizacion(' particulares '))).toBe(
      true,
    );
    expect(await alcance.ve(recepcion, cotizacion('Empresas'))).toBe(false);
    expect(await alcance.ve(recepcion, cotizacion('Club Adulto Mayor'))).toBe(
      false,
    );
    expect(await alcance.ve(recepcion, cotizacion(null))).toBe(false);
    expect(
      await alcance.ve(recepcion, cotizacion('Empresas', 'requerimiento')),
    ).toBe(true);
  });

  it('vendedor para arriba ve todo, sin preguntarle a la base', async () => {
    const { alcance, repositorio } = armar();
    expect(await alcance.ve(vendedor, cotizacion('Empresas'))).toBe(true);
    expect(await alcance.veLosMontos(vendedor, 'Empresas')).toBe(true);
    expect(repositorio.tiposConMarca).not.toHaveBeenCalled();
  });

  it('el tablero de recepción: requerimientos y particulares', async () => {
    const { alcance } = armar();
    const filas = [
      { id: 'a', ...cotizacion('Particulares') },
      { id: 'b', ...cotizacion('Empresas') },
      { id: 'c', ...cotizacion('Empresas', 'requerimiento') },
      { id: 'd', ...cotizacion('Tour Operadores') },
    ];
    const vistas = await alcance.filtrar(recepcion, filas);
    expect(vistas.map((f) => f.id)).toEqual(['a', 'c']);
    expect(await alcance.filtrar(vendedor, filas)).toHaveLength(4);
  });

  it('el calendario de recepción: todos los eventos, los demás sin plata', async () => {
    const { alcance } = armar();
    const filas = [
      {
        id: 'a',
        total_amount: 900_000,
        ...cotizacion('Particulares'),
      },
      {
        id: 'b',
        quotation_number: 408,
        quotation_status: 'aceptada',
        event_date: '2026-12-20',
        people_count: 120,
        total_amount: 21_844_000,
        discount_amount: 500_000,
        observations: '$182.000 por persona',
        request_type: 'cotizacion',
        clients: { name: 'FEPASA', client_type: 'Empresas', phone: '+569' },
      },
    ];
    const vistas = await alcance.paraElCalendario(recepcion, filas);
    expect(vistas[0]).toBe(filas[0]);
    expect(vistas[1]).toEqual({
      solo_agenda: true,
      id: 'b',
      quotation_number: 408,
      quotation_status: 'aceptada',
      event_date: '2026-12-20',
      people_count: 120,
      request_type: 'cotizacion',
      clients: { name: 'FEPASA' },
    });
    expect(await alcance.paraElCalendario(vendedor, filas)).toBe(filas);
  });

  it('con la pieza de los permisos, los tipos los recuerda ella', async () => {
    const { alcance, repositorio, permisos } = conInterruptores([]);
    await alcance.ve(recepcion, cotizacion('Particulares'));
    expect(await alcance.particulares(1)).toEqual(new Set(['particulares']));
    expect(permisos.tiposDelCargo).toHaveBeenCalledWith(1, UserRole.RECEPCION);
    expect(permisos.tiposDe).toHaveBeenCalledWith(1);
    expect(repositorio.tiposConMarca).not.toHaveBeenCalled();
  });

  it('sin ningún tipo marcado, recepción sigue con solo requerimientos', async () => {
    const { alcance, repositorio } = armar();
    repositorio.tiposConMarca.mockResolvedValue(
      TIPOS.map((t) => ({ ...t, es_particular: false })),
    );
    expect(await alcance.ve(recepcion, cotizacion('Particulares'))).toBe(false);
    expect(
      await alcance.ve(recepcion, cotizacion('Particulares', 'requerimiento')),
    ).toBe(true);
  });

  it('para cotizar: la cotización y el cliente tienen que ser de particulares', async () => {
    const { alcance, repositorio } = armar();
    repositorio.clienteDeLaCotizacion.mockResolvedValue({
      request_type: 'cotizacion',
      client_type: 'Empresas',
    });
    await expect(alcance.exigirElTipo(recepcion, 'q1')).rejects.toThrow(
      '«Empresas»',
    );
    repositorio.clienteDeLaCotizacion.mockResolvedValue({
      request_type: 'requerimiento',
      client_type: 'Particulares',
    });
    await expect(
      alcance.exigirElTipo(recepcion, 'q1'),
    ).resolves.toBeUndefined();
    // Una de otra empresa no existe para ella.
    repositorio.clienteDeLaCotizacion.mockResolvedValue(null);
    await expect(alcance.exigirElTipo(recepcion, 'q9')).rejects.toThrow(
      ForbiddenException,
    );
    expect(repositorio.clienteDeLaCotizacion).toHaveBeenCalledWith(1, 'q9');
    repositorio.tipoDelCliente.mockResolvedValue('Iglesias');
    await expect(
      alcance.exigirElTipoDelCliente(recepcion, 'c1'),
    ).rejects.toThrow('«Iglesias»');
    await expect(
      alcance.exigirElTipoDelCliente(vendedor, 'c1'),
    ).resolves.toBeUndefined();
  });

  it('sin descuento y sin aceptar, anular ni marcar realizada', () => {
    expect(() => revisarLoQueCotiza({ discount_percentage: 5 })).toThrow(
      'descuentos',
    );
    expect(() => revisarLoQueCotiza({ discount_amount: 10_000 })).toThrow(
      'descuentos',
    );
    for (const estado of ['aceptada', 'cancelada', 'realizada']) {
      expect(() => revisarLoQueCotiza({ quotation_status: estado })).toThrow(
        'operaciones',
      );
    }
    expect(() =>
      revisarLoQueCotiza({
        quotation_status: 'enviada',
        discount_percentage: 0,
      }),
    ).not.toThrow();
    expect(() =>
      revisarLoQueCotiza({ quotation_status: 'rechazada' }),
    ).not.toThrow();
  });

  it('al editar, el descuento que ya dio quien vende se mantiene, pero no sube', () => {
    const guardada = {
      discount_percentage: 10,
      discount_amount: 0,
      quotation_status: 'enviada',
    };
    // El cotizador vuelve a mandar el mismo 10 %: no es un descuento nuevo.
    expect(() =>
      revisarLoQueCotiza(
        { discount_percentage: 10, discount_amount: 0 },
        guardada,
      ),
    ).not.toThrow();
    expect(() =>
      revisarLoQueCotiza({ discount_percentage: 5 }, guardada),
    ).not.toThrow();
    expect(() =>
      revisarLoQueCotiza({ discount_percentage: 12 }, guardada),
    ).toThrow('descuentos');
    expect(() => revisarLoQueCotiza({ discount_amount: 1 }, guardada)).toThrow(
      'descuentos',
    );
    // Lo guardado puede venir como texto (numeric de la base).
    expect(() =>
      revisarLoQueCotiza(
        { discount_amount: 20_000 },
        { discount_amount: '20000' },
      ),
    ).not.toThrow();
  });

  it('al editar, el estado se revisa solo si cambia; reabrir una anulada, tampoco', () => {
    const anulada = { quotation_status: 'cancelada' };
    expect(() =>
      revisarLoQueCotiza({ quotation_status: 'cancelada' }, anulada),
    ).not.toThrow();
    expect(() =>
      revisarLoQueCotiza({ quotation_status: 'enviada' }, anulada),
    ).toThrow('operaciones');
    expect(() =>
      revisarLoQueCotiza(
        { quotation_status: 'aceptada' },
        { quotation_status: 'enviada' },
      ),
    ).toThrow('operaciones');
    expect(() =>
      revisarLoQueCotiza(
        { quotation_status: 'en_negociacion' },
        { quotation_status: 'rechazada' },
      ),
    ).not.toThrow();
  });

  it('el resumen de un cliente que no es particular llega sin plata', () => {
    const r = sinMontosDelResumen({
      client: { id: 'c1' },
      quotations: [{ quotation_number: 408, total_amount: 21_844_000 }],
      pendingPayments: [{ amount: 5_000_000 }],
    });
    expect(r.quotations).toEqual([
      { quotation_number: 408, total_amount: null },
    ]);
    expect(r.pendingPayments).toEqual([]);
  });
});

// LA LISTA CON LOS PERMISOS POR CARGO (doc 22 §4.4, 05-11-2026): las dos
// reglas van en esta misma pieza, nunca por un camino aparte.
describe('AlcanceDeRecepcion: la lista con los permisos por cargo', () => {
  const empresas = cotizacion('Empresas');
  const pedido = cotizacion('Empresas', 'requerimiento');
  const filas = [empresas, pedido];

  /** El código del 403, o null si respondió. */
  const codigo = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: ForbiddenException) =>
        (e.getResponse() as { codigo?: string }).codigo,
    );

  it('con todo de fábrica no cambia nada', async () => {
    const { alcance } = armar();
    expect(await alcance.deLaLista(vendedor, filas)).toEqual(filas);
    expect(await alcance.deLaLista(vendedor, filas, 'calendario')).toEqual(
      filas,
    );
  });

  it('sin Calendario, la vista de calendario se niega', async () => {
    const { alcance } = armar();
    const s = { ...vendedor, permisos: ['requerimientos', 'cotizaciones'] };
    expect(
      await codigo(alcance.deLaLista(s as never, filas, 'calendario')),
    ).toBe('SIN_PERMISO');
    expect(await alcance.deLaLista(s as never, filas)).toEqual(filas);
  });

  it('sin Cotizaciones, Dashboard ni Personal, solo los requerimientos', async () => {
    const { alcance } = armar();
    const s = { ...vendedor, permisos: ['requerimientos', 'calendario'] };
    expect(await alcance.deLaLista(s as never, filas)).toEqual([pedido]);
    const conDashboard = { ...vendedor, permisos: ['dashboard'] };
    expect(await alcance.deLaLista(conDashboard as never, filas)).toEqual(
      filas,
    );
  });

  it('sin ninguna sección que lea la lista, se niega', async () => {
    const { alcance } = armar();
    const s = { ...vendedor, permisos: ['calendario'] };
    expect(await codigo(alcance.deLaLista(s as never, filas))).toBe(
      'SIN_PERMISO',
    );
  });

  it('a recepción le sigue su regla encima', async () => {
    const { alcance } = armar();
    const particular = cotizacion('Particulares');
    const s = { ...recepcion, permisos: ['requerimientos'] };
    expect(await alcance.deLaLista(s as never, [particular, ...filas])).toEqual(
      [pedido],
    );
    expect(await alcance.deLaLista(recepcion, [particular, ...filas])).toEqual([
      particular,
      pedido,
    ]);
  });
});

// LOS TIPOS DE CLIENTE DE CADA CARGO (doc 22 §9; Felipe, 05-11-2026: "Todo
// debería mirar el tipo"): la misma regla de recepción, para los cuatro
// cargos, con sus interruptores.
describe('AlcanceDeRecepcion: los tipos que trabaja cada cargo', () => {
  const apagado = (cargo: UserRole, id: number): FilaDePermiso => ({
    cargo,
    permiso: claveDeTipo(id),
    prendido: false,
  });
  const prendido = (cargo: UserRole, id: number): FilaDePermiso => ({
    cargo,
    permiso: claveDeTipo(id),
    prendido: true,
  });

  it('un vendedor con «Empresas» apagado no ve ni cotiza las de empresas', async () => {
    const { alcance, repositorio } = conInterruptores([
      apagado(UserRole.VENDEDOR, 4),
    ]);
    const filas = [
      { id: 'a', ...cotizacion('Particulares') },
      { id: 'b', ...cotizacion('Empresas') },
      { id: 'c', ...cotizacion('Empresas', 'requerimiento') },
    ];
    expect((await alcance.filtrar(vendedor, filas)).map((f) => f.id)).toEqual([
      'a',
      'c',
    ]);
    const calendario = await alcance.paraElCalendario(vendedor, filas);
    expect(calendario[1]).toMatchObject({ solo_agenda: true, id: 'b' });
    expect(await alcance.veLosMontos(vendedor, 'empresas')).toBe(false);
    repositorio.tipoDelCliente.mockResolvedValue('Empresas');
    await expect(
      alcance.exigirElTipoDelCliente(vendedor, 'c1'),
    ).rejects.toThrow('«Empresas»');
    // A operaciones no le cambió nada.
    const operaciones = { role: UserRole.OPERACIONES, company_id: 1 };
    expect(await alcance.filtrar(operaciones, filas)).toBe(filas);
  });

  it('recepción con «Club Adulto Mayor» prendido lo trabaja completo', async () => {
    const { alcance } = conInterruptores([prendido(UserRole.RECEPCION, 7)]);
    expect(await alcance.ve(recepcion, cotizacion('Club Adulto Mayor'))).toBe(
      true,
    );
    expect(await alcance.ve(recepcion, cotizacion('Empresas'))).toBe(false);
    expect(await alcance.nombresDeSusTipos(recepcion)).toEqual([
      'Particulares',
      'Club Adulto Mayor',
    ]);
  });

  it('los clientes sin tipo: los ve quien no es recepción, como hoy', async () => {
    const { alcance } = conInterruptores([apagado(UserRole.VENDEDOR, 4)]);
    expect(await alcance.ve(vendedor, cotizacion(null))).toBe(true);
    expect(
      await alcance.ve(vendedor, cotizacion('Otro que ya no existe')),
    ).toBe(true);
    expect(await alcance.ve(recepcion, cotizacion(null))).toBe(false);
  });

  it('con todo de fábrica, vendedor para arriba trabaja todos', async () => {
    const { alcance } = conInterruptores([]);
    expect(await alcance.tiposDelCargo(vendedor)).toBeNull();
    expect(await alcance.nombresDeSusTipos(vendedor)).toBeNull();
    expect(await alcance.nombresDeSusTipos(recepcion)).toEqual([
      'Particulares',
    ]);
  });
});

// POST-VENTA (doc 22 §9, tanda 2): los eventos de un tipo apagado no
// aparecen en sus listas ni se tocan por sus puertas.
describe('AlcanceDeRecepcion: Post-Venta', () => {
  const sinEmpresas: FilaDePermiso[] = [
    { cargo: UserRole.OPERACIONES, permiso: claveDeTipo(4), prendido: false },
  ];
  const operaciones = { role: UserRole.OPERACIONES, company_id: 1 };
  const deLaBase = new Map([
    ['q1', { request_type: 'cotizacion', client_type: 'Particulares' }],
    ['q2', { request_type: 'cotizacion', client_type: 'Empresas' }],
    ['q3', { request_type: 'requerimiento', client_type: 'Empresas' }],
  ]);

  it('las listas traen solo lo que ve; de fábrica, todo sin preguntar', async () => {
    const { alcance, repositorio } = conInterruptores(sinEmpresas);
    repositorio.clientesDeLasCotizaciones.mockResolvedValue(deLaBase);
    const filas = [
      { id: 1, quotation_id: 'q1' },
      { id: 2, quotation_id: 'q2' },
      { id: 3, quotation_id: 'q3' },
      { id: 4, quotation_id: 'q9' },
      { id: 5, quotation_id: null },
    ];
    expect(
      (
        await alcance.soloLasQueVe(operaciones, filas, (f) => f.quotation_id)
      ).map((f) => f.id),
    ).toEqual([1, 3]);
    expect(repositorio.clientesDeLasCotizaciones).toHaveBeenCalledWith(1, [
      'q1',
      'q2',
      'q3',
      'q9',
    ]);
    expect(
      await alcance.soloLasClavesQueVe(operaciones, { q1: 10, q2: 20 }),
    ).toEqual({ q1: 10 });

    const deFabrica = conInterruptores([]);
    expect(
      await deFabrica.alcance.soloLasQueVe(
        operaciones,
        filas,
        (f) => f.quotation_id,
      ),
    ).toBe(filas);
    expect(
      deFabrica.repositorio.clientesDeLasCotizaciones,
    ).not.toHaveBeenCalled();
  });

  it('sus puertas: el evento de un tipo apagado, o de otra empresa, no', async () => {
    const { alcance, repositorio } = conInterruptores(sinEmpresas);
    repositorio.clienteDeLaCotizacion.mockImplementation(
      (_empresa: number, id: string) => {
        const q = deLaBase.get(id);
        return Promise.resolve(q ?? null);
      },
    );
    await expect(
      alcance.exigirQueLaVea(operaciones, 'q1'),
    ).resolves.toBeUndefined();
    await expect(alcance.exigirQueLaVea(operaciones, 'q2')).rejects.toThrow(
      '«Empresas»',
    );
    // Un requerimiento es de todos.
    await expect(
      alcance.exigirQueLaVea(operaciones, 'q3'),
    ).resolves.toBeUndefined();
    await expect(alcance.exigirQueLaVea(operaciones, 'q9')).rejects.toThrow(
      ForbiddenException,
    );
    // Desde una fila: un pago de la q2, no; una fila sin evento, pasa.
    repositorio.cotizacionDeLaFila.mockResolvedValueOnce('q2');
    await expect(
      alcance.exigirQueLaVeaLaFila(operaciones, 'payments', 'p1'),
    ).rejects.toThrow('«Empresas»');
    expect(repositorio.cotizacionDeLaFila).toHaveBeenCalledWith(
      'payments',
      'p1',
    );
    repositorio.cotizacionDeLaFila.mockResolvedValueOnce(null);
    await expect(
      alcance.exigirQueLaVeaLaFila(operaciones, 'event_staff', 's1'),
    ).resolves.toBeUndefined();
  });
});
