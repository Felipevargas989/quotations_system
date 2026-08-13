import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { ClientsService } from 'src/clients/clients.service';
import { EmailService } from 'src/email/email.service';
import { PaymentsService } from 'src/payments/payments.service';
import { QuotationStatus } from 'src/quotations/constants/constants';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { RefundsService } from 'src/refunds/refunds.service';
import { StorageService } from 'src/storage/storage.service';
import { UsersService } from 'src/users/users.service';
import { PortalReceiptsRepository } from '../../portal-receipts.controller';
import { QuotationsService } from '../../quotations.service';

// EL CANDADO DEL EVENTO REALIZADO (13-08-2026, regla de Felipe).
//
// "El realizado es un estado de que ya se hizo. Puede faltar cobrar,
// facturar, etc., pero ya se hizo." La cotización queda congelada como
// historia del negocio; lo posterior al evento (cobranza, seguimiento,
// documentos, encuesta) sigue vivo porque no pasa por update().
//
// Estas pruebas existen para que el candado no se caiga por accidente:
// si alguien reordena update() o remove(), acá se entera.
describe('Candado del evento realizado', () => {
  let service: QuotationsService;
  let repo: jest.Mocked<QuotationsRepository>;
  let payments: jest.Mocked<PaymentsService>;

  const cotizacion = (estado: QuotationStatus) => ({
    data: { id: '1', company_id: 1, quotation_status: estado },
    error: null,
  });

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ data: {}, error: null }),
      remove: jest.fn().mockResolvedValue({ data: {}, error: null }),
    } as any;
    payments = {
      findAllPaymentsFromQuotation: jest
        .fn()
        .mockResolvedValue({ data: [], error: null }),
      deletePaymentPlan: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotationsService,
        { provide: QuotationsRepository, useValue: repo },
        {
          provide: RefundsService,
          useValue: { findPendingByQuotation: jest.fn().mockResolvedValue([]) },
        },
        { provide: PaymentsService, useValue: payments },
        { provide: ClientsService, useValue: {} },
        { provide: EmailService, useValue: {} },
        { provide: UsersService, useValue: {} },
        { provide: StorageService, useValue: {} },
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

  describe('la cotización no se edita', () => {
    it('rechaza cambiar la propina de un evento realizado', async () => {
      repo.findOne.mockResolvedValue(cotizacion(QuotationStatus.REALIZADA));
      await expect(
        service.update('1', { tip_amount: 90000 } as any, 1),
      ).rejects.toThrow(BadRequestException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('rechaza cambiar los montos de un evento realizado', async () => {
      repo.findOne.mockResolvedValue(cotizacion(QuotationStatus.REALIZADA));
      await expect(
        service.update('1', { total_amount: 1 } as any, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza mover la fecha de un evento realizado', async () => {
      repo.findOne.mockResolvedValue(cotizacion(QuotationStatus.REALIZADA));
      await expect(
        service.update('1', { event_date: '2026-01-01' } as any, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('el candado también rige para el administrador', async () => {
      repo.findOne.mockResolvedValue(cotizacion(QuotationStatus.REALIZADA));
      await expect(
        service.update('1', { people_count: 5 } as any, 1, 'administrador'),
      ).rejects.toThrow(BadRequestException);
    });

    it('una cotización ACEPTADA se sigue editando normal', async () => {
      repo.findOne.mockResolvedValue(cotizacion(QuotationStatus.ACEPTADA));
      await service.update('1', { observations: 'ok' } as any, 1);
      expect(repo.update).toHaveBeenCalled();
    });
  });

  describe('las salidas de estado se cierran', () => {
    // Las cuatro puertas que permitían des-realizar o anular por la
    // ventana, saltándose la llave de "volver a aceptada".
    const salidas: [string, QuotationStatus][] = [
      ['aceptada (des-realizar desde el tablero)', QuotationStatus.ACEPTADA],
      [
        'cancelada (anular un evento que ya ocurrió)',
        QuotationStatus.CANCELADA,
      ],
      [
        'en_negociacion (y perder el plan de pagos)',
        QuotationStatus.EN_NEGOCIACION,
      ],
      ['rechazada', QuotationStatus.RECHAZADA],
    ];
    it.each(salidas)('un realizado NO puede pasar a %s', async (_, destino) => {
      repo.findOne.mockResolvedValue(cotizacion(QuotationStatus.REALIZADA));
      await expect(
        service.update('1', { quotation_status: destino } as any, 1),
      ).rejects.toThrow(BadRequestException);
      expect(payments.deletePaymentPlan).not.toHaveBeenCalled();
    });
  });

  describe('el borrado', () => {
    it('no borra un evento realizado', async () => {
      repo.findOne.mockResolvedValue(cotizacion(QuotationStatus.REALIZADA));
      await expect(service.remove('1', 1)).rejects.toThrow(BadRequestException);
      expect(repo.remove).not.toHaveBeenCalled();
    });

    it('sí borra una cotización en negociación', async () => {
      repo.findOne.mockResolvedValue(
        cotizacion(QuotationStatus.EN_NEGOCIACION),
      );
      await service.remove('1', 1);
      expect(repo.remove).toHaveBeenCalledWith('1', 1);
    });

    it('borrar algo que ya no existe NO revienta (lo pilló la cuadrilla)', async () => {
      // findOne usa .single(): un id inexistente vuelve como error
      // PGRST116, no como null. La primera versión del candado lo
      // relanzaba y convertía un borrado inocuo en un error 500.
      repo.findOne.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'no rows' },
      } as any);
      await service.remove('fantasma', 1);
      expect(repo.remove).toHaveBeenCalledWith('fantasma', 1);
    });

    it('si la lectura falla de verdad, NO borra (ante la duda, no)', async () => {
      repo.findOne.mockResolvedValue({
        data: null,
        error: { code: '08006', message: 'connection failure' },
      } as any);
      await expect(service.remove('1', 1)).rejects.toBeDefined();
      expect(repo.remove).not.toHaveBeenCalled();
    });

    it('un realizado de OTRA empresa no se cuela por el candado', async () => {
      // El candado compara company_id: si no calza, deja seguir para
      // que el repositorio responda lo suyo (no encontrado).
      repo.findOne.mockResolvedValue({
        data: { id: '1', company_id: 99, quotation_status: 'realizada' },
        error: null,
      } as any);
      await service.remove('1', 1);
      expect(repo.remove).toHaveBeenCalledWith('1', 1);
    });
  });

  describe('lo posterior al evento sigue vivo', () => {
    // Las tres escrituras legítimas sobre una fila realizada no pasan
    // por update(), y por eso el candado no las toca. Si alguien las
    // muda a update() en el futuro, estas pruebas se caen y avisan.
    it('volver a aceptada (deshacer una marca equivocada) funciona', async () => {
      repo.findOne.mockResolvedValue(cotizacion(QuotationStatus.REALIZADA));
      await service.unmarkEventDone('1', 1);
      expect(repo.update).toHaveBeenCalledWith(
        '1',
        { quotation_status: QuotationStatus.ACEPTADA },
        1,
      );
    });

    it('la cosecha del mes puede marcar un evento realizado', async () => {
      repo.findOne.mockResolvedValue(cotizacion(QuotationStatus.REALIZADA));
      await service.setHarvestStatus('1', 1, 'contactado' as any, 7);
      expect(repo.update).toHaveBeenCalled();
    });
  });
});
