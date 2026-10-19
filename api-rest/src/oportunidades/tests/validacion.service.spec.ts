import type Anthropic from '@anthropic-ai/sdk';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import type {
  AnalisisRepository,
  ValidacionRepository,
} from '../analisis/analisis.repository';
import {
  instruccionesDeValidacion,
  ValidacionService,
} from '../analisis/validacion.service';
import type { OferenteRepository } from '../oferente/oferente.repository';
import type { OportunidadesRepository } from '../oportunidades.repository';

const CUENTA = 'cuenta-1';

const REQUISITOS = [
  {
    que: 'Anexo N°1 firmado',
    tipo: 'administrativo',
    obligatorio: true,
    documento: 'Formularios_Anexos.docx',
    pagina: 0,
  },
  {
    que: 'Patente municipal vigente',
    tipo: 'administrativo',
    obligatorio: true,
    documento: 'Bases.pdf',
    pagina: 4,
  },
];

const VALIDACION = {
  resumen: 'Falta firmar el Anexo 1.',
  listo: 'casi',
  requisitos: [
    {
      que: 'Anexo N°1 firmado',
      estado: 'revisar',
      donde: 'Anexo1.pdf',
      observacion: 'Sin firma.',
    },
  ],
  otros_problemas: [],
};

const adjunto = (id: number, nombre: string) => ({
  id,
  nombre,
  ruta: `c1/oportunidades/40/postulacion/x_${nombre}`,
  tipo: 'application/pdf',
  bytes: 1000,
  seccion: 'postulacion',
  creado_en: `2026-10-17T14:0${id}:00.000Z`,
  subido_por: 'perfil-1',
  quien: null,
});

class ValidacionDePrueba extends ValidacionService {
  constructor(
    repos: Record<string, unknown>,
    readonly parse: jest.Mock,
  ) {
    super(
      repos.repo as ValidacionRepository,
      repos.analisis as AnalisisRepository,
      repos.adjuntos as AdjuntosRepository,
      repos.oferente as OferenteRepository,
      repos.oportunidades as OportunidadesRepository,
      mockPinoLogger() as unknown as PinoLogger,
    );
  }

  protected cliente(): Anthropic {
    return { messages: { parse: this.parse } } as unknown as Anthropic;
  }
}

function armar() {
  const repo = {
    ultimo: jest.fn().mockResolvedValue(null),
    crear: jest.fn((fila: Record<string, unknown>) =>
      Promise.resolve({ id: 8, estado: 'procesando', ...fila }),
    ),
    terminar: jest.fn().mockResolvedValue(undefined),
    abandonarAntesDe: jest.fn().mockResolvedValue(undefined),
    descargar: jest.fn().mockResolvedValue(Buffer.from('%PDF anexo')),
  };
  const analisis = {
    ultimo: jest.fn().mockResolvedValue({
      id: 5,
      estado: 'listo',
      resultado: {
        requisitos: REQUISITOS,
        criterios: [
          { nombre: 'Oferta económica', peso: '45%', como_se_evalua: 'precio' },
        ],
      },
    }),
  };
  const adjuntos = {
    listar: jest.fn().mockResolvedValue([adjunto(1, 'Anexo1.pdf')]),
    perfilDe: jest.fn().mockResolvedValue('perfil-1'),
  };
  const oferente = {
    oferente: jest.fn().mockResolvedValue({
      razon_social: 'VALLE DEL SOL QUILLON SPA',
      rut: '77.701.305-K',
    }),
    documentos: jest
      .fn()
      .mockResolvedValue([
        { tipo: 'patente', nombre: 'Patente 2026.pdf', vence: '2026-12-31' },
      ]),
  };
  const oportunidades = {
    ficha: jest.fn().mockResolvedValue({
      id: 40,
      codigo: '1532886-5-LE26',
      proceso: {
        nombre: 'Ceremonia y Cena Día del Funcionario',
        organismo: 'I MUNICIPALIDAD DE QUILLON',
        fecha_cierre: '2026-10-19T19:00:00.000Z',
      },
    }),
  };
  const parse = jest.fn().mockResolvedValue({
    stop_reason: 'end_turn',
    usage: { input_tokens: 50_000, output_tokens: 4_000 },
    parsed_output: VALIDACION,
  });
  const servicio = new ValidacionDePrueba(
    { repo, analisis, adjuntos, oferente, oportunidades },
    parse,
  );
  return { repo, analisis, adjuntos, oferente, oportunidades, parse, servicio };
}

