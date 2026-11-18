import { writeFile } from 'node:fs/promises';
import { zipCon } from '../../oportunidades/tests/zip-de-prueba';
import { mockPinoLogger } from '../../testing/mocks';
import {
  codigosDeActividades,
  contribuyenteDe,
  cortar,
  elegirDomicilio,
  elegirGiro,
  type ContribuyenteDelSii,
} from '../nomina-sii/nomina-sii';
import { NominaSiiService } from '../nomina-sii/nomina-sii.service';

/**
 * LA NÓMINA DEL SII (doc 19 §9.27; Felipe, 07-11: *"¿cómo lo podemos hacer
 * para que al momento de facturar, el sistema cargue todo solo con el
 * RUT?"*). Las filas como vienen en los archivos de agosto de 2026.
 */

const actividad = (descripcion: string, fecha: string) => ({
  RUT: '76123456',
  DV: '7',
  'CODIGO ACTIVIDAD': '561000',
  'DESC. ACTIVIDAD ECONOMICA': descripcion,
  FECHA: fecha,
  'AFECTA A IVA': 'S',
  'CATEGORIA TRIBUTARIA': '1',
});

const domicilio = (cambios: Record<string, string>) => ({
  RUT: '76123456',
  DV: '7',
  VIGENCIA: 'S',
  FECHA: '2024-11-18',
  TIPO_DIRECCION: 'DOMICILIO',
  CALLE: 'LOS GUINDOS',
  NUMERO: '467',
  BLOQUE: '',
  DEPARTAMENTO: '',
  VILLA_POBLACION: '',
  CIUDAD: 'QUILLON',
  COMUNA: 'QUILLON',
  REGION: 'XVI REGION DE NUBLE',
  ...cambios,
});

