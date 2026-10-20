import type { Plan } from '../generacion/generacion.service';
import { trabajarEnElTaller } from '../generacion/taller';
import type {
  ArchivoDelSet,
  FormularioDeLasBases,
} from '../postulacion/el-set';
import { laVueltaAnterior } from '../postulacion/volver-a-armar';
import { armar, CUENTA, entorno, planDe, WORD } from './generacion-de-prueba';
import { wordCon } from './zip-de-prueba';

// «VOLVER A ARMAR» (decisión 49, 19-10). Felipe: "no necesitamos llenarnos
// de documentos: si pongo volver a generar está bien que borre todo lo
// anterior (que no esté firmado); si tengo el 1, 2 y 3 firmados, en este
// caso debe volver a crear solo 4 y 5, y si yo borro todo, que cree todo de
// nuevo".

jest.mock('../generacion/taller', () => ({
  ...jest.requireActual<object>('../generacion/taller'),
  trabajarEnElTaller: jest.fn(),
}));
const taller = trabajarEnElTaller as jest.Mock;
beforeEach(() => taller.mockReset());

const archivo = (
  id: number,
  nombre: string,
  extra: Partial<ArchivoDelSet> = {},
): ArchivoDelSet => ({
  id,
  nombre,
  ruta: `c1/oportunidades/84/postulacion/x_${id}`,
  bytes: 1000,
  seccion: 'postulacion',
  origen: 'generado',
  viene_de: 54,
  generacion_id: 9,
  creado_en: '2026-10-19T22:47:00.000Z',
  ...extra,
});

const formulario = (
  n: number,
  parte = 'administrativa',
): FormularioDeLasBases => ({
  nombre: `Formulario N°${n}`,
  archivo: 'Formularios_Anexos.docx',
  aplica: true,
  se_entrega_en: parte,
});

const FORMULARIOS = [
  formulario(1),
  formulario(2),
  formulario(3, 'tecnica'),
  formulario(4, 'tecnica'),
  formulario(5, 'economica'),
];

/** El Profesor: la vuelta 9 (sin firmar, menos el N°1, 2 y 3, firmados) y
 *  una propuesta vieja sin firmar. */
const POSTULACION = [
  archivo(60, 'Formulario N°1 - lleno.docx'),
  archivo(61, 'Formulario N°2 - lleno.docx'),
  archivo(62, 'Formulario N°3 - lleno.docx'),
  archivo(63, 'Formulario N°4 - lleno.docx'),
  archivo(64, 'Formulario N°5 - lleno.docx'),
  archivo(65, 'Formulario N°1 - firmado.pdf', {
    origen: 'firmado',
    viene_de: 60,
  }),
  archivo(66, 'Formulario N°2 - firmado.pdf', {
    origen: 'firmado',
    viene_de: 61,
  }),
  archivo(67, 'Formulario N°3 - firmado.pdf', {
    origen: 'firmado',
    viene_de: 62,
  }),
  archivo(68, 'Propuesta técnica 1532886.docx', { viene_de: null }),
];

describe('Qué se rehace y qué se reemplaza', () => {
  it('con el 1, 2 y 3 firmados, se rehacen solo el 4 y el 5; los borradores sin firma se reemplazan', () => {
    const v = laVueltaAnterior({
      postulacion: POSTULACION,
      formularios: FORMULARIOS,
      total: 15_900_000,
      totalDe: new Map([[9, 15_900_000]]),
    });
    expect(v).toEqual({
      yaFirmados: ['Formulario N°1', 'Formulario N°2', 'Formulario N°3'],
      todoFirmado: false,
      // El Word de un firmado no se toca: su firmado lo necesita.
      borradoresDeFormularios: [63, 64],
      borradoresDePropuesta: [68],
      propuestaFirmada: false,
    });
  });

  it('si se borra todo, se rehace todo; lo subido a mano cuenta como firmado', () => {
    const nada = laVueltaAnterior({
      postulacion: [],
      formularios: FORMULARIOS,
      total: 15_900_000,
      totalDe: new Map(),
    });
    expect(nada.yaFirmados).toEqual([]);
    expect(nada.todoFirmado).toBe(false);
    const subidos = laVueltaAnterior({
      postulacion: [
        archivo(70, 'Formulario N°4 firmado por Felipe.pdf', {
          origen: 'subido',
          viene_de: null,
        }),
        archivo(71, 'Propuesta técnica firmada.pdf', {
          origen: 'subido',
          viene_de: null,
        }),
      ],
      formularios: FORMULARIOS,
      total: 15_900_000,
      totalDe: new Map(),
    });
    expect(subidos.yaFirmados).toEqual(['Formulario N°4']);
    expect(subidos.propuestaFirmada).toBe(true);
  });

  it('el económico firmado con otro precio se rehace; con todo firmado no hay anexos que rehacer', () => {
    const firmados = [1, 2, 3, 4, 5].flatMap((n) => [
      archivo(80 + n, `Formulario N°${n} - lleno.docx`),
      archivo(90 + n, `Formulario N°${n} - firmado.pdf`, {
        origen: 'firmado',
        viene_de: 80 + n,
      }),
    ]);
    const conOtroPrecio = laVueltaAnterior({
      postulacion: firmados,
      formularios: FORMULARIOS,
      total: 15_900_000,
      totalDe: new Map([[9, 14_000_000]]),
    });
    expect(conOtroPrecio.yaFirmados).not.toContain('Formulario N°5');
    expect(conOtroPrecio.todoFirmado).toBe(false);
    const mismoPrecio = laVueltaAnterior({
      postulacion: firmados,
      formularios: FORMULARIOS,
      total: 15_900_000,
      totalDe: new Map([[9, 15_900_000]]),
    });
    expect(mismoPrecio.todoFirmado).toBe(true);
    expect(mismoPrecio.borradoresDeFormularios).toEqual([]);
  });
});

