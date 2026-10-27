import type Anthropic from '@anthropic-ai/sdk';
import { BadRequestException } from '@nestjs/common';
import { readdirSync, readFileSync, statSync } from 'fs';
import type { PinoLogger } from 'nestjs-pino';
import { join } from 'path';
import { mockPinoLogger } from 'src/testing/mocks';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import type { AnalisisRepository } from '../analisis/analisis.repository';
import {
  type Aprendizaje,
  apartadoParaLaComparacion,
  ESQUEMA_DE_LO_APRENDIDO,
  instruccionesDelAprendizaje,
  nucleoDelOrganismo,
  paraLaComparacion,
  prediccionEnPalabras,
  unidadDe,
} from '../aprendizajes/aprendizajes';
import type { AprendizajesRepository } from '../aprendizajes/aprendizajes.repository';
import {
  AprendizajesService,
  MODELO_DEL_APRENDIZAJE,
} from '../aprendizajes/aprendizajes.service';
import type { GeneracionRepository } from '../generacion/generacion.repository';
import type { OportunidadesRepository } from '../oportunidades.repository';

// LO QUE APRENDIMOS DE LAS COMISIONES (decisión 60, 20-10). Felipe: "entender
// los criterios, las flexibilidades que tienen estos comités evaluadores...
// para intentar predecir quién va a ganar, nada más", y que una comisión no
// marque "un precedente" de cómo se postula. La IA va de mentira.

const aprendizaje = (
  codigo: string,
  organismo: string,
  creado_en: string,
  situacion = 'Faltó un anexo.',
): Aprendizaje => ({
  id: 1,
  codigo,
  unidad: unidadDe(codigo),
  organismo,
  situacion,
  decision: 'La dejó fuera.',
  tipo: 'estricta',
  fuente: 'caso',
  oportunidad_id: null,
  creado_en,
});

