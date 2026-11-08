import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { User } from 'src/users/entities/user.entity';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import type { AnalisisRepository } from '../analisis/analisis.repository';
import type { FichaRepository } from '../ficha/ficha.repository';
import type { GeneracionRepository } from '../generacion/generacion.repository';
import type { GeneracionService } from '../generacion/generacion.service';
import {
  claveDeExigencia,
  conLoQueRespondio,
  type RespuestaDeLaEmpresa,
  seccionDeLoQueSabemos,
} from '../oferente/lo-que-sabemos';
import type { LoQueSabemosRepository } from '../oferente/lo-que-sabemos.repository';
import { LoQueSabemosService } from '../oferente/lo-que-sabemos.service';
import type { OferenteRepository } from '../oferente/oferente.repository';
import type { OportunidadesRepository } from '../oportunidades.repository';
import { OportunidadesService } from '../oportunidades.service';
import type { ArmarLaOfertaService } from '../postulacion/armar-la-oferta.service';
import { ArmarPostulacionService } from '../postulacion/armar-postulacion.service';
import type { CotizacionDeLaPostulacionService } from '../postulacion/cotizacion-de-la-postulacion.service';
import type { LaExperienciaService } from '../postulacion/la-experiencia.service';
import { lasCandidatas, lasDecisiones } from '../postulacion/las-preguntas';
import { LasPreguntasService } from '../postulacion/las-preguntas.service';
import type { PostulacionRepository } from '../postulacion/postulacion.repository';

// LAS PREGUNTAS ANTES DE ARMAR Y LO QUE EVENTIA SABE DE TU EMPRESA
// (decisión 119, parte 3, 07-11; migración 190). Felipe: "pincho una
// licitación y le faltan 5 preguntas... vuelvo a la licitación, me aparece
// el modal de lo que me falta, yo respondo las preguntas y lo genera. Pero
// una vez que ya lo generó, en la siguiente cotización no me vuelve a
// preguntar si tengo ramplas".

const respuesta = (
  r: Partial<RespuestaDeLaEmpresa> &
    Pick<RespuestaDeLaEmpresa, 'clave' | 'respuesta'>,
): RespuestaDeLaEmpresa => ({
  id: 1,
  company_id: 1,
  pregunta: r.clave,
  exigencia: null,
  detalle: null,
  oportunidad_id: 40,
  creado_en: '2026-11-07T10:00:00Z',
  actualizado_en: '2026-11-07T10:00:00Z',
  ...r,
});

const RAMPA = 'Recinto con rampa de acceso universal';
const REVISION = [
  { que: RAMPA, estado: 'conseguir', por_que: 'No se sabe si hay rampa.' },
  {
    que: 'Amplificación con 4 cajas activas',
    estado: 'conseguir',
    por_que: '',
  },
  {
    que: 'Certificado de la Seremi de Salud',
    estado: 'conseguir',
    por_que: '',
  },
  { que: 'Almuerzo con plateada al horno', estado: 'tengo', por_que: '' },
  { que: 'Vasos de color amarillo', estado: 'conseguir', por_que: '' },
  {
    que: 'Estacionamiento para 20 vehículos',
    estado: 'conseguir',
    por_que: '',
  },
];

