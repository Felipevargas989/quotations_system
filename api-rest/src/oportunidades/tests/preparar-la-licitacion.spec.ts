import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { LicifyService } from '../adjuntos/licify.service';
import type { AnalisisService } from '../analisis/analisis.service';
import { MODELO_HAIKU } from '../analisis/comun';
import {
  MARGEN_PARA_PREPARAR_MS,
  MAX_LECTURAS_SOLAS_POR_PASADA,
  MODELO_DE_LA_LECTURA_SOLA,
  PrepararLaLicitacionService,
  SIN_SESION,
} from '../analisis/preparar-la-licitacion.service';
import type { FichaRepository } from '../ficha/ficha.repository';
import type { LecturaCorta } from '../lectura-corta/lectura-corta';
import type { LecturaCortaService } from '../lectura-corta/lectura-corta.service';

// «ME INTERESA» DEJA LA LICITACIÓN LISTA PARA TRABAJAR (decisión 114,
// 04-11): trae los documentos y, si no hay análisis, analiza las bases con
// Opus. Nunca lanza, porque corre por detrás. Y las nuevas verdes y
// amarillas se leen solas después de cada pasada del radar: desde la
// decisión 132 (12-11), con la lectura corta de Haiku y no con Opus.

const NO_ES: LecturaCorta = {
  veredicto: 'no_es_para_ti',
  porque: 'Piden el servicio en el gimnasio municipal.',
  cita: {
    texto: 'En el Gimnasio Municipal.',
    documento: 'Bases.pdf',
    pagina: '3',
  },
  lugar: 'Gimnasio Municipal',
};

function armar() {
  const orden: string[] = [];
  const licify = {
    configurado: true,
    estaTrayendo: jest.fn().mockReturnValue(false),
    traer: jest.fn((_empresa: number, _cuenta: string, id: number) => {
      orden.push(`traer ${id}`);
      return Promise.resolve({ disponibles: 3, bajados: [], omitidos: [] });
    }),
  };
  const analisis = {
    ultimo: jest.fn().mockResolvedValue(null),
    pedir: jest.fn((_empresa: number, _cuenta: string, id: number) => {
      orden.push(`pedir ${id}`);
      return Promise.resolve({ id: 5, estado: 'procesando' });
    }),
  };
  const ficha = {
    paraPrepararSolas: jest.fn().mockResolvedValue([]),
    marcarSegunLaLecturaCorta: jest.fn(
      (_empresa: number, id: number, l: LecturaCorta) => {
        orden.push(`marcar ${id} ${l.veredicto}`);
        return Promise.resolve();
      },
    ),
  };
  const lecturaCorta = {
    leerUna: jest.fn(
      (
        _empresa: number,
        id: number,
        _lote: string,
        opciones: { origen?: string },
      ) => {
        orden.push(`leer ${id} ${opciones.origen}`);
        return Promise.resolve(NO_ES);
      },
    ),
  };
  const servicio = new PrepararLaLicitacionService(
    licify as unknown as LicifyService,
    analisis as unknown as AnalisisService,
    mockPinoLogger() as unknown as PinoLogger,
    ficha as unknown as FichaRepository,
    lecturaCorta as unknown as LecturaCortaService,
  );
  return { licify, analisis, ficha, lecturaCorta, servicio, orden };
}

describe('PrepararLaLicitacionService (decisión 114)', () => {
  it('trae los documentos y después pide el análisis, con la sesión de quien la marcó', async () => {
    const { licify, analisis, servicio, orden } = armar();
    await expect(servicio.preparar(1, 'sesion-felipe', 40)).resolves.toBe(true);
    expect(orden).toEqual(['traer 40', 'pedir 40']);
    expect(licify.traer).toHaveBeenCalledWith(1, 'sesion-felipe', 40);
    expect(analisis.pedir).toHaveBeenCalledWith(1, 'sesion-felipe', 40);
  });

  it('un análisis listo o en curso no se repite; uno que falló, sí', async () => {
    const { analisis, servicio } = armar();
    analisis.ultimo.mockResolvedValueOnce({ id: 4, estado: 'listo' });
    await servicio.preparar(1, 'sesion-felipe', 40);
    analisis.ultimo.mockResolvedValueOnce({ id: 4, estado: 'procesando' });
    await servicio.preparar(1, 'sesion-felipe', 40);
    expect(analisis.pedir).not.toHaveBeenCalled();
    analisis.ultimo.mockResolvedValueOnce({ id: 4, estado: 'error' });
    await servicio.preparar(1, 'sesion-felipe', 40);
    expect(analisis.pedir).toHaveBeenCalledTimes(1);
  });

  it('si ya los está trayendo a mano, no hace nada: esa vuelta manda', async () => {
    const { licify, analisis, servicio } = armar();
    licify.estaTrayendo.mockReturnValue(true);
    await servicio.preparar(1, 'sesion-felipe', 40);
    expect(licify.traer).not.toHaveBeenCalled();
    expect(analisis.pedir).not.toHaveBeenCalled();
  });

  it('sin Licify no trae, pero analiza lo que ya se subió', async () => {
    const { licify, analisis, servicio } = armar();
    licify.configurado = false;
    await servicio.preparar(1, 'sesion-felipe', 40);
    expect(licify.traer).not.toHaveBeenCalled();
    expect(analisis.pedir).toHaveBeenCalledTimes(1);
  });

  it('si traer falla igual intenta analizar, y si el análisis no parte no lanza', async () => {
    const { licify, analisis, servicio } = armar();
    licify.traer.mockRejectedValueOnce(new Error('Licify respondió 503'));
    analisis.pedir.mockRejectedValueOnce(
      new Error('Sube primero las bases (PDF, Word o Excel).'),
    );
    await expect(servicio.preparar(1, 'sesion-felipe', 40)).resolves.toBe(
      false,
    );
    expect(analisis.pedir).toHaveBeenCalledTimes(1);
  });
});

