import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { User } from 'src/users/entities/user.entity';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import type { AnalisisRepository } from '../analisis/analisis.repository';
import { archivoDelZip, textoDeDocx } from '../analisis/docx';
import type { OferenteRepository } from '../oferente/oferente.repository';
import type { Candidata } from '../postulacion/la-experiencia';
import {
  armarLaDeclaracion,
  contenidoDeLaDeclaracion,
  type DatosDeLaEmpresa,
  datosDeLaEmpresa,
  lasDeclaracionesPedidas,
} from '../postulacion/las-declaraciones';
import { LasDeclaracionesService } from '../postulacion/las-declaraciones.service';
import type { PostulacionRepository } from '../postulacion/postulacion.repository';

// LAS DECLARACIONES SIN FORMATO (decisión 119, parte 3b, 08-11). Felipe
// aprobó: "las declaraciones y cartas sin formato salen solas al armar...
// llevan tu logo, tus colores y los datos de Mi empresa, y quedan listas
// para «Firmar»". Las arma el motor sin IA (la IA llena datos, no declara);
// si falta un dato, no se inventa.

const OFERENTE = {
  razon_social: 'VALLE DEL SOL QUILLÓN SPA',
  rut: '77.701.305-K',
  giro: 'Centro de eventos',
  direccion: 'Los Guindos 467',
  comuna: 'Quillón',
  region: 'Ñuble',
  telefono: '+56 9 1111 2222',
  correo: 'contacto@valledelsol.cl',
  representante_nombre: 'Hernán Felipe Vargas Droguett',
  representante_rut: '11.111.111-1',
  representante_cargo: 'Gerente General',
  representante_correo: 'felipe@valledelsol.cl',
  representante_telefono: '+56 9 3333 4444',
  coordinador_nombre: 'Camila Rojas',
  coordinador_cargo: 'Coordinadora de eventos',
  coordinador_correo: 'camila@valledelsol.cl',
  coordinador_telefono: '+56 9 5555 6666',
};

const EMPRESA = {
  name: 'Valle del Sol',
  sitio_web: 'https://valledelsol.cl',
  logo_url: null,
  colors: { primary: '#0B5D3B', secondary: '#E8F5EE' },
  bank_details: {
    banco: 'Banco de Prueba',
    tipo_cuenta: 'Cuenta corriente',
    numero: '000111222',
    titular: 'VALLE DEL SOL QUILLÓN SPA',
    rut: '77.701.305-K',
  },
};

const DATOS: DatosDeLaEmpresa = datosDeLaEmpresa(OFERENTE, EMPRESA);

const LICITACION = {
  proceso: 'Licitación 4362-30-LE26',
  nombre: 'Jornada de capacitación',
  comprador: 'MUNICIPALIDAD DE BULNES',
};

const conTexto = (c: ReturnType<typeof contenidoDeLaDeclaracion>) => {
  if ('falta' in c) throw new Error(c.falta);
  return c;
};