describe('La base de lo aprendido', () => {
  it('la unidad de compra es el comienzo del código', () => {
    expect(unidadDe('4364-5-LE25')).toBe('4364');
    expect(unidadDe('1072229-25-L125')).toBe('1072229');
    expect(unidadDe('sin código')).toBeNull();
  });

  it('el organismo sin adornos: el de la carpeta y el del radar quedan iguales', () => {
    expect(nucleoDelOrganismo('I. Municipalidad de Quillón (DAEM)')).toBe(
      'municipalidad de quillon',
    );
    expect(nucleoDelOrganismo('ILUSTRE MUNICIPALIDAD DE QUILLON')).toBe(
      'municipalidad de quillon',
    );
  });

  it('la comparación lee primero su unidad de compra, después su organismo y al final lo demás; nunca la misma licitación', () => {
    const lineas = paraLaComparacion(
      [
        aprendizaje(
          '2705-22-LE26',
          'Universidad del Bío-Bío',
          '2026-10-20T19:00:00Z',
        ),
        aprendizaje(
          '5040-6-LE26',
          'I. Municipalidad de Quillón (DIDECO)',
          '2026-10-20T18:00:00Z',
        ),
        aprendizaje(
          '4364-5-LE25',
          'I. Municipalidad de Quillón (DAEM)',
          '2026-10-20T17:00:00Z',
        ),
        aprendizaje(
          '4364-13-LE26',
          'I. Municipalidad de Quillón (DAEM)',
          '2026-10-20T20:00:00Z',
        ),
      ],
      '4364-13-LE26',
      'ILUSTRE MUNICIPALIDAD DE QUILLON',
    );
    expect(lineas).toEqual([
      '- [esta misma unidad de compra] 4364-5-LE25 (I. Municipalidad de Quillón (DAEM)): Faltó un anexo. → La dejó fuera. (estricta)',
      '- [el mismo organismo] 5040-6-LE26 (I. Municipalidad de Quillón (DIDECO)): Faltó un anexo. → La dejó fuera. (estricta)',
      '- [otra comisión] 2705-22-LE26 (Universidad del Bío-Bío): Faltó un anexo. → La dejó fuera. (estricta)',
    ]);
    expect(
      paraLaComparacion(
        [aprendizaje('1-1-LE26', 'X', '2026-10-20T19:00:00Z')],
        '2-2-LE26',
        null,
        0,
      ),
    ).toEqual([]);
  });

  it('el apartado de la comparación dice que es solo para predecir; sin nada aprendido, no aparece', () => {
    expect(apartadoParaLaComparacion([])).toEqual([]);
    const t = apartadoParaLaComparacion(['- una']).join('\n');
    expect(t).toContain('Úsalo SOLO para predecir');
    expect(t).toContain('Nunca para "cumple_bases" ni "graves"');
    expect(t).toContain('es una tendencia, no una regla');
  });

  it('lo que la IA lee de un acta: sin consejos, sin pesos, sin nombres; y lo que predijo la comparación', () => {
    const t = instruccionesDelAprendizaje({
      codigo: '4364-13-LE26',
      nombre: 'Día del Profesor',
      organismo: 'I MUNICIPALIDAD DE QUILLON',
      criterios: [{ nombre: 'Precio', peso: '30%' }],
      teDejanFuera: ['Sin el Formulario N°5'],
      prediccion: prediccionEnPalabras({
        ganador_probable: 'SOL DE QUILLON SPA',
        oferentes: [
          {
            nombre: 'VALLE DEL SOL',
            es_tuya: true,
            probabilidad: 45,
            cumple_bases: 'si',
          },
          {
            nombre: 'SOL DE QUILLON SPA',
            probabilidad: 55,
            cumple_bases: 'dudoso',
          },
        ],
      }),
    });
    expect(t).toContain('- Precio (30%)');
    expect(t).toContain('- Sin el Formulario N°5');
    expect(t).toContain(
      'Ganador probable: SOL DE QUILLON SPA. VALLE DEL SOL (la empresa): 45 %, cumple bases «si»',
    );
    expect(t).toContain('No des consejos ni conclusiones tuyas');
    expect(t).toContain('no anotes los pesos de las bases');
    expect(t).toContain('Sin nombres de personas ni de oferentes');
    expect(prediccionEnPalabras(null)).toBe(
      '(No hubo comparación de ofertas.)',
    );
    expect(ESQUEMA_DE_LO_APRENDIDO.required).toEqual([
      'ganador',
      'prediccion',
      'por_que',
      'resumen',
      'aprendizajes',
    ]);
  });

  it('al postular mandan las bases: lo aprendido solo lo leen la comparación y su propia carpeta', () => {
    const raiz = join(__dirname, '..');
    const leen: string[] = [];
    const recorrer = (dir: string) => {
      for (const nombre of readdirSync(dir)) {
        const ruta = join(dir, nombre);
        if (statSync(ruta).isDirectory()) {
          if (nombre !== 'tests') recorrer(ruta);
        } else if (
          nombre.endsWith('.ts') &&
          readFileSync(ruta, 'utf8').includes('aprendizajes/aprendizajes')
        ) {
          leen.push(ruta.slice(raiz.length + 1));
        }
      }
    };
    recorrer(raiz);
    expect(leen.sort()).toEqual([
      'comparacion/comparacion.service.ts',
      'comparacion/comparacion.ts',
      'oportunidades.module.ts',
    ]);
  });
});

class AprendizajesDePrueba extends AprendizajesService {
  parse = jest.fn();
  protected cliente(): Anthropic {
    return { messages: { parse: this.parse } } as unknown as Anthropic;
  }
}

const ACTA = {
  id: 61,
  nombre: 'Acta de evaluación.pdf',
  ruta: 'c1/oportunidades/84/acta/acta.pdf',
  bytes: 2_000,
  creado_en: '2026-10-27T12:00:00Z',
};

