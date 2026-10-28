import type { PinoLogger } from 'nestjs-pino';
import type { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from 'src/testing/mocks';
import { HistoriaRepository } from '../historia/historia.repository';

// LAS LICITACIONES QUE EL RADAR VUELVE A MIRAR (decisión 30, y la 92 para
// las postuladas). Felipe, el 27-10: "al menos que sea en cada revisión del
// radar". Las postuladas se miran en cada pasada (no revisadas en 2 horas);
// las seguidas, una vez cada 20 horas.

type Consulta = { tabla: string; pasos: unknown[][] };

const METODOS = ['select', 'in', 'eq', 'is', 'lt', 'order', 'limit'];
const HORA = 3600_000;

function armar(marcadas: Array<{ codigo: string; estado: string }>) {
  const consultas: Consulta[] = [];
  const from = jest.fn((tabla: string) => {
    const consulta: Consulta = { tabla, pasos: [] };
    consultas.push(consulta);
    const cadena: Record<string, unknown> = {};
    for (const m of METODOS) {
      cadena[m] = (...args: unknown[]) => {
        consulta.pasos.push([m, ...args]);
        return cadena;
      };
    }
    cadena.then = (bien: (v: unknown) => unknown) => {
      const codigos = (consulta.pasos.find(
        ([m, campo]) => m === 'in' && campo === 'codigo',
      )?.[2] ?? []) as string[];
      return Promise.resolve({
        data:
          tabla === 'oportunidades'
            ? marcadas
            : codigos.map((codigo) => ({ codigo })),
        error: null,
      }).then(bien);
    };
    return cadena;
  });
  const repo = new HistoriaRepository(
    { client: { from } } as unknown as SupabaseService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { repo, consultas };
}

/** Hace cuántas horas pide que no se haya revisado. */
const ventana = (c: Consulta) => {
  const lt = c.pasos.find(
    ([m, campo]) => m === 'lt' && campo === 'actualizado_en',
  );
  return Math.round(
    (Date.now() - new Date(lt?.[2] as string).getTime()) / HORA,
  );
};

describe('procesosSeguidos (decisiones 30 y 92)', () => {
  it('las postuladas primero y en cada pasada; las seguidas, una vez al día', async () => {
    const { repo, consultas } = armar([
      { codigo: '4364-13-LE26', estado: 'postulada' },
      { codigo: '1532886-5-LE26', estado: 'postulada' },
      { codigo: '5040-6-LE26', estado: 'seguida' },
      // Postulada por una empresa y seguida por otra: va con las postuladas.
      { codigo: '4364-13-LE26', estado: 'seguida' },
    ]);

    await expect(repo.procesosSeguidos(40)).resolves.toEqual([
      { codigo: '4364-13-LE26' },
      { codigo: '1532886-5-LE26' },
      { codigo: '5040-6-LE26' },
    ]);

    const [postuladas, seguidas] = consultas.filter(
      (c) => c.tabla === 'mp_procesos',
    );
    expect(ventana(postuladas)).toBe(2);
    expect(ventana(seguidas)).toBe(20);
    expect(seguidas.pasos).toContainEqual(['in', 'codigo', ['5040-6-LE26']]);
    expect(seguidas.pasos).toContainEqual(['limit', 38]);
  });

  it('sin marcadas no pregunta por los procesos', async () => {
    const { repo, consultas } = armar([]);
    await expect(repo.procesosSeguidos(40)).resolves.toEqual([]);
    expect(consultas.map((c) => c.tabla)).toEqual(['oportunidades']);
  });
});
