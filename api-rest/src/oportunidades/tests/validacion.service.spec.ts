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
  type ArchivoParaValidar,
  loQueCabe,
  loQueVaEnElZip,
} from '../analisis/el-zip-para-validar';
import { ValidacionService } from '../analisis/validacion.service';
import type { OferenteRepository } from '../oferente/oferente.repository';
import type { OportunidadesRepository } from '../oportunidades.repository';
import type { PiezaDelSet } from '../postulacion/el-set';
import type { ElSetService } from '../postulacion/el-set.service';

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
      gravedad: 'grave',
    },
  ],
  otros_graves: [],
  otros_problemas: [],
};

/** Una pieza del ZIP como la arma el set (decisión 83: es lo que se lee). */
const pieza = (
  nombre: string,
  extra: Partial<PiezaDelSet> = {},
): PiezaDelSet => ({
  nombre,
  ruta: `c1/oportunidades/40/postulacion/x_${nombre}`,
  bytes: 1000,
  carpetas: ['administrativa'],
  que_es: 'formulario',
  aviso: null,
  ...extra,
});

const MB = 1024 * 1024;

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
      repos.elSet as ElSetService,
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
    perfilDe: jest.fn().mockResolvedValue('perfil-1'),
  };
  const elSet = {
    piezas: jest.fn().mockResolvedValue([pieza('Anexo1.pdf')]),
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
    { repo, analisis, adjuntos, oferente, oportunidades, elSet },
    parse,
  );
  return {
    repo,
    analisis,
    adjuntos,
    oferente,
    oportunidades,
    elSet,
    parse,
    servicio,
  };
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
      const { elSet, oferente, oportunidades, servicio } = armar();
      elSet.piezas.mockResolvedValue([]);
      oferente.documentos.mockResolvedValue([]);
      await expect(servicio.pedir(1, CUENTA, 40)).rejects.toThrow(
        'Sube primero lo que vas a presentar',
      );
      oportunidades.ficha.mockResolvedValue(null);
      await expect(servicio.pedir(2, CUENTA, 40)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    }));

  it('decisión 91: le dice a la IA si es una compra ágil', () =>
    conLlave(async () => {
      const { oportunidades, servicio } = armar();
      const ejecutar = jest
        .spyOn(servicio, 'ejecutar')
        .mockResolvedValue(undefined);
      oportunidades.ficha.mockResolvedValue({
        id: 5171,
        codigo: '1030177-85-COT26',
        proceso: {
          tipo: 'compra_agil',
          nombre: 'Servicio de Alimentación Autoridades',
          organismo: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
          fecha_cierre: '2026-10-27T19:15:00.000Z',
        },
      });
      await servicio.pedir(1, CUENTA, 5171);
      expect(ejecutar.mock.calls[0][4]).toMatchObject({ compra_agil: true });
    }));

  it('crea la fila con el análisis que revisa, lee lo que va en el ZIP y sigue por detrás', () =>
    conLlave(async () => {
      const { elSet, repo, servicio } = armar();
      const ejecutar = jest
        .spyOn(servicio, 'ejecutar')
        .mockResolvedValue(undefined);

      const fila = await servicio.pedir(1, CUENTA, 40);

      expect(fila).toMatchObject({ id: 8, estado: 'procesando' });
      expect(elSet.piezas).toHaveBeenCalledWith(1, 40);
      expect(repo.crear).toHaveBeenCalledWith(
        expect.objectContaining({
          company_id: 1,
          oportunidad_id: 40,
          analisis_id: 5,
          modelo: 'claude-opus-5-5',
          archivos: [{ nombre: 'Anexo1.pdf', carpeta: '1. Administrativa' }],
          pedido_por: 'perfil-1',
        }),
      );
      expect(ejecutar).toHaveBeenCalledWith(
        1,
        8,
        [
          expect.objectContaining({
            nombre: 'Anexo1.pdf',
            titulo: '1. Administrativa / Anexo1.pdf',
          }),
        ],
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
          zip: [
            { donde: '1. Administrativa', nombre: 'Anexo1.pdf', leido: true },
          ],
        }),
      );
    }));

  it('decisión 90: lee solo el ZIP; lo de «Mi empresa» que no va, no se lee', () =>
    conLlave(async () => {
      const { elSet, oferente, repo, servicio } = armar();
      const ejecutar = jest
        .spyOn(servicio, 'ejecutar')
        .mockResolvedValue(undefined);
      oferente.documentos.mockResolvedValue([
        {
          tipo: 'resolucion_sanitaria',
          nombre: 'Resoluciones Valle del sol.pdf',
          ruta: 'c1/oferente/documentos/resoluciones.pdf',
          bytes: 3 * MB,
          vence: null,
          creado_en: '2026-10-19T14:56:18Z',
        },
        {
          tipo: 'patente',
          nombre: 'Patente 1 SEM 2026.pdf',
          ruta: 'c1/oferente/documentos/patente-1.pdf',
          bytes: 1000,
          vence: '2026-06-30',
          creado_en: '2026-02-01T10:00:00Z',
        },
        {
          tipo: 'patente',
          nombre: 'Patente 2 SEM 2026.pdf',
          ruta: 'c1/oferente/documentos/patente-2.pdf',
          bytes: 1000,
          vence: '2026-12-31',
          creado_en: '2026-08-01T10:00:00Z',
        },
        {
          tipo: 'f30',
          nombre: 'F30 octubre.pdf',
          ruta: 'c1/oferente/documentos/f30.pdf',
          bytes: 1000,
          vence: '2026-10-31',
          creado_en: '2026-10-01T10:00:00Z',
        },
      ]);
      elSet.piezas.mockResolvedValue([
        pieza('Anexo1.pdf'),
        pieza('Patente 2 SEM 2026.pdf', {
          ruta: 'c1/oferente/documentos/patente-2.pdf',
          que_es: 'documento',
        }),
      ]);

      await servicio.pedir(1, CUENTA, 40);

      // La fila cuenta solo lo del ZIP: la pantalla dice cuántos leyó de él.
      expect(repo.crear).toHaveBeenCalledWith(
        expect.objectContaining({
          archivos: [
            { nombre: 'Anexo1.pdf', carpeta: '1. Administrativa' },
            { nombre: 'Patente 2 SEM 2026.pdf', carpeta: '1. Administrativa' },
          ],
        }),
      );
      const [, , leibles, , contexto] = ejecutar.mock.calls[0];
      // Felipe: "debe leer solo el zip y el zip se debe armar en función de
      // lo que piden las bases". Las resoluciones y el F30 no van.
      expect(leibles.map((a) => a.titulo)).toEqual([
        '1. Administrativa / Anexo1.pdf',
        '1. Administrativa / Patente 2 SEM 2026.pdf',
      ]);
      expect(contexto).not.toHaveProperty('de_mi_empresa');
    }));

  it('decisión 95: en una compra ágil sin criterios, la validación evalúa con el de la ley', () =>
    conLlave(async () => {
      const { analisis, oportunidades, servicio } = armar();
      const ejecutar = jest
        .spyOn(servicio, 'ejecutar')
        .mockResolvedValue(undefined);
      analisis.ultimo.mockResolvedValue({
        id: 5,
        estado: 'listo',
        resultado: { requisitos: REQUISITOS, criterios: [] },
      });
      oportunidades.ficha.mockResolvedValue({
        id: 3219,
        codigo: '1346350-37-COT26',
        proceso: {
          nombre: 'Arriendo de catamarán',
          organismo: 'I MUNICIPALIDAD DE QUILLON',
          fecha_cierre: '2026-10-23T16:00:00.000Z',
          tipo: 'compra_agil',
        },
      });
      await servicio.pedir(1, CUENTA, 3219);
      const [, , , , contexto] = ejecutar.mock.calls[0];
      expect(contexto.criterios).toEqual([
        expect.objectContaining({ nombre: 'Menor precio', peso: '100%' }),
      ]);
    }));

  it('lee también lo de «Mi empresa» y los respaldos, cada uno con su carpeta (decisión 83)', () =>
    conLlave(async () => {
      const { elSet, repo, servicio } = armar();
      const ejecutar = jest
        .spyOn(servicio, 'ejecutar')
        .mockResolvedValue(undefined);
      elSet.piezas.mockResolvedValue([
        pieza('Formulario N°3 - firmado.pdf', {
          carpetas: ['tecnica'],
          adjuntos: [
            { nombre: 'OC 4366-146-SE23.pdf', ruta: 'c1/oc.pdf', bytes: 900 },
          ],
        }),
        pieza('PROGRAMA DE PROBIDAD .pdf', {
          ruta: 'c1/oferente/documentos/probidad.pdf',
          que_es: 'documento',
        }),
        pieza('Patente.jpg', { ruta: 'c1/patente.jpg', que_es: 'documento' }),
      ]);

      await servicio.pedir(1, CUENTA, 40);

      expect(repo.crear).toHaveBeenCalledWith(
        expect.objectContaining({
          archivos: [
            { nombre: 'Formulario N°3 - firmado.pdf', carpeta: '2. Técnica' },
            {
              nombre: 'OC 4366-146-SE23.pdf',
              carpeta: '2. Técnica, dentro de «Formulario N°3 - firmado.pdf»',
            },
            {
              nombre: 'PROGRAMA DE PROBIDAD .pdf',
              carpeta: '1. Administrativa',
            },
          ],
          no_leidos: [
            {
              nombre: 'Patente.jpg',
              motivo: 'la IA lee PDF y Word: súbelo en PDF para que lo revise',
            },
          ],
        }),
      );
      const [, , leibles, , contexto] = ejecutar.mock.calls[0];
      expect(leibles.map((a) => a.titulo)).toEqual([
        '2. Técnica / Formulario N°3 - firmado.pdf',
        '2. Técnica / Formulario N°3 - firmado.pdf / respaldo: OC 4366-146-SE23.pdf',
        '1. Administrativa / PROGRAMA DE PROBIDAD .pdf',
      ]);
      expect(contexto.zip?.map((a) => a.leido)).toEqual([
        true,
        true,
        true,
        false,
      ]);
    }));

  it('si los PDF del ZIP no caben en un pedido, queda fuera lo de menos y se avisa: ya no corta', () =>
    conLlave(async () => {
      const { elSet, repo, servicio } = armar();
      jest.spyOn(servicio, 'ejecutar').mockResolvedValue(undefined);
      elSet.piezas.mockResolvedValue([
        pieza('Formulario N°3 - firmado.pdf', {
          bytes: 2 * MB,
          adjuntos: [
            { nombre: 'Facturas.pdf', ruta: 'c1/f.pdf', bytes: 9 * MB },
          ],
        }),
        pieza('Resoluciones.pdf', {
          ruta: 'c1/r.pdf',
          bytes: 15 * MB,
          que_es: 'documento',
        }),
      ]);

      await expect(servicio.pedir(1, CUENTA, 40)).resolves.toMatchObject({
        estado: 'procesando',
      });
      expect(repo.crear).toHaveBeenCalledWith(
        expect.objectContaining({
          archivos: [
            {
              nombre: 'Formulario N°3 - firmado.pdf',
              carpeta: '1. Administrativa',
            },
            { nombre: 'Resoluciones.pdf', carpeta: '1. Administrativa' },
          ],
          no_leidos: [
            {
              nombre: 'Facturas.pdf',
              motivo: 'no cupo: los PDF del ZIP pasan de 22 MB juntos',
            },
          ],
        }),
      );
    }));
});

