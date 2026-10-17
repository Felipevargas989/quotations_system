import type Anthropic from '@anthropic-ai/sdk';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import type { AnalisisRepository } from '../analisis/analisis.repository';
import type { EventiaRepository } from '../eventia/eventia.repository';
import type { GeneracionRepository } from '../generacion/generacion.repository';
import {
  GeneracionService,
  type Plan,
  problemaDelDocumento,
} from '../generacion/generacion.service';
import { trabajarEnElTaller } from '../generacion/taller';
import type { OferenteRepository } from '../oferente/oferente.repository';
import type { OportunidadesRepository } from '../oportunidades.repository';
import { wordCon } from './zip-de-prueba';

// ANEXOS LLENOS, FIRMA Y PROPUESTA TÉCNICA (doc 17, sprint 3, paso 4). Lo
// que se pide al taller, lo que se revisa de lo que entrega y cómo se
// guarda en «Mi postulación». El taller va de mentira.

jest.mock('../generacion/taller', () => ({
  ...jest.requireActual<object>('../generacion/taller'),
  trabajarEnElTaller: jest.fn(),
}));
const taller = trabajarEnElTaller as jest.Mock;

const CUENTA = 'cuenta-1';
const WORD =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const adjunto = (
  id: number,
  nombre: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  nombre,
  ruta: `c1/oportunidades/40/x_${nombre}`,
  tipo: nombre.endsWith('.pdf') ? 'application/pdf' : WORD,
  bytes: 1000,
  seccion: 'bases',
  origen: 'subido',
  viene_de: null,
  creado_en: `2026-10-17T13:0${id % 10}:00.000Z`,
  subido_por: 'perfil-1',
  quien: null,
  ...extra,
});

const OFERENTE = {
  razon_social: 'VALLE DEL SOL QUILLON SPA',
  rut: '77.701.305-K',
  giro: 'Centro de eventos',
  representante_nombre: 'Felipe Vargas',
  representante_cargo: 'Gerente',
  experiencia: 'Día del Profesor 2025, Municipalidad de Quillón',
  instalaciones: 'Salón principal para 300 personas',
  firma_ruta: 'c1/oferente/firma_2026.png',
};

const ANALISIS = {
  id: 5,
  estado: 'listo',
  resultado: {
    resumen: 'Ceremonia y cena para 160 funcionarios.',
    lugar: 'lo propone el oferente',
    criterios: [
      {
        nombre: 'Calidad de la oferta',
        peso: '30%',
        como_se_evalua: 'Anexo 4',
      },
    ],
    requisitos: [
      {
        que: 'Formulario Anexo N°1 firmado',
        tipo: 'administrativo',
        obligatorio: true,
        documento: 'Bases',
        pagina: 7,
      },
      {
        que: 'Mesas y sillas para 160 personas',
        tipo: 'tecnico',
        obligatorio: true,
        documento: 'Bases Técnicas',
        pagina: 18,
      },
    ],
    cumplimiento: {
      resumen: 'Tienes las mesas; el show hay que conseguirlo.',
      items: [
        {
          requisito: 1,
          que: 'Mesas y sillas para 160 personas',
          estado: 'tengo',
          con_que: 'Salón principal',
          por_que: '',
        },
        {
          requisito: 2,
          que: 'Show de baile de 40 minutos',
          estado: 'conseguir',
          con_que: '',
          por_que: 'No hay show en tu carta.',
        },
      ],
    },
  },
};

class GeneracionDePrueba extends GeneracionService {
  constructor(repos: Record<string, unknown>) {
    super(
      repos.repo as GeneracionRepository,
      repos.analisis as AnalisisRepository,
      repos.adjuntos as AdjuntosRepository,
      repos.oferente as OferenteRepository,
      repos.oportunidades as OportunidadesRepository,
      repos.eventia as EventiaRepository,
      mockPinoLogger() as unknown as PinoLogger,
    );
  }

  protected cliente(): Anthropic {
    return {} as Anthropic;
  }
}

