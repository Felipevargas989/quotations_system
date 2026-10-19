import type { Plan } from '../generacion/generacion.service';
import { mismoNombre } from '../generacion/instrucciones';
import { trabajarEnElTaller } from '../generacion/taller';
import {
  ANALISIS,
  armar,
  CUENTA,
  entorno,
  planDe,
} from './generacion-de-prueba';
import { wordCon } from './zip-de-prueba';

// LOS FORMULARIOS EN PDF SE REESCRIBEN EN WORD (Felipe, 18-10: "si bien
// en Word se rellena, si bien escaneado en PDF se reconvierte"). Lo que se
// pide al taller y cómo vuelven los Word, uno por formulario. El taller va
// de mentira.

jest.mock('../generacion/taller', () => ({
  ...jest.requireActual<object>('../generacion/taller'),
  trabajarEnElTaller: jest.fn(),
}));
const taller = trabajarEnElTaller as jest.Mock;

const USO = { entrada: 10_000, salida: 5_000, cacheEscrita: 0, cacheLeida: 0 };

const PLAN: Plan = {
  tipo: 'anexos',
  modelo: 'claude-opus-5-5',
  oportunidadId: 40,
  perfil: 'perfil-1',
  sistema: 'Llenas los anexos.',
  texto: 'Llena los anexos.',
  entradas: [],
  salidas: [],
  esfuerzo: 'medium',
  maxTokens: 64_000,
};

beforeEach(() => taller.mockReset());

