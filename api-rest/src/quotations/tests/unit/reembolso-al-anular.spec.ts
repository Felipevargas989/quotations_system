import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { ClientsService } from 'src/clients/clients.service';
import { ConsultasService } from 'src/consultas/consultas.service';
import { EmailService } from 'src/email/email.service';
import { PaymentsService } from 'src/payments/payments.service';
import { QuotationStatus } from 'src/quotations/constants/constants';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { RefundsService } from 'src/refunds/refunds.service';
import { StorageService } from 'src/storage/storage.service';
import { UsersService } from 'src/users/users.service';
import { PortalReceiptsRepository } from '../../portal-receipts.controller';
import { QuotationsService } from '../../quotations.service';
import { disponibleParaReembolsar } from '../../utils/reembolso-al-anular';

// REEMBOLSO AL ANULAR (20-10-2026). Felipe: "al momento de anular un evento
// con reembolsos el sistema debería preguntar si se reembolsarán los
// ingresos y si se coloca sí, generar el reembolso". La #465 se anuló con
// $1.394.000 abonados y no nació ningún reembolso.

describe('disponibleParaReembolsar', () => {
  it('lo abonado en todas las cuotas menos lo ya reembolsado', () => {
    const cuotas = [
      { payment_transactions: [{ amount: 250000 }] },
      { payment_transactions: [{ amount: '1144000' }] },
      { payment_transactions: [] },
    ];
    expect(disponibleParaReembolsar(cuotas, [])).toBe(1394000);
    expect(disponibleParaReembolsar(cuotas, [{ amount: 394000 }])).toBe(
      1000000,
    );
  });

  it('nunca negativo y sin abonos es cero', () => {
    expect(disponibleParaReembolsar([], [{ amount: 5000 }])).toBe(0);
    expect(disponibleParaReembolsar([{ payment_transactions: null }], [])).toBe(
      0,
    );
  });
});

describe('Anular con reembolso', () => {
  let service: QuotationsService;
  let repo: jest.Mocked<QuotationsRepository>;
  let refunds: {
    findPendingByQuotation: jest.Mock;
    findByQuotation: jest.Mock;
    create: jest.Mock;
  };
  const orden: string[] = [];

  const cotizacion = (estado: QuotationStatus) => ({
    data: { id: 'q1', company_id: 1, quotation_status: estado },
    error: null,
  });

  beforeEach(async () => {
    orden.length = 0;
    repo = {
      findOne: jest
        .fn()
        .mockResolvedValue(cotizacion(QuotationStatus.ACEPTADA)),
      update: jest.fn().mockImplementation(() => {
        orden.push('guardar');
        return Promise.resolve({ id: 'q1' });
      }),
    } as any;
    refunds = {
      findPendingByQuotation: jest.fn().mockResolvedValue([]),
      findByQuotation: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(() => {
        orden.push('reembolso');
        return Promise.resolve({});
      }),
    };
    const payments = {
      findAllPaymentsFromQuotation: jest.fn().mockResolvedValue({
        data: [
          { payment_transactions: [{ amount: 250000 }] },
          { payment_transactions: [{ amount: 1144000 }] },
        ],
        error: null,
      }),
      deletePaymentPlan: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotationsService,
        { provide: QuotationsRepository, useValue: repo },
        { provide: RefundsService, useValue: refunds },
        { provide: PaymentsService, useValue: payments },
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
  });

  afterEach(() => jest.clearAllMocks());

  const anular = (extra: Record<string, unknown> = {}) =>
    service.update(
      'q1',
      {
        quotation_status: QuotationStatus.CANCELADA,
        loss_reason: 'no_pudimos',
        ...extra,
      } as any,
      1,
      'administrador',
    );

  it('con «Sí»: anula y después nace el reembolso pendiente por ese monto', async () => {
    await anular({ reembolso_al_anular: 1394000 });
    expect(refunds.create).toHaveBeenCalledWith({
      amount: 1394000,
      quotation_id: 'q1',
    });
    expect(orden).toEqual(['guardar', 'reembolso']);
  });

  it('el monto no viaja como columna de la cotización', async () => {
    await anular({ reembolso_al_anular: 500000 });
    const guardado = repo.update.mock.calls[0][1] as Record<string, unknown>;
    expect(guardado).not.toHaveProperty('reembolso_al_anular');
    expect(guardado.quotation_status).toBe(QuotationStatus.CANCELADA);
  });

  it('más de lo abonado sin reembolsar: no anula ni crea nada', async () => {
    refunds.findByQuotation.mockResolvedValue([{ amount: 394000 }]);
    await expect(
      anular({ reembolso_al_anular: 1394000 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.update).not.toHaveBeenCalled();
    expect(refunds.create).not.toHaveBeenCalled();
  });

  it('con «No» (sin monto) anula como siempre, sin reembolso', async () => {
    await anular();
    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(refunds.create).not.toHaveBeenCalled();
  });

  it('solo vale al anular un evento aceptado', async () => {
    await expect(
      service.update(
        'q1',
        { reembolso_al_anular: 1000 } as any,
        1,
        'administrador',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    repo.findOne.mockResolvedValue(
      cotizacion(QuotationStatus.ENVIADA) as unknown as Awaited<
        ReturnType<QuotationsRepository['findOne']>
      >,
    );
    await expect(anular({ reembolso_al_anular: 1000 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.update).not.toHaveBeenCalled();
    expect(refunds.create).not.toHaveBeenCalled();
  });
});