function armar() {
  const repo = {
    abandonarAntesDe: jest.fn().mockResolvedValue(undefined),
    ultimoDeTipo: jest.fn().mockResolvedValue(null),
    crearGeneracion: jest.fn((fila: Record<string, unknown>) =>
      Promise.resolve({ id: 9, estado: 'procesando', ...fila }),
    ),
    terminar: jest.fn().mockResolvedValue(undefined),
    descargar: jest.fn((ruta: string) =>
      Promise.resolve(Buffer.from(`archivo ${ruta}`)),
    ),
  };
  const analisis = { ultimo: jest.fn().mockResolvedValue(ANALISIS) };
  const adjuntos = {
    listar: jest.fn((_: number, __: number, seccion: string) =>
      Promise.resolve(
        seccion === 'bases'
          ? [
              adjunto(4, 'D.A. N°4.770 Bases.pdf'),
              adjunto(6, 'Formularios_Anexos.docx'),
              adjunto(7, 'Anexo antiguo.doc'),
            ]
          : [
              adjunto(12, 'Formularios_Anexos - lleno.docx', {
                seccion: 'postulacion',
                origen: 'generado',
                viene_de: 6,
              }),
              adjunto(13, 'Patente.pdf', { seccion: 'postulacion' }),
              adjunto(14, 'Anexo 1 - firmado.docx', {
                seccion: 'postulacion',
                origen: 'firmado',
              }),
            ],
      ),
    ),
    perfilDe: jest.fn().mockResolvedValue('perfil-1'),
    subirArchivo: jest.fn().mockResolvedValue(undefined),
    guardar: jest.fn((fila: Record<string, unknown>) =>
      Promise.resolve({ id: 50, ...fila }),
    ),
    borrarArchivo: jest.fn().mockResolvedValue(true),
  };
  const oferente = {
    oferente: jest.fn().mockResolvedValue(OFERENTE),
    empresa: jest.fn().mockResolvedValue({
      name: 'Valle del Sol Quillón',
      logo_url:
        'https://lab.supabase.co/storage/v1/object/public/logos/c1/logo.png',
      bank_details: null,
    }),
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
    catalogoResumido: jest.fn().mockResolvedValue({
      paquetes: ['Matrimonio: cóctel, cena y fiesta'],
      fijos: ['Salón principal'],
    }),
  };
  const eventia = {
    carta: jest.fn().mockResolvedValue({
      fijos: [{ nombre: 'Salón principal', seccion: 'Salones' }],
      menus: [
        {
          categoria: 'Cena',
          nombre: 'Plateada',
          platos: ['Plateada al jugo', 'Papas rústicas'],
        },
      ],
      paquetes: ['Matrimonio: cóctel, cena y fiesta'],
    }),
    eventosRealizados: jest.fn().mockResolvedValue([
      {
        numero: 455,
        tipo: 'Celebraciones',
        fecha: '2025-12-12',
        personas: 150,
        monto: 9_800_000,
        cliente: 'Municipalidad de Bulnes',
        fijos: ['Salón principal'],
      },
    ]),
  };
  const servicio = new GeneracionDePrueba({
    repo,
    analisis,
    adjuntos,
    oferente,
    oportunidades,
    eventia,
  });
  const ejecutar = jest
    .spyOn(servicio, 'ejecutar')
    .mockResolvedValue(undefined);
  return {
    repo,
    analisis,
    adjuntos,
    oferente,
    oportunidades,
    eventia,
    servicio,
    ejecutar,
  };
}

const planDe = (ejecutar: jest.SpyInstance) =>
  (ejecutar.mock.calls[0] as [number, number, Plan])[2];