describe('Las declaraciones que piden las bases sin formato', () => {
  it('una por tipo, con el nombre del primer papel que la pide; lo demás no es de aquí', () => {
    const pedidas = lasDeclaracionesPedidas({
      documentos: [
        {
          nombre:
            'Declaración jurada de inhabilidades (prácticas antisindicales, delitos concursales)',
          parte: 'administrativa',
          cuando: 'con_la_oferta',
          carpeta: 'otro',
        },
        {
          nombre: 'Datos bancarios para el pago',
          parte: 'economica',
          cuando: 'con_la_oferta',
          carpeta: 'otro',
          obligatorio: false,
        },
        {
          nombre: 'Fotografías del salón',
          cuando: 'con_la_oferta',
          carpeta: 'otro',
        },
        {
          nombre: 'Declaración jurada de requisitos para ofertar',
          cuando: 'con_la_oferta',
          carpeta: 'otro',
        },
      ],
      formularios: [
        {
          nombre:
            'Declaración jurada de ausencia de conflictos de interés e inhabilidades por condenas',
          archivo: '',
          aplica: true,
          se_entrega_en: 'administrativa',
        },
      ],
    });
    expect(pedidas.map((p) => [p.tipo, p.nombre, p.parte])).toEqual([
      [
        'inhabilidades',
        'Declaración jurada de inhabilidades (prácticas antisindicales, delitos concursales)',
        'administrativa',
      ],
      ['banco', 'Datos bancarios para el pago', 'economica'],
    ]);
  });

  it('los datos de «Mi empresa» y de Configuración: la razón social o, sin ella, el nombre', () => {
    expect(DATOS).toMatchObject({
      razonSocial: 'VALLE DEL SOL QUILLÓN SPA',
      direccion: 'Los Guindos 467, Quillón, Ñuble',
      sitioWeb: 'https://valledelsol.cl',
      banco: [
        ['Titular', 'VALLE DEL SOL QUILLÓN SPA'],
        ['RUT', '77.701.305-K'],
        ['Banco', 'Banco de Prueba'],
        ['Tipo de cuenta', 'Cuenta corriente'],
        ['Número de cuenta', '000111222'],
      ],
    });
    expect(datosDeLaEmpresa({ rut: '1-9' }, EMPRESA).razonSocial).toBe(
      'Valle del Sol',
    );
  });

  it('la de inhabilidades dice lo de la declaración para ofertar de Mercado Público (Ley 21.634), con quien la firma', () => {
    const c = conTexto(
      contenidoDeLaDeclaracion('inhabilidades', DATOS, LICITACION),
    );
    const texto = c.parrafos.join('\n');
    expect(c.parrafos[0]).toBe(
      'Hernán Felipe Vargas Droguett, cédula de identidad N° 11.111.111-1, en representación de VALLE DEL SOL QUILLÓN SPA, RUT N° 77.701.305-K, para la Licitación 4362-30-LE26 «Jornada de capacitación», declara bajo juramento que la empresa que representa:',
    );
    for (const ley of [
      'prácticas antisindicales',
      'delitos concursales',
      'Tribunal de Defensa de la Libre Competencia',
      'Ley N° 20.393',
      'artículo 33 de la Ley N° 21.595',
      'artículo 54, letra b), de la Ley N° 18.575',
      'artículo 35 quáter de la Ley N° 19.886',
      'perjurio del artículo 210 del Código Penal',
    ]) {
      expect(texto).toContain(ley);
    }
    expect(texto).toContain(
      'No tiene conflicto de interés con MUNICIPALIDAD DE BULNES',
    );
  });

  it('si falta un dato, no se inventa: dice qué completar', () => {
    const sinRut = {
      ...DATOS,
      representante: { ...DATOS.representante, rut: '' },
    };
    expect(
      contenidoDeLaDeclaracion('inhabilidades', sinRut, LICITACION),
    ).toEqual({
      falta:
        'completa el RUT del representante legal en «Mi empresa» y vuelve a armar',
    });
    expect(
      contenidoDeLaDeclaracion(
        'ubicacion',
        { ...DATOS, direccion: '' },
        LICITACION,
      ),
    ).toEqual({
      falta: 'completa la dirección en «Mi empresa» y vuelve a armar',
    });
    expect(
      contenidoDeLaDeclaracion('banco', { ...DATOS, banco: [] }, LICITACION),
    ).toEqual({
      falta:
        'completa los datos bancarios en Configuración de empresa y vuelve a armar',
    });
    expect(
      contenidoDeLaDeclaracion('experiencia', DATOS, LICITACION, []),
    ).toEqual({
      falta:
        'sube las órdenes de compra o facturas de tu experiencia en «Mi empresa» y vuelve a armar',
    });
  });

  it('la ubicación del local, la identificación, el contacto (el coordinador primero) y los datos bancarios', () => {
    expect(
      conTexto(contenidoDeLaDeclaracion('ubicacion', DATOS, LICITACION))
        .parrafos[0],
    ).toContain(
      'que el local de la empresa está ubicado en Los Guindos 467, Quillón, Ñuble.',
    );
    expect(
      conTexto(contenidoDeLaDeclaracion('identificacion', DATOS, LICITACION))
        .datos,
    ).toEqual([
      ['Razón social', 'VALLE DEL SOL QUILLÓN SPA'],
      ['RUT', '77.701.305-K'],
      ['Giro', 'Centro de eventos'],
      ['Dirección', 'Los Guindos 467, Quillón, Ñuble'],
      ['Teléfono', '+56 9 1111 2222'],
      ['Correo', 'contacto@valledelsol.cl'],
      ['Página web', 'https://valledelsol.cl'],
      ['Representante legal', 'Hernán Felipe Vargas Droguett'],
      ['RUT del representante legal', '11.111.111-1'],
      ['Cargo', 'Gerente General'],
      ['Correo del representante', 'felipe@valledelsol.cl'],
      ['Teléfono del representante', '+56 9 3333 4444'],
    ]);
    expect(
      conTexto(contenidoDeLaDeclaracion('contacto', DATOS, LICITACION)).datos,
    ).toEqual([
      ['Razón social', 'VALLE DEL SOL QUILLÓN SPA'],
      ['RUT', '77.701.305-K'],
      ['Contacto', 'Camila Rojas'],
      ['Cargo', 'Coordinadora de eventos'],
      ['Correo', 'camila@valledelsol.cl'],
      ['Teléfono', '+56 9 5555 6666'],
      ['Representante legal', 'Hernán Felipe Vargas Droguett'],
    ]);
    expect(
      conTexto(contenidoDeLaDeclaracion('banco', DATOS, LICITACION)).datos,
    ).toEqual(DATOS.banco);
  });

  it('la experiencia: solo la que tiene su orden de compra o factura, en tabla', () => {
    const fila = (x: Partial<Candidata>): Candidata => ({
      clave: 'x',
      de: 'mi_empresa',
      con_respaldo: true,
      numero: '1234-56-SE25',
      mandante: 'Municipalidad de Quillón',
      contrato: 'Almuerzo de fin de año',
      anio: 2025,
      monto: 1_500_000,
      fuente: 'mercado_publico',
      archivo: null,
      ...x,
    });
    const c = conTexto(
      contenidoDeLaDeclaracion('experiencia', DATOS, LICITACION, [
        fila({}),
        fila({ con_respaldo: false, numero: null, mandante: 'Otra' }),
      ]),
    );
    expect(c.experiencia).toEqual([
      [
        'Municipalidad de Quillón',
        'Almuerzo de fin de año',
        '2025',
        '$1.500.000',
        '1234-56-SE25',
      ],
    ]);
  });

  it('el Word: el título como lo llaman las bases, la licitación, el lugar y la fecha, el texto, los datos y la firma', () => {
    const docx = armarLaDeclaracion({
      titulo: 'Formato N°1 - Identificación del oferente',
      licitacion: LICITACION,
      lugarYFecha: 'Quillón, 8 de noviembre de 2026',
      contenido: conTexto(
        contenidoDeLaDeclaracion('identificacion', DATOS, LICITACION),
      ),
      firma: {
        nombre: 'Hernán Felipe Vargas Droguett',
        razonSocial: 'VALLE DEL SOL QUILLÓN SPA',
      },
      marca: { primario: '0B5D3B', secundario: 'E8F5EE' },
    });
    const texto = textoDeDocx(docx) ?? '';
    for (const t of [
      'FORMATO N°1 - IDENTIFICACIÓN DEL OFERENTE',
      'Licitación 4362-30-LE26',
      'MUNICIPALIDAD DE BULNES',
      'Quillón, 8 de noviembre de 2026',
      'Identificación del oferente para la Licitación 4362-30-LE26',
      'RUT del representante legal',
      '11.111.111-1',
      'Representante legal',
    ]) {
      expect(texto).toContain(t);
    }
    // Con los colores de la marca y sin logo.
    const documento =
      archivoDelZip(docx, 'word/document.xml')?.toString('utf8') ?? '';
    expect(documento).toContain('w:val="0B5D3B"');
    expect(archivoDelZip(docx, 'word/media/logo.png')).toBeNull();
  });
});

