import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { ClientsService } from 'src/clients/clients.service';
import { ConsultasService } from 'src/consultas/consultas.service';
import { EmailService } from 'src/email/email.service';
import { PaymentsService } from 'src/payments/payments.service';
import {
  QuotationStatus,
  RequestType,
} from 'src/quotations/constants/constants';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { RefundsService } from 'src/refunds/refunds.service';
import { StorageService } from 'src/storage/storage.service';
import { UsersService } from 'src/users/users.service';
import { PortalReceiptsRepository } from '../../portal-receipts.controller';
import { QuotationsService } from '../../quotations.service';

/**
 * LOS DERECHOS DEL PLAN DENTRO DE LAS COTIZACIONES (14-09-2026, paso 3.2).
 *
 * Son las revisiones que NO pueden vivir en la puerta, porque dependen de
 * los datos: cuántas cotizaciones lleva el mes, si el evento dura más de un
 * día, de qué empresa es el token del portal. La matriz de derechos las
 * nombra pero no puede verlas; estas pruebas son las que las cuidan.
 */
/**
 * Lo que estas pruebas miden es el CANDADO, no el camino completo de
 * guardar una cotización (eso ya lo cuidan otras pruebas y pediría
 * mockear medio sistema). "Pasa el candado" quiere decir: o terminó bien,
 * o falló más adelante por algo que no es un 403 de plan.
 */
const pasaElCandado = async (promesa: Promise<unknown>) => {
  try {
    await promesa;
  } catch (e) {
    if (e instanceof ForbiddenException) {
      throw new Error(
        `el candado del plan rechazó, y no debía: ${JSON.stringify(e.getResponse())}`,
      );
    }
  }
};