const entorno = async (prueba: () => Promise<void>) => {
  const antes = {
    llave: process.env.ANTHROPIC_API_KEY,
    supabase: process.env.SUPABASE_URL,
  };
  process.env.ANTHROPIC_API_KEY = 'llave-de-prueba';
  process.env.SUPABASE_URL = 'https://lab.supabase.co';
  try {
    await prueba();
  } finally {
    if (antes.llave === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = antes.llave;
    if (antes.supabase === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = antes.supabase;
  }
};

beforeEach(() => taller.mockReset());

describe('Generar anexos', () => {
  it('llena los Word de las bases, SIN firma, con el total que puso la empresa (neto e IVA los calcula el motor)', () =>
    entorno(async () => {
      const { repo, servicio, ejecutar } = armar();

      const fila = await servicio.generarAnexos(1, CUENTA, 40, {
        monto_total: 11_900_000,
      });

      expect(fila).toMatchObject({ id: 9, estado: 'procesando' });
      expect(repo.crearGeneracion).toHaveBeenCalledWith(
        expect.objectContaining({
          company_id: 1,
          oportunidad_id: 40,
          tipo: 'anexos',
          modelo: 'claude-sonnet-5-5',
          analisis_id: 5,
          parametros: { monto_total: 11_900_000, adjuntos: [6] },
          archivos: [{ id: 6, nombre: 'Formularios_Anexos.docx' }],
          no_leidos: [expect.objectContaining({ nombre: 'Anexo antiguo.doc' })],
          pedido_por: 'perfil-1',
        }),
      );
      const plan = planDe(ejecutar);
      expect(plan.entradas).toEqual([
        {
          enElTaller: 'anexo_6.docx',
          tipo: WORD,
          ruta: 'c1/oportunidades/40/x_Formularios_Anexos.docx',
        },
      ]);
      expect(plan.salidas).toEqual([
        {
          enElTaller: 'lleno_6.docx',
          nombre: 'Formularios_Anexos - lleno.docx',
          origen: 'generado',
          viene_de: 6,
        },
      ]);
      expect(plan.sistema).toContain(
        'Total con IVA: $11.900.000. Neto: $10.000.000. IVA (19%): $1.900.000.',
      );
      expect(plan.sistema).toContain('NO firmes');
      expect(plan.sistema).toContain(
        'anexo_6.docx es «Formularios_Anexos.docx»',
      );
      expect(plan.sistema).toContain('RUT: 77.701.305-K');
      expect(plan.sistema).toContain(
        '2. [tecnico, obligatorio] Mesas y sillas para 160 personas (pág. 18)',
      );
      // La experiencia de verdad, de Eventia, y lo que no se promete.
      expect(plan.sistema).toContain(
        '- 2025-12-12 · Celebraciones · Municipalidad de Bulnes · 150 personas',
      );
      expect(plan.sistema).toContain(
        '- [hay que conseguirlo] Show de baile de 40 minutos (No hay show en tu carta.)',
      );
      expect(plan.sistema).toContain('[POR CONFIRMAR: qué falta]');
    }));

  it('sin monto, la oferta económica queda en blanco: nunca un precio inventado', () =>
    entorno(async () => {
      const { servicio, ejecutar } = armar();
      await servicio.generarAnexos(1, CUENTA, 40, {});
      expect(planDe(ejecutar).sistema).toContain('Nunca escribas un precio');
      expect(planDe(ejecutar).sistema).not.toContain('Total con IVA');
    }));

  it('sin Word en las bases, con un archivo que no es Word o sin los datos de la empresa: 400 sin crear nada', () =>
    entorno(async () => {
      const { adjuntos, oferente, repo, servicio } = armar();
      await expect(
        servicio.generarAnexos(1, CUENTA, 40, { adjuntos: [4] }),
      ).rejects.toThrow('Solo se llenan los Word');
      oferente.oferente.mockResolvedValue({ razon_social: 'VALLE DEL SOL' });
      await expect(servicio.generarAnexos(1, CUENTA, 40, {})).rejects.toThrow(
        'al menos la razón social y el RUT',
      );
      adjuntos.listar.mockResolvedValue([adjunto(4, 'Bases.pdf')]);
      await expect(
        servicio.generarAnexos(1, CUENTA, 40, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.crearGeneracion).not.toHaveBeenCalled();
    }));

  it('otra empresa 404; sin llave 400; si ya hay uno en curso, devuelve ese', () =>
    entorno(async () => {
      const { oportunidades, repo, servicio, ejecutar } = armar();
      (repo.crearGeneracion as jest.Mock).mockResolvedValue(null);
      repo.ultimoDeTipo.mockResolvedValue({ id: 3, estado: 'procesando' });
      await expect(
        servicio.generarAnexos(1, CUENTA, 40, {}),
      ).resolves.toMatchObject({ id: 3 });
      expect(ejecutar).not.toHaveBeenCalled();

      oportunidades.ficha.mockResolvedValue(null);
      await expect(
        servicio.generarAnexos(2, CUENTA, 40, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
      delete process.env.ANTHROPIC_API_KEY;
      await expect(servicio.generarAnexos(1, CUENTA, 40, {})).rejects.toThrow(
        'Falta la llave de Anthropic',
      );
    }));
});

describe('Firmar', () => {
  it('pone la foto de la firma en lo que la empresa ya revisó, y el firmado se compara con el de antes', () =>
    entorno(async () => {
      const { repo, servicio, ejecutar } = armar();

      await servicio.firmar(1, CUENTA, 40, [12]);

      expect(repo.crearGeneracion).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: 'firma',
          modelo: 'claude-haiku-5-5',
          parametros: { adjuntos: [12] },
        }),
      );
      const plan = planDe(ejecutar);
      expect(plan.entradas).toEqual([
        {
          enElTaller: 'documento_12.docx',
          tipo: WORD,
          ruta: 'c1/oportunidades/40/x_Formularios_Anexos - lleno.docx',
        },
        {
          enElTaller: 'firma.png',
          tipo: 'image/png',
          ruta: 'c1/oferente/firma_2026.png',
        },
      ]);
      expect(plan.salidas).toEqual([
        {
          enElTaller: 'firmado_12.docx',
          nombre: 'Formularios_Anexos - firmado.docx',
          origen: 'firmado',
          viene_de: 12,
          comparaCon: 'documento_12.docx',
        },
      ]);
      expect(plan.sistema).toContain('Firma: Felipe Vargas (Gerente)');
      expect(plan.sistema).toContain('NO cambies nada más');
    }));

  it('la firma no necesita ni la carta ni los eventos', () =>
    entorno(async () => {
      const { eventia, servicio } = armar();
      await servicio.firmar(1, CUENTA, 40, [12]);
      expect(eventia.carta).not.toHaveBeenCalled();
      expect(eventia.eventosRealizados).not.toHaveBeenCalled();
    }));

  it('sin foto de la firma, algo que no es de la postulación, que no es Word o que ya está firmado: no se firma', () =>
    entorno(async () => {
      const { oferente, repo, servicio } = armar();
      await expect(servicio.firmar(1, CUENTA, 40, [99])).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(servicio.firmar(1, CUENTA, 40, [13])).rejects.toThrow(
        'no es un Word',
      );
      await expect(servicio.firmar(1, CUENTA, 40, [14])).rejects.toThrow(
        'ya está firmado',
      );
      oferente.oferente.mockResolvedValue({ ...OFERENTE, firma_ruta: null });
      await expect(servicio.firmar(1, CUENTA, 40, [12])).rejects.toThrow(
        'Primero sube la foto de la firma',
      );
      expect(repo.crearGeneracion).not.toHaveBeenCalled();
    }));
});

describe('Crear propuesta técnica', () => {
  it('con el análisis de las bases, el logo de la casa, las bases para el detalle y el catálogo; sin precios', () =>
    entorno(async () => {
      const { repo, servicio, ejecutar } = armar();

      await servicio.crearPropuesta(1, CUENTA, 40);

      expect(repo.crearGeneracion).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: 'propuesta',
          modelo: 'claude-opus-5-5',
          analisis_id: 5,
          archivos: [
            { id: 4, nombre: 'D.A. N°4.770 Bases.pdf' },
            { id: 6, nombre: 'Formularios_Anexos.docx' },
          ],
        }),
      );
      const plan = planDe(ejecutar);
      expect(plan.entradas.map((e) => e.enElTaller)).toEqual([
        'logo.png',
        'bases_4.pdf',
        'bases_6.docx',
      ]);
      expect(plan.entradas[0]).toMatchObject({ opcional: true });
      expect(plan.salidas).toEqual([
        {
          enElTaller: 'propuesta.docx',
          nombre: 'Propuesta técnica 1532886-5-LE26.docx',
          origen: 'generado',
          viene_de: null,
        },
      ]);
      expect(plan.esfuerzo).toBe('high');
      expect(plan.sistema).toContain('Nunca escribas precios ni montos');
      expect(plan.sistema).toContain('- Salones: Salón principal');
      expect(plan.sistema).toContain(
        '- [Cena] Plateada: Plateada al jugo, Papas rústicas',
      );
      expect(plan.sistema).toContain(
        '- [lo tiene] Mesas y sillas para 160 personas → con Salón principal',
      );
      expect(plan.sistema).toContain('[COMPLETAR: qué falta]');
      expect(plan.sistema).toContain('[POR CONFIRMAR: qué falta]');
    }));

  it('sin análisis listo, 400; un logo de fuera de la casa no se baja', () =>
    entorno(async () => {
      const { analisis, oferente, servicio, ejecutar } = armar();
      oferente.empresa.mockResolvedValue({
        name: 'X',
        logo_url: 'http://169.254.169.254/logo.png',
        bank_details: null,
      });
      await servicio.crearPropuesta(1, CUENTA, 40);
      expect(planDe(ejecutar).entradas.map((e) => e.enElTaller)).not.toContain(
        'logo.png',
      );

      analisis.ultimo.mockResolvedValue({ id: 5, estado: 'procesando' });
      await expect(servicio.crearPropuesta(1, CUENTA, 40)).rejects.toThrow(
        'Primero analiza las bases',
      );
    }));
});