describe('PrepararLaLicitacionService — las que se leen solas (decisiones 129 y 132)', () => {
  const llave = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'llave-de-prueba';
  });
  afterAll(() => {
    if (llave === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = llave;
  });

  it('a cada nueva le trae los documentos sin sesión, le hace la lectura corta con Haiku (origen radar) y marca lo que dijo; Opus no lee nada', async () => {
    const { licify, analisis, ficha, lecturaCorta, servicio, orden } = armar();
    ficha.paraPrepararSolas.mockResolvedValue([40, 41]);
    lecturaCorta.leerUna.mockImplementationOnce(
      (_e: number, id: number, _l: string, opciones: { origen?: string }) => {
        orden.push(`leer ${id} ${opciones.origen}`);
        return Promise.resolve({ ...NO_ES, veredicto: 'dudoso' });
      },
    );
    await expect(servicio.lasNuevas([1])).resolves.toBe(2);
    expect(ficha.paraPrepararSolas).toHaveBeenCalledWith(
      1,
      MARGEN_PARA_PREPARAR_MS,
    );
    expect(orden).toEqual([
      'traer 40',
      'leer 40 radar',
      'marcar 40 dudoso',
      'traer 41',
      'leer 41 radar',
      'marcar 41 no_es_para_ti',
    ]);
    expect(licify.traer).toHaveBeenCalledWith(1, SIN_SESION, 40);
    // El modelo sale de una sola constante: de partida, Haiku.
    expect(MODELO_DE_LA_LECTURA_SOLA).toBe(MODELO_HAIKU);
    expect(lecturaCorta.leerUna).toHaveBeenCalledWith(
      1,
      40,
      expect.stringMatching(/^radar .* v3$/),
      { origen: 'radar', modelo: MODELO_DE_LA_LECTURA_SOLA },
    );
    expect(analisis.pedir).not.toHaveBeenCalled();
  });

  it('sin veredicto (sin bases, o Haiku falló) no marca nada y no se repite en la pasada siguiente', async () => {
    const { licify, ficha, lecturaCorta, servicio } = armar();
    ficha.paraPrepararSolas.mockResolvedValue([40]);
    lecturaCorta.leerUna.mockResolvedValue(null as never);
    await expect(servicio.lasNuevas([1])).resolves.toBe(0);
    await expect(servicio.lasNuevas([1])).resolves.toBe(0);
    expect(ficha.marcarSegunLaLecturaCorta).not.toHaveBeenCalled();
    expect(licify.traer).toHaveBeenCalledTimes(1);
  });

  it('con tope por pasada: lo que sobra queda para la siguiente', async () => {
    const { lecturaCorta, ficha, servicio } = armar();
    ficha.paraPrepararSolas.mockResolvedValue(
      Array.from(
        { length: MAX_LECTURAS_SOLAS_POR_PASADA + 5 },
        (_, i) => 100 + i,
      ),
    );
    await expect(servicio.lasNuevas([1])).resolves.toBe(
      MAX_LECTURAS_SOLAS_POR_PASADA,
    );
    expect(lecturaCorta.leerUna).toHaveBeenCalledTimes(
      MAX_LECTURAS_SOLAS_POR_PASADA,
    );
  });

  it('si no se puede marcar una, sigue con la siguiente', async () => {
    const { ficha, servicio } = armar();
    ficha.paraPrepararSolas.mockResolvedValue([40, 41]);
    ficha.marcarSegunLaLecturaCorta.mockRejectedValueOnce(
      new Error('la base no responde'),
    );
    await expect(servicio.lasNuevas([1])).resolves.toBe(1);
    expect(ficha.marcarSegunLaLecturaCorta).toHaveBeenCalledTimes(2);
  });

  it('una vuelta a la vez: si ya está leyendo, la otra no parte', async () => {
    const { ficha, servicio } = armar();
    let soltar: (ids: number[]) => void = () => undefined;
    ficha.paraPrepararSolas.mockReturnValue(
      new Promise<number[]>((listo) => {
        soltar = listo;
      }),
    );
    const primera = servicio.lasNuevas([1]);
    await expect(servicio.lasNuevas([1])).resolves.toBe(0);
    soltar([]);
    await expect(primera).resolves.toBe(0);
    expect(ficha.paraPrepararSolas).toHaveBeenCalledTimes(1);
  });

  it('sin Licify o sin la llave de Anthropic no hace nada', async () => {
    const { licify, ficha, servicio } = armar();
    licify.configurado = false;
    await expect(servicio.lasNuevas([1])).resolves.toBe(0);
    licify.configurado = true;
    delete process.env.ANTHROPIC_API_KEY;
    await expect(servicio.lasNuevas([1])).resolves.toBe(0);
    expect(ficha.paraPrepararSolas).not.toHaveBeenCalled();
  });

  it('nunca lanza: si la base falla, lo dice y sigue', async () => {
    const { ficha, servicio } = armar();
    ficha.paraPrepararSolas.mockRejectedValue(new Error('la base no responde'));
    await expect(servicio.lasNuevas([1])).resolves.toBe(0);
    ficha.paraPrepararSolas.mockResolvedValue([]);
    await expect(servicio.lasNuevas([1])).resolves.toBe(0);
    expect(ficha.paraPrepararSolas).toHaveBeenCalledTimes(2);
  });
});
