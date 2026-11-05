import { ForbiddenException } from '@nestjs/common';
import { UserRole } from 'src/users/entities/user.entity';
import {
  AlcanceDeRecepcion,
  revisarLoQueCotiza,
  sinMontosDelResumen,
} from '../alcance-de-recepcion';
import type { ClientsRepository } from '../clients.repository';

// LO QUE VE RECEPCIÓN DE LAS COTIZACIONES (doc 21, 04-11-2026): todos los
// requerimientos y, de las cotizaciones, solo las de clientes particulares;
// vendedor para arriba, todo.

const recepcion = { role: UserRole.RECEPCION, company_id: 1 };
const vendedor = { role: UserRole.VENDEDOR, company_id: 1 };

const armar = () => {
  const repositorio = {
    tiposParticulares: jest.fn().mockResolvedValue(['Particulares']),
    clienteDeLaCotizacion: jest.fn(),
    tipoDelCliente: jest.fn(),
  };
  const alcance = new AlcanceDeRecepcion(
    repositorio as unknown as ClientsRepository,
  );
  return { alcance, repositorio };
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
    expect(repositorio.tiposParticulares).not.toHaveBeenCalled();
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

  it('los tipos de la empresa se recuerdan unos minutos', async () => {
    const { alcance, repositorio } = armar();
    await alcance.ve(recepcion, cotizacion('Particulares'));
    await alcance.ve(recepcion, cotizacion('Empresas'));
    expect(repositorio.tiposParticulares).toHaveBeenCalledTimes(1);
    alcance.olvidar(1);
    await alcance.ve(recepcion, cotizacion('Empresas'));
    expect(repositorio.tiposParticulares).toHaveBeenCalledTimes(2);
  });

  it('sin ningún tipo marcado, recepción sigue con solo requerimientos', async () => {
    const { alcance, repositorio } = armar();
    repositorio.tiposParticulares.mockResolvedValue([]);
    expect(await alcance.ve(recepcion, cotizacion('Particulares'))).toBe(false);
  });

  it('para cotizar: la cotización y el cliente tienen que ser de particulares', async () => {
    const { alcance, repositorio } = armar();
    repositorio.clienteDeLaCotizacion.mockResolvedValue({
      request_type: 'cotizacion',
      client_type: 'Empresas',
    });
    await expect(alcance.exigirParticular(recepcion, 'q1')).rejects.toThrow(
      ForbiddenException,
    );
    repositorio.clienteDeLaCotizacion.mockResolvedValue({
      request_type: 'requerimiento',
      client_type: 'Particulares',
    });
    await expect(
      alcance.exigirParticular(recepcion, 'q1'),
    ).resolves.toBeUndefined();
    // Una de otra empresa no existe para ella.
    repositorio.clienteDeLaCotizacion.mockResolvedValue(null);
    await expect(alcance.exigirParticular(recepcion, 'q9')).rejects.toThrow(
      ForbiddenException,
    );
    expect(repositorio.clienteDeLaCotizacion).toHaveBeenCalledWith(1, 'q9');
    repositorio.tipoDelCliente.mockResolvedValue('Iglesias');
    await expect(
      alcance.exigirClienteParticular(recepcion, 'c1'),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      alcance.exigirClienteParticular(vendedor, 'c1'),
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