describe('Lo que Eventia sabe de tu empresa', () => {
  it('la clave es la misma de «Bases y criterios»', () => {
    expect(claveDeExigencia('  Almuerzo   con PLATEADA al horno ')).toBe(
      'almuerzo con plateada al horno',
    );
    expect(claveDeExigencia('Rampa de ACCESO en la recepción')).toBe(
      'rampa de acceso en la recepcion',
    );
  });

  it('las IA de Oportunidades leen lo respondido, lo más nuevo primero', () => {
    expect(seccionDeLoQueSabemos([])).toBe('');
    const texto = seccionDeLoQueSabemos([
      respuesta({
        clave: 'a',
        pregunta: '¿Tienes rampa?',
        respuesta: 'lo_tengo',
        detalle: 'en la entrada principal',
        actualizado_en: '2026-11-01T00:00:00Z',
      }),
      respuesta({
        clave: 'b',
        pregunta: '¿Tienes vasos amarillos?',
        respuesta: 'no_puedo',
        actualizado_en: '2026-11-05T00:00:00Z',
      }),
    ]);
    expect(texto).toContain('LO QUE YA RESPONDIÓ LA EMPRESA');
    expect(texto.indexOf('No puede: ¿Tienes vasos amarillos?')).toBeLessThan(
      texto.indexOf('Lo tiene: ¿Tienes rampa? (en la entrada principal)'),
    );
  });

  it('los documentos ya no dejan POR CONFIRMAR en lo respondido', () => {
    const bases = {
      resumen: '',
      cumplimiento: REVISION.map((i) => ({ ...i, con_que: '' })),
    };
    const resultado = conLoQueRespondio(
      bases,
      // Lo marcado en ESTA licitación manda sobre lo guardado.
      { [claveDeExigencia('Vasos de color amarillo')]: 'lo_tengo' },
      [
        respuesta({
          clave: claveDeExigencia(RAMPA),
          respuesta: 'lo_tengo',
          detalle: 'rampa en la entrada principal',
        }),
        respuesta({
          clave: claveDeExigencia('Vasos de color amarillo'),
          respuesta: 'no_puedo',
        }),
        respuesta({
          clave: claveDeExigencia('Estacionamiento para 20 vehículos'),
          respuesta: 'no_puedo',
          detalle: 'caben 12',
        }),
      ],
    );
    const de = (que: string) =>
      resultado?.cumplimiento.find((i) => i.que === que);
    expect(de(RAMPA)).toMatchObject({
      estado: 'tengo',
      con_que: 'rampa en la entrada principal',
    });
    expect(de('Vasos de color amarillo')).toMatchObject({
      estado: 'tengo',
      con_que: 'lo confirmó la empresa',
    });
    expect(de('Estacionamiento para 20 vehículos')).toMatchObject({
      estado: 'no_puede',
      por_que: 'caben 12',
    });
    // Lo no respondido queda igual.
    expect(de('Amplificación con 4 cajas activas')?.estado).toBe('conseguir');
    // Sin respuestas ni marcas, lo mismo de siempre.
    expect(conLoQueRespondio(bases, {}, [])).toBe(bases);
  });
});

describe('Qué se pregunta antes de armar', () => {
  it('solo lo que hay que conseguir, sin documentos, sin lo marcado y sin lo ya respondido', () => {
    const { candidatas, yaRespondidas } = lasCandidatas(
      [...REVISION, REVISION[0]],
      { [claveDeExigencia('Vasos de color amarillo')]: 'no_puedo' },
      [
        respuesta({
          clave: claveDeExigencia('Estacionamiento para 20 vehículos'),
          respuesta: 'lo_tengo',
        }),
      ],
    );
    expect(candidatas.map((c) => c.exigencia)).toEqual([
      RAMPA,
      'Amplificación con 4 cajas activas',
    ]);
    expect(yaRespondidas).toEqual([
      {
        clave: claveDeExigencia('Estacionamiento para 20 vehículos'),
        respuesta: 'lo_tengo',
      },
    ]);
  });

  it('lo que decide la IA: no pregunta lo subcontratado, marca lo ya respondido y pregunta lo demás', () => {
    const candidatas = [
      { clave: 'rampa', exigencia: RAMPA, por_que: '' },
      { clave: 'cajas', exigencia: 'Amplificación', por_que: '' },
      { clave: 'acceso', exigencia: 'Accesibilidad universal', por_que: '' },
      { clave: 'vasos', exigencia: 'Vasos amarillos', por_que: '' },
      { clave: 'mal', exigencia: 'Ya respondida, mal numerada', por_que: '' },
    ];
    const guardadas = [respuesta({ clave: 'x', respuesta: 'lo_tengo' })];
    const { preguntas, yaRespondidas } = lasDecisiones(
      {
        items: [
          {
            exigencia: 1,
            que_hacer: 'preguntar',
            respuesta: 0,
            pregunta: '¿Tienes rampa de acceso?',
          },
          {
            exigencia: 2,
            que_hacer: 'subcontrata',
            respuesta: 0,
            pregunta: '',
          },
          {
            exigencia: 3,
            que_hacer: 'ya_respondida',
            respuesta: 1,
            pregunta: '',
          },
          // La 4 no la nombró: se pregunta con las palabras de las bases.
          {
            exigencia: 5,
            que_hacer: 'ya_respondida',
            respuesta: 9,
            pregunta: '',
          },
        ],
      },
      candidatas,
      guardadas,
    );
    expect(preguntas).toEqual([
      {
        clave: 'rampa',
        exigencia: RAMPA,
        pregunta: '¿Tienes rampa de acceso?',
      },
      {
        clave: 'vasos',
        exigencia: 'Vasos amarillos',
        pregunta: 'Vasos amarillos',
      },
      {
        clave: 'mal',
        exigencia: 'Ya respondida, mal numerada',
        pregunta: 'Ya respondida, mal numerada',
      },
    ]);
    expect(yaRespondidas).toEqual([{ clave: 'acceso', respuesta: 'lo_tengo' }]);
  });
});

