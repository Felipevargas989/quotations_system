import { PinoLogger } from 'nestjs-pino';
import { EmailService } from 'src/email/email.service';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { QuotationsService } from 'src/quotations/quotations.service';
import { mockPinoLogger } from '../../testing/mocks';
import { PaymentsRepository } from '../payments.repository';
import { PaymentsService } from '../payments.service';

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