describe('Los derechos del plan en las cotizaciones', () => {
  let service: QuotationsService;
  let repo: jest.Mocked<QuotationsRepository>;
  let email: { sendEmail: jest.Mock };
  let consultas: { embudoPara: jest.Mock; registrar: jest.Mock };

  const COTIZA = {
    derechos: ['base' as const],
    cotizaciones_mes: 20,
    plan: 'cotiza',
  };
  const CRECE = {
    derechos: [
      'base',
      'varios_dias',
      'post_venta',
      'consultas',
      'encuestas',
    ] as never,
    cotizaciones_mes: null,
    plan: 'crece',
  };

  const unaCotizacion = {
    request_type: RequestType.COTIZACION,
    event_date: '2026-10-01',
    people_count: 10,
    items: { fixed_services: [], variable_services: [] },
  } as never;

  beforeEach(async () => {
    repo = {
      contarDesde: jest.fn().mockResolvedValue(0),
      nextQuotationNumber: jest.fn().mockResolvedValue(1),
      create: jest.fn().mockResolvedValue({ data: { id: 'x' }, error: null }),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ data: {}, error: null }),
      findPortalContact: jest.fn(),
      // El destinatario de la encuesta: el mandante vinculado.
      findContactById: jest.fn().mockResolvedValue({
        name: 'Mandante',
        email: 'mandante@ejemplo.cl',
        portal_token: null,
      }),
      findAllByContact: jest.fn().mockResolvedValue({ data: [] }),
    } as never;
    email = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    consultas = {
      embudoPara: jest.fn().mockResolvedValue(true),
      registrar: jest.fn().mockResolvedValue({ id: 7 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotationsService,
        { provide: QuotationsRepository, useValue: repo },
        { provide: RefundsService, useValue: {} },
        { provide: PaymentsService, useValue: {} },
        { provide: ClientsService, useValue: {} },
        { provide: EmailService, useValue: email },
        { provide: UsersService, useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: ConsultasService, useValue: consultas },
        { provide: PortalReceiptsRepository, useValue: {} },
        {
          provide: PinoLogger,
          useValue: {
            setContext: jest.fn(),
            error: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get<QuotationsService>(QuotationsService);
  });

  // ── EL TOPE DE 20 DEL PLAN COTIZA ──────────────────────────────────
  describe('el tope de cotizaciones del mes', () => {
    it('con 19 usadas, la número 20 entra', async () => {
      repo.contarDesde.mockResolvedValue(19);
      await pasaElCandado(service.create(unaCotizacion, 1, 'u1', COTIZA));
      expect(repo.nextQuotationNumber).toHaveBeenCalled();
    });

    it('con 20 usadas, la siguiente se rechaza', async () => {
      repo.contarDesde.mockResolvedValue(20);
      await expect(
        service.create(unaCotizacion, 1, 'u1', COTIZA),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rechazar NO quema un número de cotización', async () => {
      // El contador de la base es atómico y no se devuelve: si la
      // revisión corriera después, cada rechazo saltaría un número.
      repo.contarDesde.mockResolvedValue(20);
      await expect(
        service.create(unaCotizacion, 1, 'u1', COTIZA),
      ).rejects.toThrow();
      expect(repo.nextQuotationNumber).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('un requerimiento no gasta cupo: solo cuentan las cotizaciones', async () => {
      repo.contarDesde.mockResolvedValue(20);
      await pasaElCandado(
        service.create(
          {
            ...unaCotizacion,
            request_type: RequestType.REQUERIMIENTO,
          } as never,
          1,
          'u1',
          COTIZA,
        ),
      );
      expect(repo.contarDesde).not.toHaveBeenCalled();
    });

    it('sin tope ni se cuenta', async () => {
      await pasaElCandado(service.create(unaCotizacion, 1, 'u1', CRECE));
      expect(repo.contarDesde).not.toHaveBeenCalled();
    });

    it('sin derechos (llamada interna) no se revisa nada', async () => {
      await pasaElCandado(service.create(unaCotizacion, 1, 'u1'));
      expect(repo.contarDesde).not.toHaveBeenCalled();
    });
  });

  // ── LOS EVENTOS DE VARIOS DÍAS ─────────────────────────────────────
  describe('los eventos de varios días', () => {
    it('el plan Cotiza no puede crear uno', async () => {
      await expect(
        service.create(
          { ...unaCotizacion, event_end_date: '2026-10-03' } as never,
          1,
          'u1',
          COTIZA,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Opera y Crece sí', async () => {
      await pasaElCandado(
        service.create(
          { ...unaCotizacion, event_end_date: '2026-10-03' } as never,
          1,
          'u1',
          CRECE,
        ),
      );
      expect(repo.nextQuotationNumber).toHaveBeenCalled();
    });

    it('un evento de un día pasa en cualquier plan', async () => {
      await pasaElCandado(service.create(unaCotizacion, 1, 'u1', COTIZA));
      expect(repo.nextQuotationNumber).toHaveBeenCalled();
    });
  });

  // ── LA ENCUESTA DE SATISFACCIÓN ────────────────────────────────────
  describe('la encuesta al marcar el evento como realizado', () => {
    beforeEach(() => {
      repo.findOne.mockResolvedValue({
        data: {
          id: 'q1',
          company_id: 1,
          quotation_status: QuotationStatus.ACEPTADA,
          survey_sent_at: null,
          client_id: 'c1',
          client_contact_id: 5,
          clients: { name: 'Cliente', email: 'cliente@ejemplo.cl' },
          companies: { name: 'Empresa' },
        },
        error: null,
      } as never);
    });

    it('sin el derecho, el evento se marca igual pero no sale la encuesta', async () => {
      await pasaElCandado(
        service.markEventDone('q1', 1, { derechos: ['base'] }),
      );
      expect(repo.update).toHaveBeenCalled(); // el estado sí cambia
      expect(email.sendEmail).not.toHaveBeenCalled();
    });

    it('con el derecho, sale', async () => {
      await pasaElCandado(
        service.markEventDone('q1', 1, { derechos: ['base', 'encuestas'] }),
      );
      expect(email.sendEmail).toHaveBeenCalled();
    });
  });

  // ── EL EMBUDO DEL FORMULARIO PÚBLICO ───────────────────────────────
  describe('el formulario público', () => {
    const solicitud = {
      event_type: 'Matrimonio',
      client_name: 'Persona',
      email: 'persona@ejemplo.cl',
      event_date: '2026-12-01',
      people_count: 100,
    } as never;

    it('sin el derecho de Consultas, NO entra al embudo', async () => {
      await pasaElCandado(
        service.createPublic(solicitud, 1, {
          derechos: ['base'],
          usuarios_max: 1,
          cotizaciones_mes: 20,
        }),
      );
      expect(consultas.registrar).not.toHaveBeenCalled();
    });

    it('con el derecho, la solicitud entra al embudo', async () => {
      const r = await service.createPublic(solicitud, 1, {
        derechos: ['base', 'consultas'],
        usuarios_max: null,
        cotizaciones_mes: null,
      });
      expect(consultas.registrar).toHaveBeenCalled();
      expect(r).toEqual({ tipo: 'consulta', id: 7 });
    });
  });

  // ── EL PORTAL DEL MANDANTE ─────────────────────────────────────────
  describe('el portal del cliente', () => {
    const conPlan = (plan: string, estado = 'activo') => ({
      data: {
        id: 1,
        name: 'Contacto',
        client_id: 'c1',
        clients: {
          name: 'Cliente',
          company_id: 1,
          companies: { name: 'Empresa', plan, estado_plan: estado },
        },
      },
      error: null,
    });
    const token = 'x'.repeat(64);

    it('una empresa del plan Cotiza no tiene portal: el enlace no abre', async () => {
      repo.findPortalContact.mockResolvedValue(conPlan('cotiza') as never);
      await expect(service.getPortalData(token)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('una empresa de Gestiona y Cobra sí', async () => {
      repo.findPortalContact.mockResolvedValue(conPlan('gestiona') as never);
      // Llega más allá del candado: falla después, por los mocks vacíos,
      // pero NO con un 403.
      await expect(service.getPortalData(token)).rejects.not.toThrow(
        ForbiddenException,
      );
    });
  });
});