const conLlave = async (prueba: () => Promise<void>) => {
  const antes = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'llave-de-prueba';
  try {
    await prueba();
  } finally {
    if (antes === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = antes;
  }
};

describe('ValidacionService — pedir', () => {
  it('sin un análisis listo de las bases, 400: la validación revisa su checklist', () =>
    conLlave(async () => {
      const { analisis, repo, servicio } = armar();
      analisis.ultimo.mockResolvedValue(null);
      await expect(servicio.pedir(1, CUENTA, 40)).rejects.toThrow(
        'Primero analiza las bases',
      );
      analisis.ultimo.mockResolvedValue({ id: 5, estado: 'procesando' });
      await expect(servicio.pedir(1, CUENTA, 40)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      analisis.ultimo.mockResolvedValue({
        id: 5,
        estado: 'listo',
        resultado: { requisitos: [] },
      });
      await expect(servicio.pedir(1, CUENTA, 40)).rejects.toThrow(
        'no trae requisitos',
      );
      expect(repo.crear).not.toHaveBeenCalled();
    }));

  it('sin nada de la postulación ni de la carpeta, 400; otra empresa, 404', () =>
    conLlave(async () => {
      const { adjuntos, oferente, oportunidades, servicio } = armar();
      adjuntos.listar.mockResolvedValue([]);
      oferente.documentos.mockResolvedValue([]);
      await expect(servicio.pedir(1, CUENTA, 40)).rejects.toThrow(
        'Sube primero lo que vas a presentar',
      );
      oportunidades.ficha.mockResolvedValue(null);
      await expect(servicio.pedir(2, CUENTA, 40)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    }));

  it('crea la fila con el análisis que revisa, lee solo la postulación y sigue por detrás', () =>
    conLlave(async () => {
      const { adjuntos, repo, servicio } = armar();
      const ejecutar = jest
        .spyOn(servicio, 'ejecutar')
        .mockResolvedValue(undefined);

      const fila = await servicio.pedir(1, CUENTA, 40);

      expect(fila).toMatchObject({ id: 8, estado: 'procesando' });
      expect(adjuntos.listar).toHaveBeenCalledWith(1, 40, 'postulacion');
      expect(repo.crear).toHaveBeenCalledWith(
        expect.objectContaining({
          company_id: 1,
          oportunidad_id: 40,
          analisis_id: 5,
          modelo: 'claude-opus-5-5',
          archivos: [{ id: 1, nombre: 'Anexo1.pdf' }],
          pedido_por: 'perfil-1',
        }),
      );
      expect(ejecutar).toHaveBeenCalledWith(
        1,
        8,
        expect.any(Array),
        [],
        expect.objectContaining({
          codigo: '1532886-5-LE26',
          requisitos: REQUISITOS,
          carpeta: [
            {
              tipo: 'patente',
              nombre: 'Patente 2026.pdf',
              vence: '2026-12-31',
            },
          ],
        }),
      );
    }));
});

describe('ValidacionService — ejecutar', () => {
  const contexto = {
    codigo: '1532886-5-LE26',
    nombre: 'Ceremonia y Cena Día del Funcionario',
    organismo: 'I MUNICIPALIDAD DE QUILLON',
    fecha_cierre: '2026-10-19T19:00:00.000Z',
    hoy: '2026-10-17',
    oferente: null,
    carpeta: [],
    requisitos: REQUISITOS,
    criterios: [],
  };

  it('manda la postulación a Opus y guarda el resultado con su costo', async () => {
    const { repo, parse, servicio } = armar();
    await servicio.ejecutar(
      1,
      8,
      [adjunto(1, 'Anexo1.pdf')] as never,
      [],
      contexto,
    );
    const [[pedido]] = parse.mock.calls as Array<
      [{ model: string; messages: Array<{ content: Array<{ type: string }> }> }]
    >;
    expect(pedido.model).toBe('claude-opus-5-5');
    expect(pedido.messages[0].content.map((b) => b.type)).toEqual([
      'document',
      'text',
    ]);
    // 50.000 de entrada a US$4 el millón + 4.000 de salida a US$20.
    expect(repo.terminar).toHaveBeenCalledWith(1, 8, {
      estado: 'listo',
      resultado: VALIDACION,
      no_leidos: [],
      tokens_entrada: 50_000,
      tokens_salida: 4_000,
      costo_usd: 0.28,
    });
  });

  it('sin archivos de la postulación igual valida con la carpeta (y lo dice)', async () => {
    const { parse, servicio } = armar();
    await servicio.ejecutar(1, 8, [], [], contexto);
    const [[pedido]] = parse.mock.calls as Array<
      [{ messages: Array<{ content: Array<{ type: string; text?: string }> }> }]
    >;
    expect(pedido.messages[0].content).toHaveLength(1);
    expect(pedido.messages[0].content[0].text).toContain('con la carpeta');
  });

  it('nunca revienta: la falla queda escrita', async () => {
    const { repo, parse, servicio } = armar();
    parse.mockRejectedValue(new Error('se cortó la red'));
    await expect(
      servicio.ejecutar(1, 8, [], [], contexto),
    ).resolves.toBeUndefined();
    expect(repo.terminar).toHaveBeenCalledWith(1, 8, {
      estado: 'error',
      error: expect.stringContaining('se cortó la red') as unknown,
    });
  });
});

describe('lo que lee la IA para validar', () => {
  it('el checklist numerado, los datos de la empresa y la carpeta con su vencimiento', () => {
    const t = instruccionesDeValidacion({
      codigo: '4364-13-LE26',
      nombre: 'Producción de Evento día del Profesor',
      organismo: 'I MUNICIPALIDAD DE QUILLON',
      fecha_cierre: '2026-10-19T18:01:00.000Z',
      hoy: '2026-10-17',
      oferente: {
        razon_social: 'VALLE DEL SOL QUILLON SPA',
        rut: '77.701.305-K',
      } as never,
      carpeta: [{ tipo: 'f30', nombre: 'F30 octubre.pdf', vence: null }],
      requisitos: REQUISITOS,
      criterios: [
        { nombre: 'Precio', peso: '30%', como_se_evalua: 'menor precio' },
      ],
    });
    expect(t).toContain('1. [administrativo, obligatorio] Anexo N°1 firmado');
    expect(t).toContain(
      '2. [administrativo, obligatorio] Patente municipal vigente (Bases.pdf, pág. 4)',
    );
    expect(t).toContain('RUT: 77.701.305-K');
    expect(t).toContain('Certificado F30: F30 octubre.pdf (no vence)');
    expect(t).toContain('Precio (30%)');
    expect(t).toContain('"vencido"');
    // El Registro de Proveedores se da por hecho (Felipe, 19-10).
    expect(t).toContain(
      'Registro de Proveedores (ChileProveedores) es siempre "cumple"',
    );
  });
});
