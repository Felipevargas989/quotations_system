import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { FichaRepository } from '../ficha/ficha.repository';
import {
  claveDeExigencia,
  conLoQueRespondio,
} from '../oferente/lo-que-sabemos';
import type { LoQueSabemosService } from '../oferente/lo-que-sabemos.service';
import {
  ESQUEMA_DE_LAS_PREGUNTAS,
  instruccionesDeLasPreguntas,
  lasDecisiones,
  loQueSeGuarda,
} from '../postulacion/las-preguntas';
import { LasPreguntasService } from '../postulacion/las-preguntas.service';

// UN «NO PUEDO» VALE SOLO PARA LO QUE SE PREGUNTÓ (decisión 121, 09-11). En
// la 2656-97-LE26 el modal preguntó solo por los baños para personas con
// discapacidad del salón de cena, y el «No puedo» se guardó para toda la
// exigencia: la cotización perdió el escenario, la pantalla, la cámara y el
// sonido. Felipe: "solamente puse que no a los baños con discapacidad... el
// resto no entiendo".

const SALON =
  'Salón de cena: escenario, mesas redondas con mantelería, vajilla y sillas, pantalla LED 3x2 m con procesador, cámara de circuito cerrado con operador, 6 parlantes en atriles, 4 micrófonos de mano, 4 de cintillo, consola digital de 32 canales mínimo, baños para damas, varones y personas con discapacidad';
const BANOS = 'los baños para personas con discapacidad';
const PREGUNTA =
  '¿Tienes baños para personas con discapacidad junto al salón de cena?';

describe('Un «No puedo» vale solo para lo que se preguntó (decisión 121)', () => {
  it('la IA dice por qué parte pregunta; con las palabras de las bases o por toda la exigencia, no hay parte', () => {
    const { preguntas } = lasDecisiones(
      {
        items: [
          {
            exigencia: 1,
            que_hacer: 'preguntar',
            respuesta: 0,
            pregunta: PREGUNTA,
            parte: BANOS,
          },
          {
            exigencia: 2,
            que_hacer: 'preguntar',
            respuesta: 0,
            pregunta: '¿Tienes buses con seguro?',
            parte: 'Buses con seguro',
          },
          {
            exigencia: 3,
            que_hacer: 'preguntar',
            respuesta: 0,
            pregunta: '',
            parte: 'los vasos',
          },
        ],
      },
      [
        {
          clave: claveDeExigencia(SALON),
          exigencia: SALON,
          por_que: 'faltan los baños para personas con discapacidad',
        },
        {
          clave: claveDeExigencia('Buses con seguro'),
          exigencia: 'Buses con seguro',
          por_que: '',
        },
        {
          clave: claveDeExigencia('Vasos amarillos'),
          exigencia: 'Vasos amarillos',
          por_que: '',
        },
      ],
      [],
    );
    expect(preguntas.map((p) => p.parte)).toEqual([
      BANOS,
      undefined,
      undefined,
    ]);
  });

  it('la IA lo sabe: el esquema pide la parte y las instrucciones dicen cuándo', () => {
    expect(ESQUEMA_DE_LAS_PREGUNTAS.properties.items.items.required).toContain(
      'parte',
    );
    expect(instruccionesDeLasPreguntas()).toContain(
      'escribe en "parte" esa parte',
    );
  });

  it('«No puedo» por una parte: la exigencia queda en «Lo tengo», con las palabras de las bases y lo que falta', () => {
    expect(
      loQueSeGuarda({
        pregunta: PREGUNTA,
        exigencia: SALON,
        respuesta: 'no_puedo',
        detalle: ' hay baños de damas y varones ',
        parte: BANOS,
      }),
    ).toEqual({
      pregunta: SALON,
      respuesta: 'lo_tengo',
      detalle:
        'Todo se cumple, salvo los baños para personas con discapacidad: hay baños de damas y varones.',
    });
    // Sin detalle, y con la parte en mayúscula y con punto, como la escribió
    // la IA.
    expect(
      loQueSeGuarda({
        pregunta: PREGUNTA,
        exigencia: SALON,
        respuesta: 'no_puedo',
        parte: 'Los baños para personas con discapacidad.',
      }).detalle,
    ).toBe('Todo se cumple, salvo los baños para personas con discapacidad.');
  });

  it('lo demás queda como antes: «Lo tengo» por una parte, y «No puedo» por toda la exigencia', () => {
    expect(
      loQueSeGuarda({
        pregunta: PREGUNTA,
        exigencia: SALON,
        respuesta: 'lo_tengo',
        detalle: 'en el hall',
        parte: BANOS,
      }),
    ).toEqual({
      pregunta: PREGUNTA,
      respuesta: 'lo_tengo',
      detalle: 'en el hall',
    });
    expect(
      loQueSeGuarda({
        pregunta: '¿Tienes buses con seguro?',
        exigencia: 'Buses con seguro',
        respuesta: 'no_puedo',
        detalle: null,
      }),
    ).toEqual({
      pregunta: '¿Tienes buses con seguro?',
      respuesta: 'no_puedo',
      detalle: null,
    });
  });

  it('al guardar el modal, «Mi empresa» y «Bases y criterios» dicen «Lo tengo» y la oferta sigue con el salón', async () => {
    const fichas = { marcarExigencia: jest.fn().mockResolvedValue({}) };
    const loQueSabemos = {
      lista: jest.fn(),
      responder: jest.fn().mockResolvedValue(undefined),
    };
    const servicio = new LasPreguntasService(
      fichas as unknown as FichaRepository,
      loQueSabemos as unknown as LoQueSabemosService,
      mockPinoLogger() as unknown as PinoLogger,
    );
    const clave = claveDeExigencia(SALON);
    await servicio.guardar(1, 10792, [
      {
        clave,
        pregunta: PREGUNTA,
        exigencia: SALON,
        respuesta: 'no_puedo',
        parte: BANOS,
      },
    ]);
    const guardada = {
      clave,
      pregunta: SALON,
      exigencia: SALON,
      respuesta: 'lo_tengo' as const,
      detalle:
        'Todo se cumple, salvo los baños para personas con discapacidad.',
      oportunidad_id: 10792,
    };
    expect(loQueSabemos.responder).toHaveBeenCalledWith(1, [guardada]);
    expect(fichas.marcarExigencia).toHaveBeenCalledWith(
      1,
      10792,
      clave,
      'lo_tengo',
    );

    // Lo que leen la oferta y los documentos: el salón se ofrece, con lo
    // que falta dicho.
    const bases = conLoQueRespondio(
      {
        cumplimiento: [
          {
            que: SALON,
            estado: 'conseguir',
            con_que: '',
            por_que: 'faltan los baños para personas con discapacidad',
          },
        ],
      },
      { [clave]: 'lo_tengo' },
      [
        {
          ...guardada,
          id: 6,
          company_id: 1,
          creado_en: '2026-11-09T05:00:00.000Z',
          actualizado_en: '2026-11-09T05:00:00.000Z',
        },
      ],
    );
    expect(bases?.cumplimiento[0]).toMatchObject({
      estado: 'tengo',
      con_que:
        'Todo se cumple, salvo los baños para personas con discapacidad.',
    });
  });
});
