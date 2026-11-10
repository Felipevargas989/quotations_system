import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { ClientsService } from 'src/clients/clients.service';
import { ConsultasService } from 'src/consultas/consultas.service';
import { EmailService } from 'src/email/email.service';
import { PaymentsService } from 'src/payments/payments.service';
import { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import { QuotationStatus } from 'src/quotations/constants/constants';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { RefundsService } from 'src/refunds/refunds.service';
import { StorageService } from 'src/storage/storage.service';
import { User, UserRole } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { PortalReceiptsRepository } from '../../portal-receipts.controller';
import { QuotationsService } from '../../quotations.service';

// EL CAMBIO DE ESTADO QUEDA EN EL SEGUIMIENTO (Felipe, 09-11-2026): cada
// camino que mueve el estado deja su línea, firmada por quien lo movió.
describe('QuotationsService: el cambio de estado queda en el Seguimiento', () => {
  let service: QuotationsService;
  let repo: Record<string, jest.Mock>;
  let registrar: jest.Mock;

  const camila = {
    id: 'user-camila',
    email: 'camila@valledelsol.cl',
    role: UserRole.ADMINISTRADOR,
    company_id: 1,
  } as User;

  const armar = async (estado: QuotationStatus) => {
    repo = {
      findOne: jest.fn().mockResolvedValue({
        data: { id: 'q-7', company_id: 1, quotation_status: estado },
        error: null,
      }),
      update: jest.fn().mockResolvedValue({ id: 'q-7' }),
      cerrarCompromisosDeLaVenta: jest.fn().mockResolvedValue(0),
      findContactById: jest.fn().mockResolvedValue(null),
      findContactByName: jest.fn().mockResolvedValue(null),
    };
    registrar = jest.fn().mockResolvedValue(undefined);
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
            findAllPaymentsFromQuotation: jest
              .fn()
              .mockResolvedValue({ data: [], error: null }),
            deletePaymentPlan: jest.fn(),
          },
        },
        { provide: ClientsService, useValue: {} },
        { provide: EmailService, useValue: { sendEmail: jest.fn() } },
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
          provide: QuotationFollowupsService,
          useValue: { registrarCambioDeEstado: registrar },
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

  it('mover la tarjeta deja la línea a nombre de quien la movió', async () => {
    await armar(QuotationStatus.ENVIADA);
    await service.update(
      'q-7',
      { quotation_status: QuotationStatus.EN_NEGOCIACION } as never,
      1,
      'administrador',
      undefined,
      camila,
    );
    expect(registrar).toHaveBeenCalledWith(
      camila,
      1,
      'q-7',
      'enviada',
      'en_negociacion',
      undefined,
    );
  });

  it('un rechazo lleva su motivo', async () => {
    await armar(QuotationStatus.ENVIADA);
    await service.update(
      'q-7',
      {
        quotation_status: QuotationStatus.RECHAZADA,
        loss_reason: 'precio',
      } as never,
      1,
      'administrador',
      undefined,
      camila,
    );
    expect(registrar).toHaveBeenCalledWith(
      camila,
      1,
      'q-7',
      'enviada',
      'rechazada',
      'precio',
    );
  });

  it('guardar sin cambiar el estado no anota nada', async () => {
    await armar(QuotationStatus.ENVIADA);
    await service.update(
      'q-7',
      { observations: 'Llega a las 10' } as never,
      1,
      'administrador',
      undefined,
      camila,
    );
    await service.update(
      'q-7',
      { quotation_status: QuotationStatus.ENVIADA } as never,
      1,
      'administrador',
      undefined,
      camila,
    );
    expect(registrar).not.toHaveBeenCalled();
  });

  it('si el guardado falla, no se anota un cambio que no pasó', async () => {
    await armar(QuotationStatus.ENVIADA);
    repo.update.mockRejectedValue(new Error('caída'));
    await expect(
      service.update(
        'q-7',
        { quotation_status: QuotationStatus.RECHAZADA } as never,
        1,
        'administrador',
        undefined,
        camila,
      ),
    ).rejects.toThrow('caída');
    expect(registrar).not.toHaveBeenCalled();
  });

  it('marcar realizado y volver a aceptada también quedan, firmados', async () => {
    await armar(QuotationStatus.ACEPTADA);
    await service.markEventDone('q-7', 1, undefined, camila);
    expect(registrar).toHaveBeenCalledWith(
      camila,
      1,
      'q-7',
      'aceptada',
      'realizada',
      undefined,
    );

    await armar(QuotationStatus.REALIZADA);
    await service.unmarkEventDone('q-7', 1, camila);
    expect(registrar).toHaveBeenCalledWith(
      camila,
      1,
      'q-7',
      'realizada',
      'aceptada',
      undefined,
    );
  });

  it('anotarCambioDeEstado es la puerta de los otros caminos (el plan de pagos)', async () => {
    await armar(QuotationStatus.EN_NEGOCIACION);
    await service.anotarCambioDeEstado(
      camila,
      1,
      'q-7',
      'en_negociacion',
      'aceptada',
    );
    expect(registrar).toHaveBeenCalledWith(
      camila,
      1,
      'q-7',
      'en_negociacion',
      'aceptada',
      undefined,
    );
  });
});