describe('lo que entrega la IA', () => {
  const ANTES = wordCon(['Firma: ________', 'Felipe Vargas'], 1);

  it('se guarda solo un Word que se abre; el firmado, con el mismo texto y la firma', () => {
    expect(problemaDelDocumento(Buffer.from('roto'))).toBe(
      'no es un Word que se pueda abrir',
    );
    expect(problemaDelDocumento(wordCon(['Anexo 1 lleno']))).toBeNull();
    expect(
      problemaDelDocumento(
        wordCon(['Firma: ________', 'Felipe Vargas'], 2),
        ANTES,
      ),
    ).toBeNull();
    expect(
      problemaDelDocumento(
        wordCon(['Firma: ________', 'Felipe Vargas'], 1),
        ANTES,
      ),
    ).toBe('no trae la firma');
    expect(
      problemaDelDocumento(
        wordCon(['Firma: ________', 'Felipe Vargas P.'], 2),
        ANTES,
      ),
    ).toContain('cambió el texto');
  });
});

describe('Por detrás: el taller y «Mi postulación»', () => {
  const PLAN: Plan = {
    tipo: 'anexos',
    modelo: 'claude-sonnet-5-5',
    oportunidadId: 40,
    perfil: 'perfil-1',
    sistema: 'Llenas los anexos.',
    texto: 'Llena los anexos.',
    entradas: [
      { enElTaller: 'anexo_6.docx', tipo: WORD, ruta: 'c1/anexo.docx' },
    ],
    salidas: [
      {
        enElTaller: 'lleno_6.docx',
        nombre: 'Formularios_Anexos - lleno.docx',
        origen: 'generado',
        viene_de: 6,
      },
    ],
    esfuerzo: 'medium',
    maxTokens: 32_000,
  };

  const INFORME = Buffer.from(
    JSON.stringify({
      resumen: 'Llené los anexos 1 a 5; el 6 (UTP) no aplica.',
      documentos: [
        {
          archivo: 'lleno_6.docx',
          que_se_hizo: 'Anexos 1 a 5 llenos.',
          pendientes: ['El monto de la oferta'],
        },
      ],
      pendientes: ['Las órdenes de compra de la experiencia'],
    }),
  );

  const USO = {
    entrada: 10_000,
    salida: 5_000,
    cacheEscrita: 20_000,
    cacheLeida: 100_000,
  };

  it('guarda lo entregado en «Mi postulación», marcado como generado, con el informe y lo que costó (caché incluida)', async () => {
    const { adjuntos, repo, servicio, ejecutar } = armar();
    ejecutar.mockRestore();
    taller.mockResolvedValue({
      archivos: [
        {
          nombre: 'lleno_6.docx',
          datos: wordCon(['ANEXO N°1', 'RUT: 77.701.305-K']),
        },
        { nombre: 'informe.json', datos: INFORME },
      ],
      texto: 'Listo.',
      uso: USO,
      motivo: 'end_turn',
    });

    await servicio.ejecutar(1, 9, PLAN);

    expect(repo.descargar).toHaveBeenCalledWith('c1/anexo.docx');
    expect(taller).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        modelo: 'claude-sonnet-5-5',
        archivos: [
          expect.objectContaining({ nombre: 'anexo_6.docx', tipo: WORD }),
        ],
        esfuerzo: 'medium',
      }),
    );
    const [[ruta, , tipo]] = adjuntos.subirArchivo.mock.calls as Array<
      [string, Buffer, string]
    >;
    expect(ruta).toMatch(
      /^c1\/oportunidades\/40\/postulacion\/.+_Formularios_Anexos_-_lleno\.docx$/,
    );
    expect(tipo).toBe(WORD);
    expect(adjuntos.guardar).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 1,
        oportunidad_id: 40,
        nombre: 'Formularios_Anexos - lleno.docx',
        seccion: 'postulacion',
        subido_por: 'perfil-1',
        origen: 'generado',
        viene_de: 6,
        generacion_id: 9,
      }),
    );
    // Con Sonnet 5.5, en US$ por millón: 10.000 × 2 de entrada + 20.000 ×
    // 2,5 de caché escrita + 100.000 × 0,1 de caché leída + 5.000 × 10 de
    // salida = US$0,13.
    expect(repo.terminar).toHaveBeenCalledWith(1, 9, {
      estado: 'listo',
      resultado: {
        resumen: 'Llené los anexos 1 a 5; el 6 (UTP) no aplica.',
        documentos: [
          {
            adjunto_id: 50,
            nombre: 'Formularios_Anexos - lleno.docx',
            que_se_hizo: 'Anexos 1 a 5 llenos.',
            pendientes: ['El monto de la oferta'],
          },
        ],
        pendientes: ['Las órdenes de compra de la experiencia'],
        descartados: [],
        no_entregados: [],
      },
      tokens_entrada: 130_000,
      tokens_salida: 5_000,
      costo_usd: 0.13,
    });
  });

  it('un firmado que cambió el texto no se guarda, y queda dicho por qué', async () => {
    const { adjuntos, repo, servicio, ejecutar } = armar();
    ejecutar.mockRestore();
    const antes = wordCon(['Firma: ____', 'Felipe Vargas'], 1);
    (repo.descargar as jest.Mock).mockResolvedValue(antes);
    taller.mockResolvedValue({
      archivos: [
        {
          nombre: 'firmado_12.docx',
          datos: wordCon(['Firma: ____', 'OTRO'], 2),
        },
      ],
      texto: 'Firmé.',
      uso: USO,
      motivo: 'end_turn',
    });

    await servicio.ejecutar(1, 9, {
      ...PLAN,
      tipo: 'firma',
      entradas: [
        { enElTaller: 'documento_12.docx', tipo: WORD, ruta: 'c1/lleno.docx' },
      ],
      salidas: [
        {
          enElTaller: 'firmado_12.docx',
          nombre: 'Formularios_Anexos - firmado.docx',
          origen: 'firmado',
          viene_de: 12,
          comparaCon: 'documento_12.docx',
        },
      ],
    });

    expect(adjuntos.subirArchivo).not.toHaveBeenCalled();
    expect(repo.terminar).toHaveBeenCalledWith(
      1,
      9,
      expect.objectContaining({
        estado: 'error',
        error: expect.stringContaining('no pasó la revisión') as unknown,
        resultado: expect.objectContaining({
          resumen: 'Firmé.',
          descartados: [
            {
              nombre: 'Formularios_Anexos - firmado.docx',
              motivo: expect.stringContaining('cambió el texto') as unknown,
            },
          ],
        }) as unknown,
      }),
    );
  });

  it('si no entregó nada porque se quedó sin espacio, lo dice; si el taller falla, queda escrito y no revienta', async () => {
    const { repo, servicio, ejecutar } = armar();
    ejecutar.mockRestore();
    taller.mockResolvedValue({
      archivos: [],
      texto: '',
      uso: USO,
      motivo: 'max_tokens',
    });
    await servicio.ejecutar(1, 9, PLAN);
    expect(repo.terminar).toHaveBeenLastCalledWith(
      1,
      9,
      expect.objectContaining({
        estado: 'error',
        error: expect.stringContaining('no alcanzó a terminar') as unknown,
      }),
    );

    taller.mockRejectedValue(new Error('credit balance is too low'));
    await expect(servicio.ejecutar(1, 9, PLAN)).resolves.toBeUndefined();
    expect(repo.terminar).toHaveBeenLastCalledWith(1, 9, {
      estado: 'error',
      error: 'Se acabó el saldo de la cuenta de Anthropic.',
    });
  });

  it('las tres últimas, una por tipo, después de dar por cortado lo de un motor anterior', async () => {
    const { repo, servicio } = armar();
    repo.ultimoDeTipo.mockImplementation(
      (_: number, __: number, tipo: string) =>
        Promise.resolve(tipo === 'anexos' ? { id: 1, tipo } : null),
    );
    await expect(servicio.ultimas(1, 40)).resolves.toEqual({
      anexos: { id: 1, tipo: 'anexos' },
      firma: null,
      propuesta: null,
    });
    expect(repo.abandonarAntesDe).toHaveBeenCalledWith(
      1,
      40,
      expect.any(String),
    );
  });
});
