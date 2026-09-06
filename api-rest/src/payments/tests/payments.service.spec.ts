import { PinoLogger } from 'nestjs-pino';
import { EmailService } from 'src/email/email.service';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { QuotationsService } from 'src/quotations/quotations.service';
import { mockPinoLogger } from '../../testing/mocks';
import { PaymentsRepository } from '../payments.repository';
import { fechaDelUltimoAbono, PaymentsService } from '../payments.service';

// Esqueleto reparado (Fase 2 Bloque B). Construcción directa por la
// dependencia circular (forwardRef a QuotationsService).
describe('PaymentsService', () => {
  it('should be defined', () => {
    const service = new PaymentsService(
      {} as PaymentsRepository,
      {} as QuotationsRepository,
      {} as QuotationsService,
      {} as EmailService,
      mockPinoLogger() as unknown as PinoLogger,
    );
    expect(service).toBeDefined();
  });

  // El portero del plan (caso 501, 06-09): la suma de las cuotas debe
  // calzar con el total ACTUAL de la cotización — la pantalla puede
  // traer un total viejo de su caché.
  describe('createPaymentPlan: el portero de cuadratura', () => {
    const armar = (totalActual: number) => {
      const repo = {
        deletePaymentsByQuotationId: jest.fn(),
        createPaymentPlan: jest.fn(),
      };
      const quotations = {
        findOne: jest.fn().mockResolvedValue({
          data: {
            id: 'q-1',
            company_id: 1,
            total_amount: totalActual,
            quotation_status: 'aceptada',
          },
        }),
      };
      const service = new PaymentsService(
        repo as unknown as PaymentsRepository,
        {} as QuotationsRepository,
        quotations as unknown as QuotationsService,
        {} as EmailService,
        mockPinoLogger() as unknown as PinoLogger,
      );
      return { service, repo };
    };

    const PLAN = {
      quotation_id: 'q-1',
      payments: [{ amount: 1_000_000 }, { amount: 984_100 }] as never,
    } as never;

    it('rechaza un plan que no calza con el total actual, sin borrar nada', async () => {
      const { service, repo } = armar(2_984_100);
      await expect(service.createPaymentPlan(PLAN, 1)).rejects.toThrow(
        'recarga la página',
      );
      expect(repo.deletePaymentsByQuotationId).not.toHaveBeenCalled();
      expect(repo.createPaymentPlan).not.toHaveBeenCalled();
    });

    it('la cotización de otra empresa es un 404 sin pistas', async () => {
      const { service } = armar(1_984_100);
      await expect(service.createPaymentPlan(PLAN, 9)).rejects.toThrow(
        'no encontrada',
      );
    });
  });

  // Calendario de pagos Nivel A: solo fecha/nota, solo cuotas sin plata.
  describe('updatePaymentSchedule', () => {
    const buildService = (repo: Partial<PaymentsRepository>) =>
      new PaymentsService(
        repo as PaymentsRepository,
        {} as QuotationsRepository,
        {} as QuotationsService,
        {} as EmailService,
        mockPinoLogger() as unknown as PinoLogger,
      );

    const basePayment = {
      id: 'pay-1',
      status: 'pendiente',
      due_date: '2026-08-10',
      notes: null,
    };

    it('rechaza una cuota pagada', async () => {
      const service = buildService({
        findPaymentById: jest.fn().mockResolvedValue({
          data: { ...basePayment, status: 'pagado' },
          error: null,
        }),
        findAllTransactionsByPaymentId: jest
          .fn()
          .mockResolvedValue({ data: [] }),
      });
      await expect(
        service.updatePaymentSchedule('pay-1', { due_date: '2026-09-01' }, 1),
      ).rejects.toThrow('dinero registrado');
    });

    it('rechaza una cuota con abonos aunque siga pendiente', async () => {
      const service = buildService({
        findPaymentById: jest
          .fn()
          .mockResolvedValue({ data: basePayment, error: null }),
        findAllTransactionsByPaymentId: jest
          .fn()
          .mockResolvedValue({ data: [{ id: 1 }] }),
      });
      await expect(
        service.updatePaymentSchedule('pay-1', { due_date: '2026-09-01' }, 1),
      ).rejects.toThrow('dinero registrado');
    });

    it('mueve la fecha y re-cuadra el estado a pendiente si queda a futuro', async () => {
      const updatePayment = jest.fn().mockResolvedValue({ error: null });
      const service = buildService({
        findPaymentById: jest.fn().mockResolvedValue({
          data: { ...basePayment, status: 'vencido' },
          error: null,
        }),
        findAllTransactionsByPaymentId: jest
          .fn()
          .mockResolvedValue({ data: [] }),
        updatePayment,
      });
      const futuro = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const result = await service.updatePaymentSchedule(
        'pay-1',
        { due_date: futuro },
        1,
      );
      expect(updatePayment).toHaveBeenCalledWith('pay-1', {
        due_date: futuro,
        status: 'pendiente',
      });
      expect(result.status).toBe('pendiente');
    });

    it('marca vencido si la fecha nueva quedó en el pasado', async () => {
      const updatePayment = jest.fn().mockResolvedValue({ error: null });
      const service = buildService({
        findPaymentById: jest
          .fn()
          .mockResolvedValue({ data: basePayment, error: null }),
        findAllTransactionsByPaymentId: jest
          .fn()
          .mockResolvedValue({ data: [] }),
        updatePayment,
      });
      const result = await service.updatePaymentSchedule(
        'pay-1',
        { due_date: '2020-01-01' },
        1,
      );
      expect(updatePayment).toHaveBeenCalledWith('pay-1', {
        due_date: '2020-01-01',
        status: 'vencido',
      });
      expect(result.status).toBe('vencido');
    });

    it('edita solo la nota sin tocar fecha ni estado', async () => {
      const updatePayment = jest.fn().mockResolvedValue({ error: null });
      const service = buildService({
        findPaymentById: jest
          .fn()
          .mockResolvedValue({ data: basePayment, error: null }),
        findAllTransactionsByPaymentId: jest
          .fn()
          .mockResolvedValue({ data: [] }),
        updatePayment,
      });
      await service.updatePaymentSchedule('pay-1', { notes: 'Cuota final' }, 1);
      expect(updatePayment).toHaveBeenCalledWith('pay-1', {
        notes: 'Cuota final',
      });
    });

    it('lanza 404 si la cuota no existe o es de otra empresa', async () => {
      const service = buildService({
        findPaymentById: jest
          .fn()
          .mockResolvedValue({ data: null, error: null }),
      });
      await expect(
        service.updatePaymentSchedule('pay-x', { notes: 'x' }, 1),
      ).rejects.toThrow('Cuota no encontrada');
    });
  });
});

