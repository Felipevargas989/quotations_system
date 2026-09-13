import { NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { EmailService } from 'src/email/email.service';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { QuotationsService } from 'src/quotations/quotations.service';
import { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from '../../testing/mocks';
import { PaymentsRepository } from '../payments.repository';
import { PaymentsService } from '../payments.service';

/**
 * AISLAMIENTO DE CUOTAS Y ABONOS (11-09-2026, sprint 2).
 *
 * Tres puertas: las cuotas de una cotización se leían con un filtro de
 * empresa sobre un embebido sin `!inner`; borrar una cuota no miraba la
 * empresa en ningún punto; y borrar un abono se ejecutaba ANTES de
 * cualquier comprobación.
 */
const armarCliente = (respuesta: { data: unknown; error: unknown }) => {
  const selects: string[] = [];
  const cadena: Record<string, unknown> = {};
  for (const m of [
    'select',
    'eq',
    'in',
    'order',
    'limit',
    'delete',
    'insert',
  ]) {
    cadena[m] = jest.fn((arg: unknown) => {
      if (m === 'select' && typeof arg === 'string') selects.push(arg);
      return cadena;
    });
  }
  (cadena as { then?: unknown }).then = (resolver: (v: unknown) => void) =>
    resolver(respuesta);
  (cadena as { single?: unknown }).single = jest
    .fn()
    .mockResolvedValue(respuesta);
  const client = { from: jest.fn(() => cadena) };
  return { client, selects, cadena };
};

const armarServicio = (repo: Record<string, unknown>) =>
  new PaymentsService(
    repo as unknown as PaymentsRepository,
    {} as QuotationsRepository,
    {} as QuotationsService,
    {} as EmailService,
    mockPinoLogger() as unknown as PinoLogger,
  );

describe('Pagos: el filtro de empresa filtra de verdad', () => {
  it('las cuotas de una cotización se leen con quotations!inner', async () => {
    const { client, selects } = armarCliente({ data: [], error: null });
    const repo = new PaymentsRepository(
      { client } as unknown as SupabaseService,
      mockPinoLogger() as unknown as PinoLogger,
    );
    await repo.findAllPaymentsFromQuotation(['q-1'], 1);
    expect(selects.join(' ')).toContain('quotations!inner');
  });
});

describe('Pagos: borrar una cuota exige que sea de la empresa', () => {
  it('cuota ajena: 404 y no borra nada', async () => {
    const repo = {
      findPaymentById: jest.fn().mockResolvedValue({ data: null, error: null }),
      removePaymentTransactionsByPaymentId: jest.fn(),
      removePayment: jest.fn(),
    };
    await expect(
      armarServicio(repo).removePayment('p-1', 52),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.removePaymentTransactionsByPaymentId).not.toHaveBeenCalled();
    expect(repo.removePayment).not.toHaveBeenCalled();
  });

  it('cuota propia: borra sus abonos y después la cuota', async () => {
    const repo = {
      findPaymentById: jest
        .fn()
        .mockResolvedValue({ data: { id: 'p-1' }, error: null }),
      removePaymentTransactionsByPaymentId: jest
        .fn()
        .mockResolvedValue({ error: null }),
      removePayment: jest.fn().mockResolvedValue({ error: null }),
    };
    await armarServicio(repo).removePayment('p-1', 1);
    expect(repo.findPaymentById).toHaveBeenCalledWith('p-1', 1);
    expect(repo.removePayment).toHaveBeenCalledWith('p-1');
  });
});

describe('Pagos: borrar un abono exige que su cuota sea de la empresa', () => {
  it('abono de otra empresa: 404 y el abono sigue ahí', async () => {
    const repo = {
      findPaymentTransactionById: jest
        .fn()
        .mockResolvedValue({ data: { id: 9, payment_id: 'p-1' }, error: null }),
      findPaymentById: jest.fn().mockResolvedValue({ data: null, error: null }),
      removePaymentTransaction: jest.fn(),
    };
    await expect(
      armarServicio(repo).removePaymentTransaction(9, 52),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.removePaymentTransaction).not.toHaveBeenCalled();
  });

  it('abono inexistente: 404', async () => {
    const repo = {
      findPaymentTransactionById: jest
        .fn()
        .mockResolvedValue({ data: null, error: null }),
      findPaymentById: jest.fn(),
      removePaymentTransaction: jest.fn(),
    };
    await expect(
      armarServicio(repo).removePaymentTransaction(9, 1),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.removePaymentTransaction).not.toHaveBeenCalled();
  });
});