describe('lo que va en el ZIP para validar (decisión 83)', () => {
  it('cada archivo una vez, con su carpeta; un documento en dos carpetas las nombra a las dos', () => {
    const archivos = loQueVaEnElZip([
      pieza('Patente.pdf', {
        carpetas: ['administrativa', 'otros'],
        que_es: 'documento',
      }),
      pieza('Patente.pdf', { que_es: 'documento' }),
      pieza('Respaldos.pdf', {
        ruta: 'c1/r.pdf',
        carpetas: ['tecnica'],
        subcarpeta: 'Respaldos de experiencia',
        que_es: 'respaldo',
      }),
    ]);
    expect(archivos.map((a) => a.titulo)).toEqual([
      '1. Administrativa y 4. Otros / Patente.pdf',
      '2. Técnica / Respaldos de experiencia / Respaldos.pdf',
    ]);
  });

  it('el Word y el texto no cuentan para el tope de los PDF', () => {
    const archivo = (
      nombre: string,
      bytes: number,
      que_es: ArchivoParaValidar['que_es'],
    ): ArchivoParaValidar => ({
      nombre,
      ruta: nombre,
      bytes,
      donde: '2. Técnica',
      que_es,
      titulo: nombre,
    });
    const { leibles, noLeidos } = loQueCabe([
      archivo('Propuesta.docx', 30 * MB, 'propuesta'),
      archivo('Bases.pdf', 21 * MB, 'documento'),
      archivo('Respaldo.pdf', 2 * MB, 'respaldo'),
    ]);
    expect(leibles.map((a) => a.nombre)).toEqual([
      'Propuesta.docx',
      'Bases.pdf',
    ]);
    expect(noLeidos.map((a) => a.nombre)).toEqual(['Respaldo.pdf']);
  });
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

  it('manda lo del ZIP a Opus y guarda el resultado con su costo', async () => {
    const { repo, parse, servicio } = armar();
    await servicio.ejecutar(
      1,
      8,
      loQueVaEnElZip([pieza('Anexo1.pdf')]),
      [],
      contexto,
    );
    const [[pedido]] = parse.mock.calls as Array<
      [
        {
          model: string;
          messages: Array<{ content: Array<{ type: string; title?: string }> }>;
        },
      ]
    >;
    expect(pedido.model).toBe('claude-opus-5-5');
    expect(pedido.messages[0].content.map((b) => b.type)).toEqual([
      'document',
      'text',
    ]);
    // La IA ve en qué carpeta del ZIP va cada documento.
    expect(pedido.messages[0].content[0].title).toBe(
      '1. Administrativa / Anexo1.pdf',
    );
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