// LA CUOTA FANTASMA DE $0 (24-08, #486 de Quillón): supabase entrega
// numeric como TEXTO; el abonado se sumaba con + (pegaba "020800") y la
// comparación contra el monto era alfabética, así que un pago EXACTO
// caía en la división y nacía una cuota de $0 vencida. Estas pruebas
// usan los montos COMO TEXTO, igual que llegan de la base.
describe('normalizePaymentAfterTransactions', () => {
  const armar = (repo: Partial<PaymentsRepository>) =>
    new PaymentsService(
      repo as PaymentsRepository,
      {} as QuotationsRepository,
      {} as QuotationsService,
      {} as EmailService,
      mockPinoLogger() as unknown as PinoLogger,
    );

  it('un pago exacto marca la cuota pagada y NO pare una cuota de $0', async () => {
    const repo = {
      findPaymentById: jest.fn().mockResolvedValue({
        data: {
          id: 'p11',
          quotation_id: 'q486',
          payment_number: 11,
          amount: '20800',
          due_date: '2026-08-20',
        },
        error: null,
      }),
      findAllTransactionsByPaymentId: jest
        .fn()
        .mockResolvedValue({ data: [{ amount: '20800' }] }),
      updatePayment: jest.fn().mockResolvedValue({ data: {}, error: null }),
      createPayment: jest.fn(),
      findAllPaymentsFromQuotation: jest
        .fn()
        .mockResolvedValue({ data: [], error: null }),
    };
    const service = armar(repo);
    await service['normalizePaymentAfterTransactions']('p11', 1);
    expect(repo.updatePayment).toHaveBeenCalledWith('p11', {
      status: 'pagado',
    });
    expect(repo.createPayment).not.toHaveBeenCalled();
  });

  it('un pago parcial sí divide, con el remanente bien restado', async () => {
    const repo = {
      findPaymentById: jest.fn().mockResolvedValue({
        data: {
          id: 'p10',
          quotation_id: 'q486',
          payment_number: 10,
          amount: '52000',
          due_date: '2026-08-20',
          payment_type: 'Cuota 1',
          notes: '',
        },
        error: null,
      }),
      findAllTransactionsByPaymentId: jest
        .fn()
        .mockResolvedValue({ data: [{ amount: '31200' }] }),
      updatePayment: jest.fn().mockResolvedValue({ data: {}, error: null }),
      createPayment: jest.fn().mockResolvedValue({ data: {}, error: null }),
      findAllPaymentsFromQuotation: jest
        .fn()
        .mockResolvedValue({ data: [], error: null }),
    };
    const service = armar(repo);
    await service['normalizePaymentAfterTransactions']('p10', 1);
    expect(repo.updatePayment).toHaveBeenCalledWith('p10', {
      amount: 31200,
      status: 'pagado',
    });
    expect(repo.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 20800, payment_number: 11 }),
    );
  });
});

describe('fechaDelUltimoAbono (la cuota pagada de a poco, 28-08)', () => {
  it('devuelve la fecha del ÚLTIMO abono, no la del primero', () => {
    // El caso real de la cotización 114: 3 abonos, 149 días entre el
    // primero y el último. La pantalla decía marzo; se pagó en agosto.
    expect(
      fechaDelUltimoAbono([
        { transaction_date: '2025-03-29' },
        { transaction_date: '2025-06-10' },
        { transaction_date: '2025-08-25' },
      ]),
    ).toBe('2025-08-25');
  });

  it('no depende del orden en que lleguen', () => {
    expect(
      fechaDelUltimoAbono([
        { transaction_date: '2025-08-25' },
        { transaction_date: '2025-03-29' },
      ]),
    ).toBe('2025-08-25');
  });

  it('un solo abono: esa misma fecha', () => {
    expect(fechaDelUltimoAbono([{ transaction_date: '2026-01-05' }])).toBe(
      '2026-01-05',
    );
  });

  it('sin abonos: null (la cuota no está pagada)', () => {
    expect(fechaDelUltimoAbono([])).toBeNull();
  });
});
