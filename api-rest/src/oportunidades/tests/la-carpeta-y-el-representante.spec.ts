import { laCarpetaParaLaIA, textoDeLaCarpeta } from '../generacion/la-carpeta';
import { trabajarEnElTaller } from '../generacion/taller';
import {
  contenidoDeLaDeclaracion,
  datosDeLaEmpresa,
} from '../postulacion/las-declaraciones';
import {
  armar,
  CUENTA,
  entorno,
  OFERENTE,
  planDe,
} from './generacion-de-prueba';

// LO QUE PIDIÓ LA 2656-97-LE26 (decisión 121, 09-11). El Anexo N°4
// (programas de integridad, el 10% del puntaje) quedó sin llenar «porque no
// hay datos», con el programa en la carpeta de «Mi empresa»; y el Anexo N°1
// pedía la nacionalidad y la profesión del representante, que «Mi empresa»
// no tenía dónde guardar (migración 197).

jest.mock('../generacion/taller', () => ({
  ...jest.requireActual<object>('../generacion/taller'),
  trabajarEnElTaller: jest.fn(),
}));
beforeEach(() => (trabajarEnElTaller as jest.Mock).mockReset());

const CARPETA = [
  {
    tipo: 'programa_integridad',
    nombre: 'Programa de integridad VDS.pdf',
    vence: null,
  },
  { tipo: 'patente', nombre: 'Patente 2026.pdf', vence: '2027-01-31' },
  {
    tipo: 'respaldo_experiencia',
    nombre: 'OC 4352-103-SE23.pdf',
    vence: null,
  },
];

describe('La carpeta de «Mi empresa» para la IA de los anexos (decisión 121)', () => {
  it('va cada documento con su nombre, sin los respaldos de experiencia (van aparte)', () => {
    const carpeta = laCarpetaParaLaIA(CARPETA);
    expect(carpeta.map((d) => d.tipo)).toEqual([
      'programa_integridad',
      'patente',
    ]);
    const texto = textoDeLaCarpeta(carpeta).join('\n');
    expect(texto).toContain(
      '- Programa de integridad: Programa de integridad VDS.pdf',
    );
    expect(texto).toContain(
      '- Patente municipal: Patente 2026.pdf (vence 2027-01-31)',
    );
    expect(texto).toContain('la respuesta es sí');
    expect(textoDeLaCarpeta([])).toEqual([]);
    expect(textoDeLaCarpeta(undefined)).toEqual([]);
  });

  it('al llenar los anexos, la IA la lee junto a los datos de la empresa', () =>
    entorno(async () => {
      const { oferente, servicio, ejecutar } = armar();
      const documentos = jest.fn().mockResolvedValue(CARPETA);
      Object.assign(oferente, { documentos });

      await servicio.generarAnexos(1, CUENTA, 40, { monto_total: 11_900_000 });

      expect(documentos).toHaveBeenCalledWith(1);
      const { sistema } = planDe(ejecutar);
      expect(sistema).toContain(
        'LO QUE LA EMPRESA TIENE EN SU CARPETA DE DOCUMENTOS',
      );
      expect(sistema).toContain(
        '- Programa de integridad: Programa de integridad VDS.pdf',
      );
      expect(sistema).not.toContain('respaldo_experiencia');
    }));

  it('si la carpeta no se puede leer, los anexos se arman igual, sin ella', () =>
    entorno(async () => {
      const { oferente, servicio, ejecutar } = armar();
      Object.assign(oferente, {
        documentos: jest.fn().mockRejectedValue(new Error('sin base')),
      });

      await servicio.generarAnexos(1, CUENTA, 40, { monto_total: 11_900_000 });

      expect(planDe(ejecutar).sistema).not.toContain('CARPETA DE DOCUMENTOS');
    }));
});

describe('La nacionalidad y la profesión del representante (decisión 121, migración 197)', () => {
  it('la IA de los anexos las lee con los datos de la empresa', () =>
    entorno(async () => {
      const { oferente, servicio, ejecutar } = armar();
      oferente.oferente.mockResolvedValue({
        ...OFERENTE,
        representante_nacionalidad: 'Chilena',
        representante_profesion: 'Ingeniero civil industrial',
      });

      await servicio.generarAnexos(1, CUENTA, 40, { monto_total: 11_900_000 });

      const { sistema } = planDe(ejecutar);
      expect(sistema).toContain(
        '- Nacionalidad del representante legal: Chilena',
      );
      expect(sistema).toContain(
        '- Profesión u oficio del representante legal: Ingeniero civil industrial',
      );
    }));

  it('la identificación del oferente las lleva si están; sin ellas sale como antes', () => {
    const base = {
      razon_social: 'VALLE DEL SOL QUILLÓN SPA',
      rut: '77.701.305-K',
      direccion: 'Los Guindos 467',
      representante_nombre: 'Felipe Vargas',
      representante_rut: '11.111.111-1',
      representante_cargo: 'Gerente General',
    };
    const licitacion = {
      proceso: 'Licitación 2656-97-LE26',
      nombre: 'Fiesta de fin de año',
      comprador: 'MUNICIPALIDAD DE TOMÉ',
    };
    const datos = (o: Record<string, string>) => {
      const c = contenidoDeLaDeclaracion(
        'identificacion',
        datosDeLaEmpresa(o, null),
        licitacion,
      );
      if ('falta' in c) throw new Error(c.falta);
      return c.datos;
    };
    expect(
      datos({
        ...base,
        representante_nacionalidad: 'Chilena',
        representante_profesion: 'Ingeniero civil industrial',
      }),
    ).toEqual(
      expect.arrayContaining([
        ['Nacionalidad', 'Chilena'],
        ['Profesión u oficio', 'Ingeniero civil industrial'],
      ]),
    );
    expect(datos(base).map(([k]) => k)).not.toContain('Nacionalidad');
  });
});