/** LasPreguntasService con una IA de mentira. */
class PreguntasDePrueba extends LasPreguntasService {
  parse = jest.fn();
  protected cliente() {
    return { messages: { parse: this.parse } } as never;
  }
}

describe('Las preguntas, con la IA', () => {
  const OTRA_LLAVE = process.env.ANTHROPIC_API_KEY;
  beforeAll(() => {
    process.env.ANTHROPIC_API_KEY = 'llave-de-prueba';
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = OTRA_LLAVE;
  });

  const armar = (guardadas: RespuestaDeLaEmpresa[]) => {
    const fichas = { marcarExigencia: jest.fn().mockResolvedValue({}) };
    const loQueSabemos = {
      lista: jest.fn().mockResolvedValue(guardadas),
      responder: jest.fn().mockResolvedValue(undefined),
    };
    const servicio = new PreguntasDePrueba(
      fichas as unknown as FichaRepository,
      loQueSabemos as unknown as LoQueSabemosService,
      mockPinoLogger() as unknown as PinoLogger,
    );
    return { fichas, loQueSabemos, servicio };
  };

  it('marca solo lo ya respondido y devuelve lo que hay que preguntar', async () => {
    const { fichas, servicio } = armar([
      respuesta({
        clave: claveDeExigencia('Estacionamiento para 20 vehículos'),
        respuesta: 'no_puedo',
      }),
    ]);
    servicio.parse.mockResolvedValue({
      usage: { input_tokens: 100, output_tokens: 50 },
      parsed_output: {
        items: [
          {
            exigencia: 1,
            que_hacer: 'preguntar',
            respuesta: 0,
            pregunta: '¿Tienes rampa?',
          },
          {
            exigencia: 2,
            que_hacer: 'subcontrata',
            respuesta: 0,
            pregunta: '',
          },
          {
            exigencia: 3,
            que_hacer: 'preguntar',
            respuesta: 0,
            pregunta: '¿Tienes vasos amarillos?',
          },
        ],
      },
    });
    const preguntas = await servicio.queFalta(
      1,
      40,
      { cumplimiento: { items: REVISION } },
      {},
    );
    expect(preguntas.map((p) => p.pregunta)).toEqual([
      '¿Tienes rampa?',
      '¿Tienes vasos amarillos?',
    ]);
    expect(fichas.marcarExigencia).toHaveBeenCalledWith(
      1,
      40,
      claveDeExigencia('Estacionamiento para 20 vehículos'),
      'no_puedo',
    );
  });

  it('si la IA falla, no pregunta: se arma como antes', async () => {
    const { servicio } = armar([]);
    servicio.parse.mockRejectedValue(new Error('se cayó'));
    await expect(
      servicio.queFalta(1, 40, { cumplimiento: { items: REVISION } }, {}),
    ).resolves.toEqual([]);
  });

  it('las respuestas del modal van a «Mi empresa» y a «Bases y criterios»', async () => {
    const { fichas, loQueSabemos, servicio } = armar([]);
    await servicio.guardar(1, 40, [
      {
        clave: 'rampa',
        pregunta: '¿Tienes rampa?',
        exigencia: RAMPA,
        respuesta: 'lo_tengo',
        detalle: '  en la entrada  ',
      },
    ]);
    expect(loQueSabemos.responder).toHaveBeenCalledWith(1, [
      {
        clave: 'rampa',
        pregunta: '¿Tienes rampa?',
        exigencia: RAMPA,
        respuesta: 'lo_tengo',
        detalle: 'en la entrada',
        oportunidad_id: 40,
      },
    ]);
    expect(fichas.marcarExigencia).toHaveBeenCalledWith(
      1,
      40,
      'rampa',
      'lo_tengo',
    );
  });
});

