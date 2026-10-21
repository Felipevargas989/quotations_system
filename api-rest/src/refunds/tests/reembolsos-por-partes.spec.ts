import { BadRequestException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from '../../testing/mocks';
import { descontarDePendientes, pendientesDe } from '../reembolsos-por-partes';
import { RefundsRepository } from '../refunds.repository';
import { RefundsService } from '../refunds.service';

// REEMBOLSOS POR PARTES (20-10-2026). Felipe registró $4.000.000 de un
// reembolso de $10.000.000 en el laboratorio y el resto desapareció: "no me
// deja seguir ingresando reembolsos". Lo pendiente es lo que falta por
// devolver (la barra roja); cada registro es una fila pagada.

describe('descontarDePendientes', () => {
  it('descuenta del más antiguo al más nuevo: borra los cubiertos y achica el último', () => {
    const r = descontarDePendientes(
      [
        { id: 'a', amount: 1000 },
        { id: 'b', amount: 5000 },
      ],
      3000,
    );
    expect(r.borrar).toEqual(['a']);
    expect(r.achicar).toEqual([{ id: 'b', amount: 3000 }]);
    expect(r.resto).toBe(0);
  });

  it('pendientesDe deja solo lo no pagado, del más antiguo al más nuevo', () => {
    expect(
      pendientesDe([
        { id: 2, amount: '600', is_paid: false, created_at: '2026-10-20T02' },
        { id: 9, amount: 400, is_paid: true, created_at: '2026-10-20T01' },
        { id: 1, amount: 100, is_paid: false, created_at: '2026-10-20T01' },
      ]),
    ).toEqual([
      { id: '1', amount: 100 },
      { id: '2', amount: 600 },
    ]);
  });
});

describe('RefundsService: registrar, editar y eliminar por partes', () => {
  let repo: {
    findByQuotation: jest.Mock;
    findOwned: jest.Mock;
    create: jest.Mock;
    updateAmount: jest.Mock;
    remove: jest.Mock;
    registerPaid: jest.Mock;
  };
  let service: RefundsService;

  const pendiente = (id: string, amount: number) => ({
    id,
    amount,
    is_paid: false,
    created_at: `2026-10-20T0${id}`,
  });
  const campos = (amount: number) => ({
    amount,
    refund_date: '2026-10-20',
    payment_method: 'Transferencia',
  });

  beforeEach(() => {
    repo = {
      findByQuotation: jest.fn().mockResolvedValue([pendiente('1', 10000000)]),
      findOwned: jest.fn(),
      create: jest.fn().mockResolvedValue({ data: { id: '99' }, error: null }),
      updateAmount: jest.fn().mockResolvedValue({ error: null }),
      remove: jest.fn().mockResolvedValue({ error: null }),
      registerPaid: jest.fn().mockResolvedValue({ registered: true }),
    };
    service = new RefundsService(
      repo as unknown as RefundsRepository,
      mockPinoLogger() as unknown as PinoLogger,
    );
  });

  it('registrar $4.000.000 de $10.000.000: quedan $6.000.000 por devolver y nace el registro pagado', async () => {
    await service.registrar(1, 'q1', campos(4000000));
    expect(repo.updateAmount).toHaveBeenCalledWith('1', 6000000);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        quotation_id: 'q1',
        amount: 4000000,
        is_paid: true,
        payment_method: 'Transferencia',
      }),
    );
  });

  it('registrar todo lo que falta borra lo pendiente', async () => {
    await service.registrar(1, 'q1', campos(10000000));
    expect(repo.remove).toHaveBeenCalledWith('1');
    expect(repo.updateAmount).not.toHaveBeenCalled();
  });

  it('no deja registrar más de lo que falta, ni escribe nada', async () => {
    await expect(
      service.registrar(1, 'q1', campos(10000001)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.updateAmount).not.toHaveBeenCalled();
  });

  it('si el registro falla, lo descontado vuelve a lo pendiente', async () => {
    repo.create
      .mockResolvedValueOnce({ data: null, error: new Error('base') })
      .mockResolvedValueOnce({ data: { id: '7' }, error: null });
    await expect(service.registrar(1, 'q1', campos(4000000))).rejects.toThrow(
      'base',
    );
    expect(repo.create).toHaveBeenLastCalledWith({
      quotation_id: 'q1',
      amount: 4000000,
      is_paid: false,
    });
  });

  it('editar un registro bajándolo devuelve la diferencia a lo pendiente', async () => {
    repo.findOwned.mockResolvedValue({
      id: '5',
      quotation_id: 'q1',
      amount: 4000000,
      is_paid: true,
    });
    repo.findByQuotation.mockResolvedValue([pendiente('1', 6000000)]);
    await service.editarRegistro(1, '5', campos(3000000));
    expect(repo.updateAmount).toHaveBeenCalledWith('1', 7000000);
    expect(repo.registerPaid).toHaveBeenCalledWith(1, '5', campos(3000000));
  });

  it('editar un registro hacia arriba no puede pasar de lo que falta', async () => {
    repo.findOwned.mockResolvedValue({
      id: '5',
      quotation_id: 'q1',
      amount: 10000000,
      is_paid: true,
    });
    repo.findByQuotation.mockResolvedValue([]);
    await expect(
      service.editarRegistro(1, '5', campos(10000001)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.registerPaid).not.toHaveBeenCalled();
  });

  it('«Registrar» sobre una fila pendiente ya no pisa el monto: registra y deja el resto', async () => {
    repo.findOwned.mockResolvedValue({
      id: '1',
      quotation_id: 'q1',
      amount: 10000000,
      is_paid: false,
    });
    await service.editarRegistro(1, '1', campos(4000000));
    expect(repo.registerPaid).not.toHaveBeenCalled();
    expect(repo.updateAmount).toHaveBeenCalledWith('1', 6000000);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 4000000, is_paid: true }),
    );
  });

  it('eliminar un registro devuelve su monto a lo que falta por devolver', async () => {
    repo.findOwned.mockResolvedValue({
      id: '5',
      quotation_id: 'q1',
      amount: 4000000,
      is_paid: true,
    });
    repo.findByQuotation.mockResolvedValue([pendiente('1', 6000000)]);
    await service.eliminarRegistro(1, '5');
    expect(repo.updateAmount).toHaveBeenCalledWith('1', 10000000);
    expect(repo.remove).toHaveBeenCalledWith('5');
  });

  it('eliminar sin nada pendiente crea lo que falta por devolver', async () => {
    repo.findOwned.mockResolvedValue({
      id: '5',
      quotation_id: 'q1',
      amount: 4000000,
      is_paid: true,
    });
    repo.findByQuotation.mockResolvedValue([]);
    await service.eliminarRegistro(1, '5');
    expect(repo.create).toHaveBeenCalledWith({
      quotation_id: 'q1',
      amount: 4000000,
      is_paid: false,
    });
  });

  it('si el borrado falla, se deshace la vuelta a lo pendiente', async () => {
    repo.findOwned.mockResolvedValue({
      id: '5',
      quotation_id: 'q1',
      amount: 4000000,
      is_paid: true,
    });
    repo.findByQuotation.mockResolvedValue([pendiente('1', 6000000)]);
    repo.remove.mockResolvedValue({ error: new Error('base') });
    await expect(service.eliminarRegistro(1, '5')).rejects.toThrow('base');
    expect(repo.updateAmount).toHaveBeenLastCalledWith('1', 6000000);
  });

  it('lo pendiente no se elimina: baja registrando', async () => {
    repo.findOwned.mockResolvedValue({
      id: '1',
      quotation_id: 'q1',
      amount: 6000000,
      is_paid: false,
    });
    await expect(service.eliminarRegistro(1, '1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.remove).not.toHaveBeenCalled();
  });
});