function armar() {
  const repo = {
    deLaEmpresa: jest
      .fn()
      .mockResolvedValue([
        aprendizaje(
          '4364-5-LE25',
          'I. Municipalidad de Quillón (DAEM)',
          '2026-10-20T17:00:00Z',
        ),
        aprendizaje(
          '4074-35-LE25',
          'I. Municipalidad de Yumbel (DEM)',
          '2026-10-20T18:00:00Z',
        ),
      ]),
    reemplazarLosDelActa: jest.fn().mockResolvedValue(2),
  };
  const generacion = {
    abandonarAntesDe: jest.fn().mockResolvedValue(undefined),
    ultimoDeTipo: jest.fn((_c: number, _o: number, tipo: string) =>
      Promise.resolve(
        tipo === 'comparacion'
          ? {
              estado: 'listo',
              resultado: {
                ganador_probable: 'SOL DE QUILLON SPA',
                oferentes: [],
              },
            }
          : null,
      ),
    ),
    crearGeneracion: jest.fn((fila: Record<string, unknown>) =>
      Promise.resolve({ id: 70, estado: 'procesando', ...fila }),
    ),
    terminar: jest.fn().mockResolvedValue(undefined),
    descargar: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 acta')),
  };
  const adjuntos = {
    listar: jest.fn().mockResolvedValue([ACTA]),
    perfilDe: jest.fn().mockResolvedValue('perfil-1'),
  };
  const oportunidades = {
    ficha: jest.fn().mockResolvedValue({
      id: 84,
      codigo: '4364-13-LE26',
      proceso: {
        nombre: 'Día del Profesor',
        organismo: 'I MUNICIPALIDAD DE QUILLON',
      },
    }),
  };
  const analisis = {
    ultimo: jest.fn().mockResolvedValue({
      estado: 'listo',
      resultado: {
        criterios: [{ nombre: 'Precio', peso: '30%' }],
        te_dejan_fuera: [],
      },
    }),
  };
  const servicio = new AprendizajesDePrueba(
    repo as unknown as AprendizajesRepository,
    generacion as unknown as GeneracionRepository,
    adjuntos as unknown as AdjuntosRepository,
    oportunidades as unknown as OportunidadesRepository,
    analisis as unknown as AnalisisRepository,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { repo, generacion, adjuntos, oportunidades, analisis, servicio };
}

const antes = process.env.ANTHROPIC_API_KEY;
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'llave-de-prueba';
});
afterAll(() => {
  if (antes === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = antes;
});

describe('«Aprender del acta»', () => {
  it('lo de esta comisión es lo de su unidad de compra, con el total de la base', async () => {
    const { servicio } = armar();
    const e = await servicio.estado(1, 84);
    expect(e.comision.map((a) => a.codigo)).toEqual(['4364-5-LE25']);
    expect(e.total).toBe(2);
  });

  it('sin acta subida no se pide nada', async () => {
    const { adjuntos, generacion, servicio } = armar();
    adjuntos.listar.mockResolvedValue([]);
    await expect(servicio.pedir(1, 'c', 84)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(generacion.crearGeneracion).not.toHaveBeenCalled();
  });

  it('se pide con Opus, con el acta, los criterios y lo que predijo la comparación', async () => {
    const { adjuntos, generacion, servicio } = armar();
    const ejecutar = jest
      .spyOn(servicio, 'ejecutar')
      .mockResolvedValue(undefined);
    const fila = await servicio.pedir(1, 'cuenta-1', 84);
    expect(fila).toMatchObject({ id: 70, estado: 'procesando' });
    expect(adjuntos.listar).toHaveBeenCalledWith(1, 84, 'acta');
    expect(generacion.crearGeneracion).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'aprendizaje',
        modelo: MODELO_DEL_APRENDIZAJE,
        archivos: [{ id: 61, nombre: 'Acta de evaluación.pdf' }],
      }),
    );
    const [, , , , contexto] = ejecutar.mock.calls[0];
    expect(contexto.leer).toEqual([ACTA]);
    expect(contexto.instrucciones).toContain(
      'Ganador probable: SOL DE QUILLON SPA',
    );
    expect(contexto.instrucciones).toContain('- Precio (30%)');
    expect(MODELO_DEL_APRENDIZAJE).toBe('claude-opus-5-5');
  });

  it('decisión 95: en una compra ágil sin criterios, el acta se lee con el de la ley', async () => {
    const { servicio, oportunidades, analisis } = armar();
    oportunidades.ficha.mockResolvedValue({
      id: 84,
      codigo: '1346350-37-COT26',
      proceso: { nombre: 'Catamarán', organismo: null, tipo: 'compra_agil' },
    });
    analisis.ultimo.mockResolvedValue({
      estado: 'listo',
      resultado: { criterios: [], te_dejan_fuera: [] },
    });
    const ejecutar = jest
      .spyOn(servicio, 'ejecutar')
      .mockResolvedValue(undefined);
    await servicio.pedir(1, 'cuenta-1', 84);
    const [, , , , contexto] = ejecutar.mock.calls[0];
    expect(contexto.instrucciones).toContain('- Menor precio (100%)');
  });

  it('al terminar guarda lo aprendido de esa licitación (sin lo vacío) y deja escrito si acertó', async () => {
    const { repo, generacion, servicio } = armar();
    servicio.parse.mockResolvedValue({
      parsed_output: {
        ganador: 'VALLE DEL SOL QUILLON SPA',
        prediccion: 'fallo',
        por_que: 'La comisión no exigió el programa de integridad.',
        resumen: 'Revisó con una tabla de sí/no.',
        aprendizajes: [
          {
            situacion: 'Faltó el programa de integridad.',
            decision: 'Puso 0 y siguió en carrera.',
            tipo: 'flexible',
          },
          { situacion: '  ', decision: 'Nada.', tipo: 'estricta' },
          {
            situacion: 'El anexo económico pasaba del presupuesto.',
            decision: 'La dejó fuera.',
            tipo: 'estricta',
          },
        ],
      },
      usage: { input_tokens: 40_000, output_tokens: 2_000 },
      stop_reason: 'end_turn',
    });
    await servicio.ejecutar(1, 84, 70, [], {
      codigo: '4364-13-LE26',
      organismo: 'I MUNICIPALIDAD DE QUILLON',
      leer: [ACTA] as never,
      instrucciones: 'INSTRUCCIONES',
    });
    expect(repo.reemplazarLosDelActa).toHaveBeenCalledWith(1, 84, 70, [
      {
        codigo: '4364-13-LE26',
        unidad: '4364',
        organismo: 'I MUNICIPALIDAD DE QUILLON',
        situacion: 'Faltó el programa de integridad.',
        decision: 'Puso 0 y siguió en carrera.',
        tipo: 'flexible',
      },
      {
        codigo: '4364-13-LE26',
        unidad: '4364',
        organismo: 'I MUNICIPALIDAD DE QUILLON',
        situacion: 'El anexo económico pasaba del presupuesto.',
        decision: 'La dejó fuera.',
        tipo: 'estricta',
      },
    ]);
    expect(generacion.terminar).toHaveBeenCalledWith(
      1,
      70,
      expect.objectContaining({
        estado: 'listo',
        resultado: expect.objectContaining({
          prediccion: 'fallo',
          guardados: 2,
        }),
      }),
    );

    const falla = armar();
    falla.servicio.parse.mockRejectedValue(new Error('se cayó'));
    await falla.servicio.ejecutar(1, 84, 71, [], {
      codigo: '4364-13-LE26',
      organismo: null,
      leer: [ACTA] as never,
      instrucciones: 'X',
    });
    expect(falla.repo.reemplazarLosDelActa).not.toHaveBeenCalled();
    expect(falla.generacion.terminar).toHaveBeenCalledWith(
      1,
      71,
      expect.objectContaining({
        estado: 'error',
        error: expect.stringContaining('se cayó'),
      }),
    );
  });
});