describe('Lo que se marca en «Bases y criterios» también se aprende', () => {
  const armar = (antes: RespuestaDeLaEmpresa | null = null) => {
    const repo = {
      porClave: jest.fn().mockResolvedValue(antes),
      guardar: jest.fn().mockResolvedValue(undefined),
      borrarPorClave: jest.fn().mockResolvedValue(undefined),
      deLaEmpresa: jest.fn().mockResolvedValue([]),
    };
    const servicio = new LoQueSabemosService(
      repo as unknown as LoQueSabemosRepository,
      mockPinoLogger() as unknown as PinoLogger,
    );
    return { repo, servicio };
  };

  it('lo que la IA no sabía queda guardado, con las palabras de las bases', async () => {
    const { repo, servicio } = armar();
    await servicio.alMarcar(1, 40, 'rampa', 'lo_tengo', {
      que: RAMPA,
      estado: 'conseguir',
    });
    expect(repo.guardar).toHaveBeenCalledWith(1, [
      expect.objectContaining({
        clave: 'rampa',
        pregunta: RAMPA,
        respuesta: 'lo_tengo',
        oportunidad_id: 40,
      }),
    ]);
  });

  it('desmarcar lo olvida, y lo que la IA ya sabía no se guarda', async () => {
    const { repo, servicio } = armar();
    await servicio.alMarcar(1, 40, 'rampa', null, null);
    await servicio.alMarcar(1, 40, 'almuerzo', 'lo_tengo', {
      que: 'Almuerzo',
      estado: 'tengo',
    });
    expect(repo.borrarPorClave).toHaveBeenCalledTimes(2);
    expect(repo.guardar).not.toHaveBeenCalled();
  });

  it('marcar en «Bases y criterios» le pasa lo que decía la IA', async () => {
    const fichas = {
      marcarExigencia: jest.fn().mockResolvedValue({ rampa: 'lo_tengo' }),
    };
    const loQueSabemos = { alMarcar: jest.fn().mockResolvedValue(undefined) };
    const analisis = {
      ultimo: jest.fn().mockResolvedValue({
        estado: 'listo',
        resultado: { cumplimiento: { items: REVISION } },
      }),
    };
    const servicio = new OportunidadesService(
      {} as OportunidadesRepository,
      {} as never,
      mockPinoLogger() as unknown as PinoLogger,
      fichas as unknown as FichaRepository,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      loQueSabemos as unknown as LoQueSabemosService,
      analisis as unknown as AnalisisRepository,
    );
    const clave = claveDeExigencia(RAMPA);
    await expect(
      servicio.marcarExigencia(1, 40, ` ${clave} `, 'lo_tengo'),
    ).resolves.toEqual({ rampa: 'lo_tengo' });
    expect(loQueSabemos.alMarcar).toHaveBeenCalledWith(
      1,
      40,
      clave,
      'lo_tengo',
      {
        que: RAMPA,
        estado: 'conseguir',
        por_que: 'No se sabe si hay rampa.',
      },
    );
  });

  it('la misma respuesta de antes no se reescribe (se queda su detalle)', async () => {
    const { repo, servicio } = armar(
      respuesta({ clave: 'rampa', respuesta: 'lo_tengo', detalle: 'entrada' }),
    );
    await servicio.alMarcar(1, 40, 'rampa', 'lo_tengo', {
      que: RAMPA,
      estado: 'conseguir',
    });
    expect(repo.guardar).not.toHaveBeenCalled();
  });
});

