import type { Plan } from '../generacion/generacion.service';
import { leerInforme } from '../generacion/instrucciones';
import {
  leerOferta,
  productosDeLaOferta,
} from '../generacion/oferta-de-la-propuesta';
import { trabajarEnElTaller } from '../generacion/taller';
import { armar } from './generacion-de-prueba';
import { wordCon } from './zip-de-prueba';

// LA PROPUESTA TÉCNICA DEJA SU OFERTA (decisión 29 del doc 17, 19-10).
// Felipe: "lo que traigo del catálogo es lo que debe vaciarse en la nueva
// cotización... tienen que ser equivalentes". El taller va de mentira.

jest.mock('../generacion/taller', () => ({
  ...jest.requireActual<object>('../generacion/taller'),
  trabajarEnElTaller: jest.fn(),
}));
const taller = trabajarEnElTaller as jest.Mock;
beforeEach(() => taller.mockReset());

const OFERTA = {
  cajas: [
    {
      dia: 1,
      categoria: 'Almuerzo',
      audiencia: 'adultos',
      personas: 235,
      menu_id: 7,
      quitar: [],
      servicios: [{ id: 13, cantidad: 1 }],
    },
  ],
  fijos: [{ dia: 0, id: 45, cantidad: 1 }],
};

describe('La oferta de la propuesta técnica', () => {
  it('se lee con cuidado: lo que no tiene forma se bota', () => {
    expect(leerOferta(OFERTA)).toEqual({
      cajas: [{ ...OFERTA.cajas[0], quitar: [] }],
      fijos: [{ dia: 0, id: 45, cantidad: 1 }],
    });
    expect(
      leerOferta({
        cajas: [
          { dia: 0, categoria: 'Almuerzo', personas: 10 },
          { dia: 1, categoria: '', personas: 10 },
          {
            dia: 1,
            categoria: ' Almuerzo ',
            audiencia: 'ninos',
            personas: '20',
            menu_id: 'x',
            servicios: [
              { id: 11, cantidad: 0 },
              { id: 12, cantidad: 2 },
            ],
          },
        ],
        fijos: [{ id: 'no' }, { id: 45, cantidad: 2 }],
      }),
    ).toEqual({
      cajas: [
        {
          dia: 1,
          categoria: 'Almuerzo',
          audiencia: 'ninos',
          personas: 20,
          menu_id: 0,
          quitar: [],
          servicios: [{ id: 12, cantidad: 2 }],
        },
      ],
      fijos: [{ dia: 0, id: 45, cantidad: 2 }],
    });
    expect(leerOferta({ cajas: [], fijos: [] })).toBeNull();
    expect(leerOferta('nada')).toBeNull();
  });

  it('cuenta sus productos: el menú, los sueltos y los fijos', () => {
    expect(productosDeLaOferta(leerOferta(OFERTA)!)).toBe(3);
  });

  it('viene dentro del informe.json, y un informe sin oferta sigue sirviendo', () => {
    const con = leerInforme(
      Buffer.from(
        JSON.stringify({
          resumen: 'Propuesta lista.',
          documentos: [],
          pendientes: [],
          oferta: OFERTA,
        }),
      ),
    );
    expect(con?.oferta?.cajas[0].menu_id).toBe(7);
    const sin = leerInforme(Buffer.from(JSON.stringify({ resumen: 'x' })));
    expect(sin?.oferta).toBeNull();
  });

  it('queda guardada en el resultado de la propuesta, junto al Word', async () => {
    const { repo, servicio, ejecutar } = armar();
    ejecutar.mockRestore();
    taller.mockResolvedValue({
      archivos: [
        { nombre: 'propuesta.docx', datos: wordCon(['Propuesta técnica']) },
        {
          nombre: 'informe.json',
          datos: Buffer.from(
            JSON.stringify({
              resumen: 'Propuesta lista.',
              documentos: [
                {
                  archivo: 'propuesta.docx',
                  que_se_hizo: 'Punto por punto.',
                  pendientes: [],
                },
              ],
              pendientes: [],
              oferta: OFERTA,
            }),
          ),
        },
      ],
      texto: 'Listo.',
      uso: { entrada: 1, salida: 1, cacheEscrita: 0, cacheLeida: 0 },
      motivo: 'end_turn',
    });
    const plan: Plan = {
      tipo: 'propuesta',
      modelo: 'claude-opus-5-5',
      oportunidadId: 40,
      perfil: 'perfil-1',
      sistema: 'Escribes la propuesta.',
      texto: 'Escribe la propuesta técnica.',
      entradas: [],
      salidas: [
        {
          enElTaller: 'propuesta.docx',
          nombre: 'Propuesta técnica 4364-13-LE26.docx',
          origen: 'generado',
          viene_de: null,
        },
      ],
      esfuerzo: 'high',
      maxTokens: 64_000,
    };

    await servicio.ejecutar(1, 9, plan);

    expect(repo.terminar).toHaveBeenCalledWith(
      1,
      9,
      expect.objectContaining({
        estado: 'listo',
        resultado: expect.objectContaining({
          oferta: expect.objectContaining({
            cajas: [expect.objectContaining({ menu_id: 7, personas: 235 })],
            fijos: [{ dia: 0, id: 45, cantidad: 1 }],
          }),
        }),
      }),
    );
  });
});
