import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { DerechosService } from 'src/auth/derechos.service';
import { SesionOpcional } from 'src/auth/sesion-opcional.service';
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
  const empresaDe = jest.fn();
  const licitacionDe = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuotationsController],
      providers: [
        provideMock(QuotationsService, { findOne, createPublic, licitacionDe }),
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
        provideMock(SesionOpcional, { empresaDe }),
        // El botón «✨ Crear con IA» (17-10-2026).
        provideMock(GenerarCotizacionService),
        // «✉ Generar seguimiento» (17-10-2026, doc 18).
        provideMock(SeguimientoConIAService),
        provideMock(ChoquesDeFechaService),
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
      empresaDe.mockResolvedValue(null);
      const r = await controller.findOne('q1');
      expect(r.data).not.toHaveProperty('comentario_interno');
      expect(empresaDe).toHaveBeenCalledWith(undefined);
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
      empresaDe.mockResolvedValue(1);
      const r = await controller.findOne('q1', 'Bearer pase');
      expect(r.data).toHaveProperty('comentario_interno', 'interno');
      expect(empresaDe).toHaveBeenCalledWith('Bearer pase');
      expect(r.data).toHaveProperty('de_licitacion', null);
    });

    it('a su empresa le dice si es lo postulado en una licitación (solo lectura)', async () => {
      empresaDe.mockResolvedValue(1);
      licitacionDe.mockResolvedValue({ id: 40, codigo: '1532886-5-LE26' });
      const r = await controller.findOne('q1', 'Bearer pase');
      expect(r.data).toHaveProperty('de_licitacion', {
        id: 40,
        codigo: '1532886-5-LE26',
      });
      expect(licitacionDe).toHaveBeenCalledWith('q1', 1);
    });
  });
});
