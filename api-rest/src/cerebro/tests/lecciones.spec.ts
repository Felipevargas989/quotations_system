import { cerebroPara, VALLE_DEL_SOL } from '../cerebro';
import {
  aprobadasDe,
  guardarAprobadas,
  reemplazarTodas,
  seccionDeLecciones,
  type Leccion,
} from '../lecciones';

// LO QUE APRENDIÓ BELIA (doc 20 §17, mejora 5): las lecciones aprobadas van
// al final del cerebro, cada una para la tarea que vale, y solo para su
// empresa.

const leccion = (
  texto: string,
  tarea: Leccion['tarea'],
  company_id = VALLE_DEL_SOL,
): Leccion => ({
  id: `l-${texto.length}`,
  company_id,
  tarea,
  texto,
  motivo: null,
  estado: 'aprobada',
  propuesta_por_nombre: 'Felipe',
  decidida_por_nombre: 'Felipe',
  decidida_at: '2026-11-04T23:00:00Z',
  created_at: '2026-11-04T23:00:00Z',
});

const PASEOS = leccion('Los paseos de curso no llevan cena.', 'armar');
const SALUDO = leccion(
  'En los correos, saluda por el nombre de pila.',
  'escribir',
);
const TODAS = leccion(
  'Las cabañas se cotizan en formato 2, 4 y 6 personas.',
  'todas',
);
const CHAT = leccion(
  'En el chat, las tablas antes que los párrafos largos.',
  'conversar',
);

afterEach(() => reemplazarTodas(new Map()));

describe('seccionDeLecciones', () => {
  it('cada tarea lee las suyas y las de todas', () => {
    const lista = [PASEOS, SALUDO, TODAS, CHAT];
    const armar = seccionDeLecciones(lista, 'armar') ?? '';
    expect(armar).toContain(PASEOS.texto);
    expect(armar).toContain(TODAS.texto);
    expect(armar).not.toContain(SALUDO.texto);
    expect(armar).not.toContain(CHAT.texto);
    const escribir = seccionDeLecciones(lista, 'escribir') ?? '';
    expect(escribir).toContain(SALUDO.texto);
    expect(escribir).not.toContain(PASEOS.texto);
  });

  it('BelIA las lee todas, con para qué vale cada una', () => {
    const conversar =
      seccionDeLecciones([PASEOS, SALUDO, TODAS, CHAT], 'conversar') ?? '';
    expect(conversar).toContain(`${PASEOS.texto} (para armar cotizaciones)`);
    expect(conversar).toContain(`- ${TODAS.texto}\n`);
    expect(conversar).toContain(CHAT.texto);
  });

  it('sin lecciones no se suma nada', () => {
    expect(seccionDeLecciones([], 'armar')).toBeNull();
    expect(seccionDeLecciones([SALUDO], 'armar')).toBeNull();
  });
});

describe('cerebroPara con lo aprendido', () => {
  it('suma las aprobadas de la empresa al final, después de las guías', () => {
    const antes = cerebroPara(VALLE_DEL_SOL, 'armar');
    guardarAprobadas(VALLE_DEL_SOL, [PASEOS]);
    const despues = cerebroPara(VALLE_DEL_SOL, 'armar');
    expect(despues.startsWith(antes)).toBe(true);
    expect(despues.slice(antes.length)).toContain('# Lo que aprendió BelIA');
    expect(despues).toContain(PASEOS.texto);
  });

  it('otra empresa no lee las de Valle del Sol', () => {
    guardarAprobadas(VALLE_DEL_SOL, [TODAS]);
    expect(cerebroPara(52, 'conversar')).not.toContain(TODAS.texto);
    guardarAprobadas(52, [
      leccion('Otra regla de la empresa 52.', 'todas', 52),
    ]);
    expect(cerebroPara(52, 'conversar')).toContain(
      'Otra regla de la empresa 52.',
    );
  });

  it('solo las aprobadas, y la recarga deja sin lecciones a la que ya no tiene', () => {
    guardarAprobadas(VALLE_DEL_SOL, [{ ...PASEOS, estado: 'pendiente' }]);
    expect(aprobadasDe(VALLE_DEL_SOL)).toEqual([]);
    guardarAprobadas(VALLE_DEL_SOL, [PASEOS]);
    reemplazarTodas(new Map([[52, [leccion('Una de la 52.', 'todas', 52)]]]));
    expect(aprobadasDe(VALLE_DEL_SOL)).toEqual([]);
    expect(cerebroPara(VALLE_DEL_SOL, 'armar')).not.toContain(PASEOS.texto);
  });
});