describe('La nómina del SII: qué se toma de cada empresa', () => {
  it('el giro: las afectas a IVA primero y, entre ellas, la más antigua; sin paréntesis abiertos', () => {
    // Valle del Sol, como está en el SII (08-11): la compraventa de
    // inmuebles es la más antigua, pero no es afecta a IVA.
    const vds = [
      {
        ...actividad('ACTIVIDADES DE HOTELES', '05-04-2023'),
        'CODIGO ACTIVIDAD': '551001',
      },
      {
        ...actividad(
          'ACTIVIDADES DE RESIDENCIALES PARA TURISTAS',
          '11-02-2023',
        ),
        'CODIGO ACTIVIDAD': '551003',
      },
      {
        ...actividad(
          'COMPRA, VENTA Y ALQUILER (EXCEPTO AMOBLADOS) DE INMUEBLES',
          '20-01-2023',
        ),
        'CODIGO ACTIVIDAD': '681012',
        'AFECTA A IVA': 'N',
      },
    ];
    expect(elegirGiro(vds)).toBe('ACTIVIDADES DE RESIDENCIALES');
    expect(codigosDeActividades(vds)).toEqual([551003, 551001, 681012]);
    expect(
      cortar('COMPRA, VENTA Y ALQUILER (EXCEPTO AMOBLADOS) DE INMUEBLES', 40),
    ).toBe('COMPRA, VENTA Y ALQUILER');
    expect(elegirGiro([])).toBeNull();
  });

  it('la dirección es el domicilio vigente más reciente, con su número y su oficina', () => {
    expect(
      elegirDomicilio([
        domicilio({ FECHA: '2020-01-01', CALLE: 'CALLE VIEJA', NUMERO: '1' }),
        domicilio({ DEPARTAMENTO: 'OF 302', BLOQUE: 'B' }),
        domicilio({ VIGENCIA: 'N', FECHA: '2025-01-01', CALLE: 'NO VIGENTE' }),
      ]),
    ).toEqual({
      direccion: 'LOS GUINDOS 467 BLOCK B OF 302',
      comuna: 'QUILLON',
      ciudad: 'QUILLON',
    });
    // Sin ciudad, la comuna.
    expect(
      elegirDomicilio([domicilio({ CIUDAD: '', COMUNA: 'CONCEPCION' })]),
    ).toMatchObject({ comuna: 'CONCEPCION', ciudad: 'CONCEPCION' });
    expect(elegirDomicilio([domicilio({ VIGENCIA: 'N' })])).toBeNull();
  });

  it('solo las empresas con nombre y actividades vigentes', () => {
    const nombre = { dv: 'k', razon_social: 'VALLE DEL SOL QUILLON SPA' };
    expect(contribuyenteDe(76123456, nombre, [], [])).toBeNull();
    expect(
      contribuyenteDe(76123456, undefined, [actividad('X', '01-01-2020')], []),
    ).toBeNull();
    expect(
      contribuyenteDe(
        76123456,
        nombre,
        [actividad('HOTELES', '01-01-2020')],
        [],
      ),
    ).toEqual({
      rut: 76123456,
      dv: 'K',
      razon_social: 'VALLE DEL SOL QUILLON SPA',
      giro: 'HOTELES',
      actividades: [561000],
      direccion: null,
      comuna: null,
      ciudad: null,
    });
  });

  it('§9.50: la agrupación sin actividades entra sin giro, con su domicilio vigente', () => {
    // El caso real de Felipe (16-11-2026), con sus dos domicilios tal como
    // vienen en la nómina del 03-08-2026: gana el vigente, no el de 2015.
    const agrupacion = {
      dv: '2',
      razon_social: 'AGRUPACION DE PROFESORES JUBILADOS DE SANTA JUANA',
      subtipo: 818,
    };
    const domicilios = [
      domicilio({
        VIGENCIA: 'S',
        FECHA: '2018-10-11',
        CALLE: 'AV BERNARDO OHIGGINS',
        NUMERO: '589',
        // Así viene en el archivo: «INT» en la columna del bloque.
        BLOQUE: 'INT',
        DEPARTAMENTO: '',
        CIUDAD: 'SANTA JUANA',
        COMUNA: 'SANTA JUANA',
      }),
      domicilio({
        VIGENCIA: 'N',
        FECHA: '2015-09-07',
        CALLE: 'LOS ALAMOS',
        NUMERO: '1353',
        VILLA_POBLACION: 'HUERTOS DE UNIHUE',
        CIUDAD: 'SANTA JUANA',
        COMUNA: 'SANTA JUANA',
      }),
    ];
    expect(contribuyenteDe(65108661, agrupacion, [], domicilios)).toEqual({
      rut: 65108661,
      dv: '2',
      razon_social: 'AGRUPACION DE PROFESORES JUBILADOS DE SANTA JUANA',
      giro: null,
      actividades: [],
      direccion: 'AV BERNARDO OHIGGINS 589 BLOCK INT',
      comuna: 'SANTA JUANA',
      ciudad: 'SANTA JUANA',
    });
    // Del 811 al 820, todas; el 810 y el 821 no son de ese grupo.
    for (const subtipo of [811, 812, 816, 820])
      expect(
        contribuyenteDe(1, { ...agrupacion, subtipo }, [], []),
      ).not.toBeNull();
    for (const subtipo of [810, 821, 211, null])
      expect(contribuyenteDe(1, { ...agrupacion, subtipo }, [], [])).toBeNull();
  });

  it('§9.50: la organización con actividades sale igual que hoy, y la sociedad sin actividades sigue fuera', () => {
    const conActividades = contribuyenteDe(
      65000001,
      { dv: '1', razon_social: 'CLUB DEPORTIVO QUILLON', subtipo: 812 },
      [actividad('ACTIVIDADES DE CLUBES DEPORTIVOS', '01-01-2020')],
      [],
    );
    expect(conActividades).toMatchObject({
      giro: 'ACTIVIDADES DE CLUBES DEPORTIVOS',
      actividades: [561000],
    });
    expect(
      contribuyenteDe(
        76000001,
        { dv: '1', razon_social: 'SOCIEDAD CERRADA SPA', subtipo: 211 },
        [],
        [domicilio({})],
      ),
    ).toBeNull();
  });

  it('cortar: no termina colgando de una palabra chica', () => {
    expect(
      cortar('OTROS SERVICIOS DE ALMACENAMIENTO Y DEPOSITO N.C.P.', 36),
    ).toBe('OTROS SERVICIOS DE ALMACENAMIENTO');
    expect(cortar('VENTA AL POR MAYOR DE ARTICULOS DE PERFUMERIA', 35)).toBe(
      'VENTA AL POR MAYOR DE ARTICULOS',
    );
  });

  it('cortar: en una palabra, sin «…» y sin la coma del final', () => {
    expect(
      cortar('AGRUPACION DE PROFESORES,  JUBILADOS DE LA COMUNA', 30),
    ).toBe('AGRUPACION DE PROFESORES');
    expect(cortar('  CORTA  ', 30)).toBe('CORTA');
  });
});

