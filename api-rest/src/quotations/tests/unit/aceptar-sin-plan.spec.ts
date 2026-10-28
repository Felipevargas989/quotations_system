import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { ClientsService } from 'src/clients/clients.service';
import { ConsultasService } from 'src/consultas/consultas.service';
import { EmailService } from 'src/email/email.service';
import { PaymentsService } from 'src/payments/payments.service';
import {
  ACEPTAR_SIN_PLAN_DE_PAGOS,
  QuotationStatus,
} from 'src/quotations/constants/constants';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { RefundsService } from 'src/refunds/refunds.service';
import { StorageService } from 'src/storage/storage.service';
import { UsersService } from 'src/users/users.service';
import { PortalReceiptsRepository } from '../../portal-receipts.controller';
import { QuotationsService } from '../../quotations.service';

// NO SE ACEPTA SIN PLAN DE PAGOS (Felipe, 28-10-2026; caso 703). El 27-10
// la 703 quedó aceptada sin ninguna cuota dos veces —anulada a las 19:51 y
// rechazada a las 19:53, y vuelta a aceptar desde la búsqueda de
// Cotizaciones, que no abría el plan— y desapareció de Post-Venta.

describe('Aceptar sin plan de pagos', () => {
  let service: QuotationsService;
  let repo: {
    findOne: jest.Mock;
    update: jest.Mock;
    cerrarCompromisosDeLaVenta: jest.Mock;
  };
  let cuotas: jest.Mock;

  const armar = async (estado: QuotationStatus, hayCuotas: boolean) => {
    repo = {
      findOne: jest.fn().mockResolvedValue({
        data: { id: 'q703', company_id: 1, quotation_status: estado },
        error: null,
      }),
      update: jest.fn().mockResolvedValue({ id: 'q703' }),
      cerrarCompromisosDeLaVenta: jest.fn().mockResolvedValue(2),
    };
    cuotas = jest.fn().mockResolvedValue({
      data: hayCuotas ? [{ id: 'c1', payment_transactions: [] }] : [],
      error: null,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotationsService,
        { provide: QuotationsRepository, useValue: repo },
        {
          provide: RefundsService,
          useValue: { findPendingByQuotation: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: PaymentsService,
          useValue: {
            findAllPaymentsFromQuotation: cuotas,
            deletePaymentPlan: jest.fn(),
            cerrarPlanAlAnular: jest.fn(),
          },
        },
        { provide: ClientsService, useValue: {} },
        { provide: EmailService, useValue: {} },
        { provide: UsersService, useValue: {} },
        { provide: StorageService, useValue: {} },
        {
          provide: ConsultasService,
          useValue: { embudoPara: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: PortalReceiptsRepository,
          useValue: { pendingPaymentIds: jest.fn() },
        },
        {
          provide: PinoLogger,
          useValue: {
            setContext: jest.fn(),
            error: jest.fn(),
            info: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get<QuotationsService>(QuotationsService);
  };

  const aceptar = () =>
    service.update(
      'q703',
      { quotation_status: QuotationStatus.ACEPTADA } as never,
      1,
      'administrador',
    );

  it('desde anulada y sin cuotas: no se acepta y no se guarda nada', async () => {
    await armar(QuotationStatus.CANCELADA, false);
    await expect(aceptar()).rejects.toBeInstanceOf(BadRequestException);
    await expect(aceptar()).rejects.toThrow(ACEPTAR_SIN_PLAN_DE_PAGOS);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('desde rechazada y sin cuotas: tampoco', async () => {
    await armar(QuotationStatus.RECHAZADA, false);
    await expect(aceptar()).rejects.toThrow(ACEPTAR_SIN_PLAN_DE_PAGOS);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('con el plan ya armado sí se acepta ("el plan de pagos ya existía")', async () => {
    await armar(QuotationStatus.EN_NEGOCIACION, true);
    await aceptar();
    expect(repo.update).toHaveBeenCalledTimes(1);
    // Al aceptar, los compromisos de la venta se cierran (28-10-2026).
    expect(repo.cerrarCompromisosDeLaVenta).toHaveBeenCalledWith('q703', 1);
  });

  it('si cerrar los compromisos falla, la aceptación queda igual', async () => {
    await armar(QuotationStatus.EN_NEGOCIACION, true);
    repo.cerrarCompromisosDeLaVenta.mockRejectedValue(new Error('caída'));
    await expect(aceptar()).resolves.toEqual({ id: 'q703' });
  });

  it('una aceptada que se guarda como aceptada no pregunta por el plan', async () => {
    await armar(QuotationStatus.ACEPTADA, false);
    await aceptar();
    expect(cuotas).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledTimes(1);
    // Ya estaba aceptada: lo anotado en Post-Venta no se toca.
    expect(repo.cerrarCompromisosDeLaVenta).not.toHaveBeenCalled();
  });
});