describe('«Armar postulación» se detiene con las preguntas', () => {
  const USUARIO = { id: 'cuenta-1', company_id: 1 } as unknown as User;
  const PREGUNTA = {
    clave: 'rampa',
    exigencia: RAMPA,
    pregunta: '¿Tienes rampa?',
  };

  const armar = (
    faltan = [PREGUNTA],
    ultima: Record<string, unknown> | null = null,
  ) => {
    const oferta = {
      pedir: jest.fn().mockResolvedValue({ id: 21, estado: 'procesando' }),
    };
    const generaciones = {
      crearGeneracion: jest.fn().mockResolvedValue({
        id: 30,
        estado: 'procesando',
        parametros: {},
      }),
      terminar: jest.fn().mockResolvedValue(undefined),
      ultimoDeTipo: jest.fn().mockResolvedValue(ultima),
      anotarParametros: jest.fn().mockResolvedValue(undefined),
    };
    const preguntas = {
      queFalta: jest.fn().mockResolvedValue(faltan),
      guardar: jest.fn().mockResolvedValue(undefined),
    };
    const servicio = new ArmarPostulacionService(
      oferta as unknown as ArmarLaOfertaService,
      {} as GeneracionService,
      {} as CotizacionDeLaPostulacionService,
      generaciones as unknown as GeneracionRepository,
      {
        ultimo: jest.fn().mockResolvedValue({
          estado: 'listo',
          resultado: { requisitos: [], cumplimiento: { items: REVISION } },
        }),
      } as unknown as AnalisisRepository,
      {
        oferente: jest
          .fn()
          .mockResolvedValue({ razon_social: 'VALLE DEL SOL', rut: '1-9' }),
      } as unknown as OferenteRepository,
      {
        oportunidad: jest.fn().mockResolvedValue({
          id: 40,
          estado: 'en_estudio',
          quotation_id: null,
          exigencias_marcadas: { vasos: 'no_puedo' },
          proceso: { tipo: 'licitacion' },
        }),
      } as unknown as PostulacionRepository,
      {} as LaExperienciaService,
      {
        perfilDe: jest.fn().mockResolvedValue('perfil-1'),
      } as unknown as AdjuntosRepository,
      mockPinoLogger() as unknown as PinoLogger,
      undefined,
      preguntas as unknown as LasPreguntasService,
    );
    return { generaciones, oferta, preguntas, servicio };
  };

  it('con preguntas no gasta en la oferta: deja el armado detenido con el precio', async () => {
    const { generaciones, oferta, preguntas, servicio } = armar();
    const fila = await servicio.armar(USUARIO, 40, 1_190_000);
    expect(preguntas.queFalta).toHaveBeenCalledWith(1, 40, expect.anything(), {
      vasos: 'no_puedo',
    });
    expect(oferta.pedir).not.toHaveBeenCalled();
    expect(generaciones.crearGeneracion).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'oferta',
        parametros: {
          detenida: { total: 1_190_000, preguntas: [PREGUNTA] },
        },
        pedido_por: 'perfil-1',
      }),
    );
    expect(generaciones.terminar).toHaveBeenCalledWith(1, 30, {
      estado: 'error',
      error: 'Falta 1 respuesta sobre tu empresa.',
    });
    expect(fila).toMatchObject({ id: 30, estado: 'error' });
  });

  it('al volver a armar, lo armado antes sigue a la vista: las preguntas van encima', async () => {
    const lista = {
      id: 25,
      estado: 'listo',
      parametros: { postulacion: { total: 990_000, propuesta: true } },
    };
    const { generaciones, oferta, servicio } = armar([PREGUNTA], lista);
    const fila = await servicio.armar(USUARIO, 40, 1_190_000);
    const parametros = {
      postulacion: { total: 990_000, propuesta: true },
      detenida: { total: 1_190_000, preguntas: [PREGUNTA] },
    };
    expect(generaciones.anotarParametros).toHaveBeenCalledWith(
      1,
      25,
      parametros,
    );
    expect(generaciones.crearGeneracion).not.toHaveBeenCalled();
    expect(oferta.pedir).not.toHaveBeenCalled();
    expect(fila).toMatchObject({ id: 25, estado: 'listo', parametros });
  });

  it('con una oferta en curso no se detiene: sigue el camino de siempre', async () => {
    const { generaciones, oferta, servicio } = armar([PREGUNTA], {
      id: 26,
      estado: 'procesando',
      parametros: {},
    });
    await servicio.armar(USUARIO, 40, 1_190_000);
    expect(generaciones.anotarParametros).not.toHaveBeenCalled();
    expect(oferta.pedir).toHaveBeenCalled();
  });

  it('sin preguntas arma como siempre', async () => {
    const { generaciones, oferta, servicio } = armar([]);
    await servicio.armar(USUARIO, 40, 1_190_000);
    expect(generaciones.crearGeneracion).not.toHaveBeenCalled();
    expect(oferta.pedir).toHaveBeenCalled();
  });

  it('al responder guarda y arma sin volver a preguntar', async () => {
    const { oferta, preguntas, servicio } = armar();
    const respuestas = [
      {
        clave: 'rampa',
        pregunta: '¿Tienes rampa?',
        respuesta: 'lo_tengo' as const,
      },
    ];
    await servicio.responderYArmar(USUARIO, 40, 1_190_000, respuestas);
    expect(preguntas.guardar).toHaveBeenCalledWith(1, 40, respuestas);
    expect(preguntas.queFalta).not.toHaveBeenCalled();
    expect(oferta.pedir).toHaveBeenCalledWith(
      1,
      'cuenta-1',
      40,
      expect.objectContaining({
        parametros: {
          postulacion: expect.objectContaining({ total: 1_190_000 }),
        },
      }),
    );
  });
});