describe('Las declaraciones en «Mi postulación»', () => {
  const USUARIO = { id: 'cuenta-1', company_id: 1 } as unknown as User;

  function armar(resultado: Record<string, unknown>, empresa = EMPRESA) {
    const repo = {
      oportunidad: jest.fn().mockResolvedValue({
        id: 323,
        codigo: '4362-30-LE26',
        proceso: {
          nombre: 'Jornada de capacitación',
          organismo: 'MUNICIPALIDAD DE BULNES',
          tipo: 'licitacion',
        },
      }),
    };
    const oferente = {
      oferente: jest.fn().mockResolvedValue(OFERENTE),
      empresa: jest.fn().mockResolvedValue(empresa),
    };
    const adjuntos = {
      perfilDe: jest.fn().mockResolvedValue('perfil-1'),
      subirArchivo: jest.fn().mockResolvedValue(undefined),
      guardar: jest.fn((fila: Record<string, unknown>) =>
        Promise.resolve({ id: 700, ...fila }),
      ),
      borrarBorradores: jest.fn().mockResolvedValue(1),
      borrarArchivo: jest.fn().mockResolvedValue(true),
    };
    const analisis = {
      ultimo: jest.fn().mockResolvedValue({ estado: 'listo', resultado }),
    };
    const servicio = new LasDeclaracionesService(
      repo as unknown as PostulacionRepository,
      oferente as unknown as OferenteRepository,
      adjuntos as unknown as AdjuntosRepository,
      analisis as unknown as AnalisisRepository,
      mockPinoLogger() as unknown as PinoLogger,
    );
    return { servicio, adjuntos };
  }

  const BASES = {
    documentos: [
      {
        nombre: 'Declaración jurada con la ubicación del local',
        parte: 'tecnica',
        cuando: 'con_la_oferta',
        carpeta: 'otro',
      },
      {
        nombre: 'Datos bancarios para el pago',
        parte: 'economica',
        cuando: 'con_la_oferta',
        carpeta: 'otro',
      },
    ],
    formularios: [
      {
        nombre: 'Formato N°1 - Identificación del oferente',
        archivo: '',
        aplica: true,
        se_entrega_en: 'administrativa',
      },
    ],
  };

  it('cada una con el nombre de las bases, sin firma y con la oferta que la pidió; los borradores de antes se borran después', async () => {
    const { servicio, adjuntos } = armar(BASES);
    const r = await servicio.armar(USUARIO, 323, 105, {
      experiencia: null,
      reemplaza: [80, 81],
      yaHechas: [],
    });
    expect(r).toEqual({ hechas: 3, noSalieron: [] });
    const guardadas = adjuntos.guardar.mock.calls.map(([fila]) => fila);
    expect(guardadas.map((g) => g.nombre)).toEqual([
      'Declaración jurada con la ubicación del local 4362-30-LE26.docx',
      'Datos bancarios para el pago 4362-30-LE26.docx',
      'Formato N°1 - Identificación del oferente 4362-30-LE26.docx',
    ]);
    for (const g of guardadas) {
      expect(g).toMatchObject({
        company_id: 1,
        oportunidad_id: 323,
        seccion: 'postulacion',
        origen: 'generado',
        viene_de: null,
        generacion_id: 105,
      });
    }
    expect(adjuntos.borrarBorradores).toHaveBeenCalledWith(1, 323, [80, 81]);
  });

  it('lo firmado o subido a mano no se rehace, y lo que no sale por un dato queda dicho', async () => {
    const { servicio, adjuntos } = armar(BASES, {
      ...EMPRESA,
      bank_details: null,
    } as unknown as typeof EMPRESA);
    const r = await servicio.armar(USUARIO, 323, 105, {
      experiencia: null,
      reemplaza: [],
      yaHechas: ['identificacion'],
    });
    expect(r).toEqual({
      hechas: 1,
      noSalieron: [
        '«Datos bancarios para el pago»: completa los datos bancarios en Configuración de empresa y vuelve a armar.',
      ],
    });
    expect(adjuntos.guardar).toHaveBeenCalledTimes(1);
  });

  it('sin declaraciones que armar no toca nada', async () => {
    const { servicio, adjuntos } = armar({ documentos: [], formularios: [] });
    const r = await servicio.armar(USUARIO, 323, 105, {
      experiencia: null,
      reemplaza: [80],
      yaHechas: [],
    });
    expect(r).toEqual({ hechas: 0, noSalieron: [] });
    expect(adjuntos.guardar).not.toHaveBeenCalled();
    expect(adjuntos.borrarBorradores).not.toHaveBeenCalled();
  });
});