describe('Se firma y se borra (decisión 58)', () => {
  it('el PDF firmado solo cuenta como firmado, su precio sale de su corrida, y la propuesta se reconoce por su nombre', () => {
    const solos = [
      archivo(65, 'Formulario N°5 - firmado.pdf', {
        origen: 'firmado',
        viene_de: 54,
        generacion_id: 9,
      }),
      archivo(75, 'Formulario N°1 - firmado.pdf', {
        origen: 'firmado',
        viene_de: 54,
        generacion_id: 9,
      }),
      archivo(90, 'Propuesta técnica 1532886 - firmado.pdf', {
        origen: 'firmado',
        viene_de: null,
        generacion_id: 4,
      }),
    ];
    const igual = laVueltaAnterior({
      postulacion: solos,
      formularios: FORMULARIOS,
      total: 15_900_000,
      totalDe: new Map([[9, 15_900_000]]),
    });
    expect(igual.yaFirmados).toEqual(['Formulario N°1', 'Formulario N°5']);
    expect(igual.propuestaFirmada).toBe(true);
    expect(igual.borradoresDeFormularios).toEqual([]);
    const otroPrecio = laVueltaAnterior({
      postulacion: solos,
      formularios: FORMULARIOS,
      total: 15_900_000,
      totalDe: new Map([[9, 14_000_000]]),
    });
    expect(otroPrecio.yaFirmados).toEqual(['Formulario N°1']);
  });
});

describe('Los anexos al volver a armar', () => {
  it('dicen qué está firmado para no rehacerlo, y el trabajo lleva qué reemplaza', () =>
    entorno(async () => {
      const { repo, servicio, ejecutar } = armar();
      await servicio.generarAnexos(1, CUENTA, 40, {
        monto_total: 11_900_000,
        ya_firmados: ['Formulario N°1 - Identificación del oferente'],
        reemplaza: [63, 64],
      });
      const plan = planDe(ejecutar);
      expect(plan.sistema).toContain(
        'YA ESTÁN FIRMADOS y no se rehacen: «Formulario N°1 - Identificación del oferente». No los llenes ni los entregues',
      );
      expect(plan.reemplaza).toEqual([63, 64]);
      expect(repo.crearGeneracion).toHaveBeenCalledWith(
        expect.objectContaining({
          parametros: expect.objectContaining({
            ya_firmados: ['Formulario N°1 - Identificación del oferente'],
          }),
        }),
      );
    }));

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
    reemplaza: [63, 64],
  };
  const USO = { entrada: 1, salida: 1, cacheEscrita: 0, cacheLeida: 0 };

  it('los borradores de antes se borran recién cuando lo nuevo quedó guardado', async () => {
    const { adjuntos, servicio, ejecutar } = armar();
    ejecutar.mockRestore();
    taller.mockResolvedValue({
      archivos: [{ nombre: 'lleno_6.docx', datos: wordCon(['ANEXO N°4']) }],
      texto: 'Listo.',
      uso: USO,
      motivo: 'end_turn',
    });
    await servicio.ejecutar(1, 9, PLAN);
    expect(adjuntos.guardar).toHaveBeenCalled();
    expect(adjuntos.borrarBorradores).toHaveBeenCalledWith(1, 40, [63, 64]);
  });

  it('si no entregó nada, no se borra nada', async () => {
    const { adjuntos, servicio, ejecutar } = armar();
    ejecutar.mockRestore();
    taller.mockResolvedValue({
      archivos: [],
      texto: '',
      uso: USO,
      motivo: 'max_tokens',
    });
    await servicio.ejecutar(1, 9, PLAN);
    expect(adjuntos.borrarBorradores).not.toHaveBeenCalled();
  });
});