describe('Un formulario en PDF', () => {
  it('un PDF elegido se REESCRIBE en Word: Opus, la habilidad de PDF y un Word por formulario (18-10)', () =>
    entorno(async () => {
      const { repo, servicio, ejecutar } = armar();

      await servicio.generarAnexos(1, CUENTA, 40, { adjuntos: [4] });

      expect(repo.crearGeneracion).toHaveBeenCalledWith(
        expect.objectContaining({
          modelo: 'claude-opus-5-5',
          parametros: { monto_total: null, adjuntos: [4] },
          archivos: [{ id: 4, nombre: 'D.A. N°4.770 Bases.pdf' }],
        }),
      );
      const plan = planDe(ejecutar);
      expect(plan.entradas).toEqual([
        {
          enElTaller: 'anexo_4.pdf',
          tipo: 'application/pdf',
          ruta: 'c1/oportunidades/40/x_D.A. N°4.770 Bases.pdf',
          // Además lo mira: los escaneos no traen ni una letra de texto.
          verComoDocumento: true,
        },
      ]);
      // Cuántos formularios trae no se sabe antes: se reconocen por el
      // prefijo.
      expect(plan.salidas).toEqual([
        {
          enElTaller: 'formulario_4_',
          nombre: 'D.A. N°4.770 Bases',
          origen: 'generado',
          viene_de: 4,
          prefijo: true,
        },
      ]);
      expect(plan.habilidades).toEqual([
        expect.objectContaining({ skill_id: 'docx' }),
        expect.objectContaining({ skill_id: 'pdf' }),
      ]);
      expect(plan.maxTokens).toBe(64_000);
      // El protocolo para conservar el original.
      expect(plan.sistema).toContain('AL PIE DE LA LETRA');
      expect(plan.sistema).toContain(
        'NO copies firmas, timbres, sellos, rúbricas ni visaciones',
      );
      expect(plan.sistema).toContain('recórtalo de la imagen de la página');
      expect(plan.sistema).toContain('formulario_8_1.docx');
      expect(plan.sistema).toContain('"titulo"');
      expect(plan.sistema).toContain('cp formulario_*.docx informe.json');
    }));

  it('de un PDF reescrito, un Word por formulario, en orden y con su título; un PDF sin formularios queda como no entregado (18-10)', async () => {
    const { adjuntos, repo, servicio, ejecutar } = armar();
    ejecutar.mockRestore();
    taller.mockResolvedValue({
      archivos: [
        {
          nombre: 'formulario_8_5.docx',
          datos: wordCon(['FORMULARIO N°5', 'OFERTA ECONÓMICA']),
        },
        {
          nombre: 'formulario_8_1.docx',
          datos: wordCon(['FORMULARIO N°1', 'IDENTIFICACIÓN DEL OFERENTE']),
        },
        {
          nombre: 'informe.json',
          datos: Buffer.from(
            JSON.stringify({
              resumen: 'Reescribí los formularios 1 y 5.',
              documentos: [
                {
                  archivo: 'formulario_8_1.docx',
                  titulo: 'Formulario N°1 - Identificación del oferente',
                  que_se_hizo: 'Copiado al pie de la letra y lleno.',
                  pendientes: [],
                },
                {
                  archivo: 'formulario_8_5.docx',
                  titulo: 'Formulario N°5 - Oferta económica',
                  que_se_hizo: 'Sin monto: los valores en blanco.',
                  pendientes: ['El monto de la oferta'],
                },
              ],
              pendientes: [],
            }),
          ),
        },
      ],
      texto: 'Listo.',
      uso: USO,
      motivo: 'end_turn',
    });

    await servicio.ejecutar(1, 9, {
      ...PLAN,
      modelo: 'claude-opus-5-5',
      entradas: [
        {
          enElTaller: 'anexo_8.pdf',
          tipo: 'application/pdf',
          ruta: 'c1/d.pdf',
        },
        {
          enElTaller: 'anexo_9.pdf',
          tipo: 'application/pdf',
          ruta: 'c1/a.pdf',
        },
      ],
      salidas: [
        {
          enElTaller: 'formulario_8_',
          nombre: 'Decreto 4.777',
          origen: 'generado',
          viene_de: 8,
          prefijo: true,
        },
        {
          enElTaller: 'formulario_9_',
          nombre: 'Aclaratoria',
          origen: 'generado',
          viene_de: 9,
          prefijo: true,
        },
      ],
    });

    const nombres = (
      adjuntos.guardar.mock.calls as Array<[{ nombre: string }]>
    ).map(([fila]) => fila.nombre);
    expect(nombres).toEqual([
      'Formulario N°1 - Identificación del oferente - lleno.docx',
      'Formulario N°5 - Oferta económica - lleno.docx',
    ]);
    expect(adjuntos.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ origen: 'generado', viene_de: 8 }),
    );
    expect(repo.terminar).toHaveBeenCalledWith(
      1,
      9,
      expect.objectContaining({
        estado: 'listo',
        resultado: expect.objectContaining({
          no_entregados: ['Aclaratoria'],
        }) as unknown,
      }),
    );
  });

  it('sin elegir, manda el análisis: entra el PDF donde vienen los formularios y la IA sabe en qué páginas; el que no aplica no se llena; el que no vino, a pendientes (18-10)', () =>
    entorno(async () => {
      // Felipe, 18-10: "que cuando la IA analice los documentos identifique
      // dónde están los formularios a rellenar... y deje listo el proceso".
      const { analisis, repo, servicio, ejecutar } = armar();
      analisis.ultimo.mockResolvedValue({
        ...ANALISIS,
        resultado: {
          ...ANALISIS.resultado,
          formularios: [
            {
              nombre: 'Formulario N°1 - Identificación del oferente',
              archivo: 'D.A. N°4.770 Bases.pdf',
              paginas: '16',
              aplica: true,
              por_que_no_aplica: '',
              se_entrega_en: 'administrativa',
            },
            {
              nombre: 'Formulario UTP',
              archivo: 'D.A. N°4.770 Bases',
              paginas: '18',
              aplica: false,
              por_que_no_aplica: 'La empresa postula sola',
              se_entrega_en: 'administrativa',
            },
            {
              nombre: 'Formulario N°5 - Oferta económica',
              archivo: '',
              paginas: '',
              aplica: true,
              por_que_no_aplica: '',
              se_entrega_en: 'economica',
            },
          ],
        },
      });

      await servicio.generarAnexos(1, CUENTA, 40, {});

      expect(repo.crearGeneracion).toHaveBeenCalledWith(
        expect.objectContaining({
          parametros: { monto_total: null, adjuntos: [4, 6, 7] },
        }),
      );
      const sistema = planDe(ejecutar).sistema;
      expect(sistema).toContain('LOS FORMULARIOS QUE ENCONTRÓ EL ANÁLISIS');
      expect(sistema).toContain(
        '- Formulario N°1 - Identificación del oferente: en anexo_4.pdf (pág. 16); se entrega en la parte administrativa.',
      );
      expect(sistema).toContain(
        '- Formulario UTP: NO aplica a esta empresa (La empresa postula sola); no lo llenes.',
      );
      expect(sistema).toContain(
        '- Formulario N°5 - Oferta económica: su formato no está en los archivos que te paso',
      );
    }));

  it('el nombre del archivo calza aunque el análisis lo escriba distinto', () => {
    expect(mismoNombre('D.A._N°4.770_Bases.pdf', 'D.A. N°4.770 Bases')).toBe(
      true,
    );
    expect(mismoNombre('Formularios_Anexos.docx', 'formularios anexos')).toBe(
      true,
    );
    expect(mismoNombre('Bases.pdf', 'Bases técnicas.pdf')).toBe(false);
    expect(mismoNombre('', '')).toBe(false);
  });
});