describe('La carga de la nómina desde sii.cl', () => {
  const NOMBRES = [
    'RUT\tDV\tCOD_SUBTIPO\tRAZON_SOCIAL\tFECHA_INICIO_VIG\tFECHA_TG_VIG',
    // Sin orden, como vienen.
    '77000001\t2\t211\tSOCIEDAD SIN DOMICILIO SPA\t01-01-2020\t',
    '50009350\t1\t211\tMENESES ARQUITECTOS ASOCIADOS LIMITADA\t01-01-1993\t',
    '76123456\t7\t211\tVALLE DEL SOL QUILLON SPA\t01-01-2017\t',
    // §9.50: una agrupación sin actividades, sola en su tramo (65 millones).
    '65108661\t2\t818\tAGRUPACION DE PROFESORES JUBILADOS DE SANTA JUANA\t\t',
    // Una junta de vecinos que sí tiene actividades: entra con ellas, una vez.
    '65200002\t3\t811\tJUNTA DE VECINOS LOS AROMOS\t01-01-2019\t',
    // Una sociedad sin actividades: sigue fuera.
    '76999999\t9\t211\tSOCIEDAD QUE DEJO DE OPERAR LIMITADA\t\t',
  ].join('\n');
  const ACTIVIDADES = [
    'RUT\tDV\tCODIGO ACTIVIDAD\tDESC. ACTIVIDAD ECONOMICA\tFECHA\tAFECTA A IVA\tCATEGORIA TRIBUTARIA',
    '65200002\t3\t949100\tACTIVIDADES DE ORGANIZACIONES RELIGIOSAS\t01-01-2019\tN\t1',
    '76123456\t7\t551001\tACTIVIDADES DE HOTELES\t01-03-2017\tS\t1',
    '76123456\t7\t561000\tACTIVIDADES DE RESTAURANTES\t06-05-2025\tS\t1',
    '77000001\t2\t620100\tACTIVIDADES DE PROGRAMACION INFORMATICA\t01-01-2020\tS\t1',
  ].join('\n');
  const DOMICILIOS = [
    'RUT\tDV\tVIGENCIA\tFECHA\tTIPO_DIRECCION\tCALLE\tNUMERO\tBLOQUE\tDEPARTAMENTO\tVILLA_POBLACION\tCIUDAD\tCOMUNA\tREGION',
    '50009350\t1\tS\t2010-01-01\tDOMICILIO\tAV PROVIDENCIA\t100\t\t\t\tSANTIAGO\tPROVIDENCIA\tXIII',
    '65108661\t2\tS\t2018-10-11\tDOMICILIO\tAV BERNARDO OHIGGINS\t589\tINT\t\t\tSANTA JUANA\tSANTA JUANA\tVIII',
    '65108661\t2\tN\t2015-09-07\tDOMICILIO\tLOS ALAMOS\t1353\t\t\tHUERTOS DE UNIHUE\tSANTA JUANA\tSANTA JUANA\tVIII',
    '76123456\t7\tS\t2017-03-01\tDOMICILIO\tLOS GUINDOS\t467\t\t\t\tQUILLON\tQUILLON\tXVI',
  ].join('\n');

  const armar = ({ falla = null as Error | null } = {}) => {
    const guardadas: ContribuyenteDelSii[] = [];
    const repo = {
      ultimaCarga: jest.fn().mockResolvedValue(null),
      ultimaLista: jest.fn().mockResolvedValue(null),
      empezarCarga: jest.fn().mockResolvedValue({
        id: 3,
        empezo_en: new Date().toISOString(),
        estado: 'cargando',
      }),
      guardar: jest
        .fn()
        .mockImplementation((filas: ContribuyenteDelSii[]) =>
          Promise.resolve(void guardadas.push(...filas)),
        ),
      avanzarCarga: jest.fn().mockResolvedValue(undefined),
      guardarActividades: jest.fn().mockResolvedValue(undefined),
      descripcionesDe: jest.fn().mockResolvedValue(
        new Map([
          [551001, 'ACTIVIDADES DE HOTELES'],
          [
            561000,
            'ACTIVIDADES DE RESTAURANTES Y DE SERVICIO MOVIL DE COMIDAS',
          ],
        ]),
      ),
      borrarLasDeOtrasCargas: jest.fn().mockResolvedValue(undefined),
      terminarCarga: jest.fn().mockResolvedValue(undefined),
      fallarCarga: jest.fn().mockResolvedValue(undefined),
      contribuyente: jest.fn(),
    };
    const servicio = new NominaSiiService(
      repo as never,
      mockPinoLogger() as never,
    );
    servicio.minimoDeEmpresas = 1;
    const zips: Record<string, Buffer> = {
      'PUB_NOMBRES_PJ.zip': zipCon([['PUB_NOMBRES_PJ.txt', NOMBRES]]),
      'PUB_NOM_ACTECOS.zip': zipCon([['PUB_NOM_ACTECOS.txt', ACTIVIDADES]]),
      'PUB_NOM_DIRECCIONES.zip': zipCon([
        ['PUB_NOM_DOMICILIO.txt', DOMICILIOS],
        ['PUB_NOM_SUCURSAL.txt', 'RUT\tDV'],
      ]),
    };
    servicio.red = {
      bajar: jest.fn().mockImplementation(async (url: string, ruta: string) => {
        if (falla) throw falla;
        await writeFile(ruta, zips[url.split('/').pop() as string]);
      }),
    };
    return { servicio, repo, guardadas };
  };

  it('junta por RUT las empresas con actividades vigentes y las agrupaciones sin ellas, y deja fuera la sociedad que no tiene', async () => {
    const { servicio, repo, guardadas } = armar();
    await servicio.correr(3);
    expect(guardadas).toEqual([
      {
        rut: 65108661,
        dv: '2',
        razon_social: 'AGRUPACION DE PROFESORES JUBILADOS DE SANTA JUANA',
        giro: null,
        actividades: [],
        direccion: 'AV BERNARDO OHIGGINS 589 BLOCK INT',
        comuna: 'SANTA JUANA',
        ciudad: 'SANTA JUANA',
      },
      {
        rut: 65200002,
        dv: '3',
        razon_social: 'JUNTA DE VECINOS LOS AROMOS',
        giro: 'ACTIVIDADES DE ORGANIZACIONES RELIGIOSAS',
        actividades: [949100],
        direccion: null,
        comuna: null,
        ciudad: null,
      },
      {
        rut: 76123456,
        dv: '7',
        razon_social: 'VALLE DEL SOL QUILLON SPA',
        giro: 'ACTIVIDADES DE HOTELES',
        actividades: [551001, 561000],
        direccion: 'LOS GUINDOS 467',
        comuna: 'QUILLON',
        ciudad: 'QUILLON',
      },
      {
        rut: 77000001,
        dv: '2',
        razon_social: 'SOCIEDAD SIN DOMICILIO SPA',
        giro: 'ACTIVIDADES DE PROGRAMACION INFORMATICA',
        actividades: [620100],
        direccion: null,
        comuna: null,
        ciudad: null,
      },
    ]);
    expect(repo.guardar).toHaveBeenCalledWith(expect.any(Array), 3);
    expect(repo.guardarActividades).toHaveBeenCalledWith([
      {
        codigo: 949100,
        descripcion: 'ACTIVIDADES DE ORGANIZACIONES RELIGIOSAS',
      },
      { codigo: 551001, descripcion: 'ACTIVIDADES DE HOTELES' },
      { codigo: 561000, descripcion: 'ACTIVIDADES DE RESTAURANTES' },
      {
        codigo: 620100,
        descripcion: 'ACTIVIDADES DE PROGRAMACION INFORMATICA',
      },
    ]);
    expect(repo.borrarLasDeOtrasCargas).toHaveBeenCalledWith(3);
    expect(repo.terminarCarga).toHaveBeenCalledWith(3, 4);
    expect(repo.fallarCarga).not.toHaveBeenCalled();
  });

  it('si el SII no responde, queda «fallo» con el motivo y no se borra lo que había', async () => {
    const { servicio, repo } = armar({
      falla: new Error('el SII respondió 503 al bajar la nómina'),
    });
    await servicio.correr(3);
    expect(repo.fallarCarga).toHaveBeenCalledWith(
      3,
      'el SII respondió 503 al bajar la nómina',
    );
    expect(repo.borrarLasDeOtrasCargas).not.toHaveBeenCalled();
    expect(repo.terminarCarga).not.toHaveBeenCalled();
  });

  it('una nómina con muy pocas empresas no reemplaza la anterior', async () => {
    const { servicio, repo } = armar();
    servicio.minimoDeEmpresas = 100_000;
    await servicio.correr(3);
    expect(repo.fallarCarga).toHaveBeenCalledWith(
      3,
      'la nómina trajo solo 4 empresas: se deja la anterior',
    );
    expect(repo.borrarLasDeOtrasCargas).not.toHaveBeenCalled();
  });

  it('una carga a la vez', async () => {
    const { servicio, repo } = armar();
    repo.ultimaCarga.mockResolvedValue({
      id: 2,
      estado: 'cargando',
      empezo_en: new Date().toISOString(),
    });
    await expect(
      servicio.cargar({ id: 'u1', nombre: 'Felipe' }),
    ).rejects.toThrow('La nómina del SII ya se está cargando.');
    expect(repo.empezarCarga).not.toHaveBeenCalled();
  });

  it('buscar: el dígito verificador tiene que calzar, y trae sus otras actividades para el giro', async () => {
    const { servicio, repo } = armar();
    repo.contribuyente.mockResolvedValue({
      rut: 76123456,
      dv: 'K',
      actividades: [561000, 551001],
    });
    expect(await servicio.buscar('76123456-k')).toMatchObject({
      rut: 76123456,
      giro: 'ACTIVIDADES DE RESTAURANTES',
      giros: ['ACTIVIDADES DE RESTAURANTES', 'ACTIVIDADES DE HOTELES'],
    });
    expect(await servicio.buscar('76123456-1')).toBeNull();
    expect(repo.contribuyente).toHaveBeenCalledWith(76123456);
  });

  it('§9.50 buscar: la agrupación llega sin giro y sin actividades para elegir', async () => {
    const { servicio, repo } = armar();
    repo.descripcionesDe.mockResolvedValue(new Map());
    repo.contribuyente.mockResolvedValue({
      rut: 65108661,
      dv: '2',
      razon_social: 'AGRUPACION DE PROFESORES JUBILADOS DE SANTA JUANA',
      giro: null,
      actividades: [],
      direccion: 'AV BERNARDO OHIGGINS 589 BLOCK INT',
      comuna: 'SANTA JUANA',
      ciudad: 'SANTA JUANA',
    });
    expect(await servicio.buscar('65108661-2')).toEqual(
      expect.objectContaining({
        razon_social: 'AGRUPACION DE PROFESORES JUBILADOS DE SANTA JUANA',
        giro: null,
        giros: [],
        direccion: 'AV BERNARDO OHIGGINS 589 BLOCK INT',
      }),
    );
  });
});
