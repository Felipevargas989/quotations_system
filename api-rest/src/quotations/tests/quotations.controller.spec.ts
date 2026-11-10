import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { DerechosService } from 'src/auth/derechos.service';
import { SesionOpcional } from 'src/auth/sesion-opcional.service';
import { AlcanceDeRecepcion } from 'src/clients/alcance-de-recepcion';
import { mockPinoLogger, provideMock } from '../../testing/mocks';
import { ChoquesDeFechaService } from '../choques/choques.service';
import { EnvioCotizacionService } from '../envio-cotizacion.service';
import { GenerarCotizacionService } from '../generar/generar.service';
import { QuotationsController } from '../quotations.controller';
import { QuotationsService } from '../quotations.service';
import { RescateDelFormularioService } from '../rescate-del-formulario.service';
import { SeguimientoConIAService } from '../seguimiento/seguimiento.service';

// Esqueleto reparado (Fase 2 Bloque B): el controller se construye con
// sus servicios mockeados — nunca instanciar servicios reales acá.
describe('QuotationsController', () => {
  let controller: QuotationsController;
  const findOne = jest.fn();
  const createPublic = jest.fn();
  const perfilDe = jest.fn();
  const licitacionDe = jest.fn();
  const findAll = jest.fn();
  // Lo que ve recepción (doc 21): por defecto, todo.
  const ve = jest.fn().mockResolvedValue(true);
  // La lista pasa entera por la regla de recepción y de los permisos por
  // cargo (doc 21 y doc 22 §4.4), que se prueba en alcance-de-recepcion.
  const deLaLista = jest.fn((_s: unknown, filas: unknown[]) =>
    Promise.resolve(filas),
  );
  const exigirElTipoDelCliente = jest.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuotationsController],
      providers: [
        provideMock(QuotationsService, {
          findOne,
          findAll,
          createPublic,
          licitacionDe,
          create: jest.fn().mockResolvedValue({ id: 'q-nueva' }),
        }),
        provideMock(EnvioCotizacionService),
        // El controller pregunta los derechos de la empresa en las
        // puertas públicas, que no tienen sesión (paso 3.2, 14-09-2026).
        provideMock(DerechosService, { deEmpresa: jest.fn() }),
        { provide: PinoLogger, useValue: mockPinoLogger() },
        {
          provide: RescateDelFormularioService,
          useValue: { rescatar: jest.fn() },
        },
        // GET /quotations/:id es pública: quién pregunta (17-10-2026).
        provideMock(SesionOpcional, { perfilDe }),
        // El botón «✨ Crear con IA» (17-10-2026).
        provideMock(GenerarCotizacionService),
        // «✉ Generar seguimiento» (17-10-2026, doc 18).
        provideMock(SeguimientoConIAService),
        provideMock(ChoquesDeFechaService),
        provideMock(AlcanceDeRecepcion, {
          ve,
          deLaLista,
          exigirElTipoDelCliente,
        }),
      ],
    }).compile();

    controller = module.get<QuotationsController>(QuotationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // El comentario interno (17-10-2026) nunca sale al cliente: la encuesta
  // abre GET /quotations/:id sin sesión.
  describe('GET /quotations/:id y el comentario interno', () => {
    const fila = { id: 'q1', company_id: 1, comentario_interno: 'interno' };

    beforeEach(() => {
      findOne.mockResolvedValue({ data: { ...fila }, error: null });
      licitacionDe.mockResolvedValue(null);
    });

    it('sin sesión, llega sin el comentario', async () => {
      perfilDe.mockResolvedValue(null);
      const r = await controller.findOne('q1');
      expect(r.data).not.toHaveProperty('comentario_interno');
      expect(perfilDe).toHaveBeenCalledWith(undefined);
      // Ni la licitación: eso es de la empresa (decisión 35).
      expect(r.data).not.toHaveProperty('de_licitacion');
      expect(licitacionDe).not.toHaveBeenCalled();
    });

    it('el formulario público tampoco lo devuelve al visitante', async () => {
      createPublic.mockResolvedValue({ ...fila, comentario_interno: null });
      const r = await controller.createPublic({} as never, 1);
      expect(r).not.toHaveProperty('comentario_interno');
      expect(r).toHaveProperty('id', 'q1');
    });

    it('con sesión de la misma empresa, llega con el comentario', async () => {
      perfilDe.mockResolvedValue({ company_id: 1, role: 'vendedor' });
      const r = await controller.findOne('q1', 'Bearer pase');
      expect(r.data).toHaveProperty('comentario_interno', 'interno');
      expect(perfilDe).toHaveBeenCalledWith('Bearer pase');
      expect(r.data).toHaveProperty('de_licitacion', null);
    });

    it('a su empresa le dice si es lo postulado en una licitación (solo lectura)', async () => {
      perfilDe.mockResolvedValue({ company_id: 1, role: 'administrador' });
      licitacionDe.mockResolvedValue({ id: 40, codigo: '1532886-5-LE26' });
      const r = await controller.findOne('q1', 'Bearer pase');
      expect(r.data).toHaveProperty('de_licitacion', {
        id: 40,
        codigo: '1532886-5-LE26',
      });
      expect(licitacionDe).toHaveBeenCalledWith('q1', 1);
    });
  });

  // Lo que ve recepción (doc 21, 04-11-2026).
  describe('recepción y las cotizaciones de particulares', () => {
    const recepcion = { id: 'u1', company_id: 1, role: 'recepcion' } as never;

    it('la ficha de una que no ve llega como agenda: sin plata, con sus categorías', async () => {
      findOne.mockResolvedValue({
        data: {
          id: 'q1',
          company_id: 1,
          quotation_number: 408,
          request_type: 'cotizacion',
          quotation_status: 'aceptada',
          event_date: '2026-12-20',
          people_count: 120,
          total_amount: 21_844_000,
          subtotal_amount: 18_356_303,
          value_per_person: 182_000,
          observations: 'Valor acordado $182.000 por persona',
          comentario_interno: 'cliente preferente',
          items: {
            variable_services: [
              { category: 'Alimentación', price: 25_000 },
              { category: 'Piscina', price: 5_000 },
              { category: 'Alimentación', price: 12_000 },
            ],
          },
          clients: {
            name: 'FEPASA',
            email: 'rrhh@fepasa.cl',
            client_type: 'Empresas',
          },
        },
        error: null,
      });
      perfilDe.mockResolvedValue({ company_id: 1, role: 'recepcion' });
      ve.mockResolvedValueOnce(false);
      licitacionDe.mockClear();
      const r = (await controller.findOne('q1', 'Bearer pase')) as {
        data: Record<string, unknown>;
      };
      expect(r.data).toEqual({
        solo_agenda: true,
        id: 'q1',
        company_id: 1,
        quotation_number: 408,
        request_type: 'cotizacion',
        quotation_status: 'aceptada',
        event_date: '2026-12-20',
        people_count: 120,
        clients: { name: 'FEPASA' },
        categorias: ['Alimentación', 'Piscina'],
      });
      expect(licitacionDe).not.toHaveBeenCalled();
    });

    it('el calendario le muestra todos los eventos, por su propia regla', async () => {
      const filas = [{ id: 'a' }, { id: 'b' }];
      findAll.mockResolvedValue(filas);
      await controller.findAll(recepcion, { vista: 'calendario' } as never);
      expect(deLaLista).toHaveBeenCalledWith(recepcion, filas, 'calendario');
    });

    it('el tablero pasa por la regla', async () => {
      const filas = [{ id: 'a' }, { id: 'b' }];
      findAll.mockResolvedValue(filas);
      deLaLista.mockResolvedValueOnce([filas[0]]);
      const r = await controller.findAll(recepcion, {} as never);
      expect(deLaLista).toHaveBeenCalledWith(recepcion, filas, undefined);
      expect(r).toEqual([filas[0]]);
    });

    it('crear una cotización: el cliente tiene que ser particular y sin descuento', async () => {
      await controller.create(
        { request_type: 'cotizacion', client_id: 'c1' } as never,
        recepcion,
      );
      expect(exigirElTipoDelCliente).toHaveBeenCalledWith(recepcion, 'c1');
      await expect(
        controller.create(
          {
            request_type: 'cotizacion',
            client_id: 'c1',
            discount_percentage: 10,
          } as never,
          recepcion,
        ),
      ).rejects.toThrow('descuentos');
    });

    // Doc 22 §9: cada cargo cotiza solo a los tipos que trabaja; el
    // descuento sigue siendo cosa de recepción.
    it('un vendedor también pasa por el tipo del cliente, con descuento', async () => {
      exigirElTipoDelCliente.mockClear();
      const vendedor = { id: 'u2', company_id: 1, role: 'vendedor' } as never;
      await controller.create(
        {
          request_type: 'cotizacion',
          client_id: 'c1',
          discount_percentage: 10,
        } as never,
        vendedor,
      );
      expect(exigirElTipoDelCliente).toHaveBeenCalledWith(vendedor, 'c1');
    });

    it('un requerimiento lo crea como siempre, sin revisar el cliente', async () => {
      exigirElTipoDelCliente.mockClear();
      await controller.create(
        { request_type: 'requerimiento', client_id: 'c2' } as never,
        recepcion,
      );
      expect(exigirElTipoDelCliente).not.toHaveBeenCalled();
    });
  });
});
