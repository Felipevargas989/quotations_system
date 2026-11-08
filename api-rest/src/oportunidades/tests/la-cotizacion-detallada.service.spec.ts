import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { User } from 'src/users/entities/user.entity';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import type { AnalisisRepository } from '../analisis/analisis.repository';
import { archivoDelZip, textoDeDocx } from '../analisis/docx';
import type { OferenteRepository } from '../oferente/oferente.repository';
import { LaCotizacionDetalladaService } from '../postulacion/la-cotizacion-detallada.service';
import type { PostulacionRepository } from '../postulacion/postulacion.repository';

// LA COTIZACIÓN DETALLADA EN «MI POSTULACIÓN» (decisión 119, 07-11): desde
// la cotización vinculada, sin firma, con la corrida de la oferta que la
// pidió y reemplazando el borrador de antes recién cuando la nueva quedó.

const USUARIO = { id: 'cuenta-1', company_id: 1 } as unknown as User;

function armar() {
  const repo = {
    oportunidad: jest.fn().mockResolvedValue({
      id: 11072,
      codigo: '2705-1740-COT26',
      quotation_id: 'd5dee709',
      proceso: {
        nombre: 'Arriendo de salón con alimentación',
        organismo: 'UNIVERSIDAD DEL BIO BIO',
        tipo: 'compra_agil',
      },
    }),
    cotizacion: jest.fn().mockResolvedValue({
      id: 'd5dee709',
      quotation_number: 574,
      quotation_status: 'aceptada',
      people_count: 20,
      children_count: null,
      event_date: '2026-11-11',
      event_end_date: null,
      subtotal_amount: 500_000,
      discount_amount: 0,
      total_amount: 500_000,
      client: null,
      items: {
        fixed_services: [
          {
            day: 1,
            codigo: '39',
            nombre: 'Salón auditorio día completo',
            precio: 250_000,
            quantity: 1,
          },
        ],
        variable_services: [
          {
            day: 1,
            people: 20,
            audience: 'adultos',
            category: 'Almuerzo',
            items: [
              {
                codigo: '2070',
                nombre: 'Carne mechada',
                precio: 12_500,
                quantity: 1,
              },
            ],
          },
        ],
      },
    }),
  };
  const oferente = {
    oferente: jest.fn().mockResolvedValue({
      razon_social: 'Valle del Sol Quillón SpA',
      rut: '77.701.305-K',
      direccion: 'Los Guindos 467',
      comuna: 'Quillón',
      region: null,
      representante_nombre: 'Hernán Felipe Vargas Droguett',
      representante_cargo: 'Gerente General',
    }),
    empresa: jest.fn().mockResolvedValue({
      name: 'Valle del Sol',
      logo_url: null,
      bank_details: {
        banco: 'Banco de Prueba',
        tipo_cuenta: 'Cuenta corriente',
        numero: '000111222',
        titular: 'Valle del Sol Quillón SpA',
        rut: '77.701.305-K',
      },
    }),
  };
  const subidos = new Map<string, Buffer>();
  const adjuntos = {
    perfilDe: jest.fn().mockResolvedValue('perfil-1'),
    subirArchivo: jest.fn((ruta: string, datos: Buffer) => {
      subidos.set(ruta, datos);
      return Promise.resolve();
    }),
    guardar: jest.fn((fila: Record<string, unknown>) =>
      Promise.resolve({ id: 500, ...fila }),
    ),
    borrarBorradores: jest.fn().mockResolvedValue(1),
    borrarArchivo: jest.fn().mockResolvedValue(true),
  };
  const analisis = {
    ultimo: jest.fn().mockResolvedValue({
      estado: 'listo',
      resultado: {
        se_puede_en_el_complejo: 'si',
        documentos: [
          {
            nombre:
              'Cotización detallada (con plazo de entrega, detalle de lo ofertado y datos bancarios)',
            cuando: 'con_la_oferta',
          },
        ],
      },
    }),
  };
  const servicio = new LaCotizacionDetalladaService(
    repo as unknown as PostulacionRepository,
    oferente as unknown as OferenteRepository,
    adjuntos as unknown as AdjuntosRepository,
    analisis as unknown as AnalisisRepository,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { repo, oferente, adjuntos, analisis, servicio, subidos };
}

describe('La cotización detallada en «Mi postulación»', () => {
  it('queda sin firma, con la oferta que la pidió, y el borrador de antes se borra después de guardarla', async () => {
    const { servicio, adjuntos, subidos } = armar();
    const fila = await servicio.armar(USUARIO, 11072, 105, 480_000, {
      conPropuesta: true,
      reemplaza: [90],
    });
    expect(fila).toMatchObject({ id: 500 });
    expect(adjuntos.guardar).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 1,
        oportunidad_id: 11072,
        nombre: 'Cotización detallada 2705-1740-COT26.docx',
        seccion: 'postulacion',
        origen: 'generado',
        viene_de: null,
        generacion_id: 105,
        subido_por: 'perfil-1',
      }),
    );
    const [ruta] = adjuntos.subirArchivo.mock.calls[0];
    expect(ruta).toMatch(
      /^c1\/oportunidades\/11072\/postulacion\/.+_Cotizacion_detallada_2705-1740-COT26\.docx$/,
    );
    expect(adjuntos.borrarBorradores).toHaveBeenCalledWith(1, 11072, [90]);
    expect(adjuntos.guardar.mock.invocationCallOrder[0]).toBeLessThan(
      adjuntos.borrarBorradores.mock.invocationCallOrder[0],
    );
    const texto = textoDeDocx(subidos.get(ruta) as Buffer) ?? '';
    // El servicio es en el complejo: el plazo dice dónde.
    expect(texto).toContain(
      'El servicio se presta el miércoles 11 de noviembre de 2026, en Los Guindos 467, Quillón.',
    );
    // $500.000 de la cotización repartidos hasta $480.000: el salón a
    // $240.000 y la carne mechada a $12.000 por persona, sin descuento.
    expect(texto).toContain('$240.000');
    expect(texto).toContain('$12.000');
    expect(texto).not.toContain('Descuento');
    expect(texto).toContain('$480.000');
    expect(texto).toContain('Banco de Prueba');
    expect(texto).toContain('Compra Ágil 2705-1740-COT26');
  });

  it('sin cotización vinculada ni lo postulado no se puede: lo dice en palabras', async () => {
    const { servicio, repo, adjuntos } = armar();
    repo.oportunidad.mockResolvedValue({
      id: 11072,
      codigo: '2705-1740-COT26',
      quotation_id: null,
      proceso: { nombre: 'x', organismo: null },
    });
    await expect(
      servicio.armar(USUARIO, 11072, 105, 480_000, {
        conPropuesta: false,
        reemplaza: [],
      }),
    ).rejects.toThrow(
      'arma la postulación, de lo postulado salen sus servicios',
    );
    expect(adjuntos.subirArchivo).not.toHaveBeenCalled();
  });

  it('sin cotización vinculada sale de lo postulado: sin número, lo particular en su línea y lo demás en «También incluye» (decisión 120)', async () => {
    // Felipe, 08-11: "si las bases piden una cotización, tenemos que armar
    // una solamente en el módulo de oportunidades sin tener que hacer una
    // eventia" y "sin precio aparte, el precio es 1 el que ponemos al
    // armar".
    const { servicio, repo, adjuntos, subidos } = armar();
    const enMemoria = {
      ...(await repo.cotizacion()),
      id: '',
      quotation_number: 0,
      quotation_status: 'lo_postulado',
      subtotal_amount: null,
      discount_amount: null,
      total_amount: null,
    };
    repo.cotizacion.mockClear();
    repo.oportunidad.mockResolvedValue({
      id: 11072,
      codigo: '2705-1740-COT26',
      quotation_id: null,
      proceso: {
        nombre: 'Arriendo de salón con alimentación',
        organismo: 'UNIVERSIDAD DEL BIO BIO',
        tipo: 'compra_agil',
      },
    });
    const fila = (
      origen: 'particular' | 'subcontratar' | 'completar',
      como: string,
      productos: number[] = [],
    ) => ({ especificacion: como, pagina: 0, como, origen, productos });
    await servicio.armar(USUARIO, 11072, 105, 600_000, {
      conPropuesta: false,
      reemplaza: [],
      deLoPostulado: {
        cotizacion: enMemoria,
        matriz: [
          fila(
            'particular',
            'Taza de regalo para cada uno de los 20 participantes',
            [2070],
          ),
          fila('subcontratar', 'Amplificación con 2 micrófonos inalámbricos'),
          fila('particular', '2 galvanos para el premio'),
          fila('completar', '[COMPLETAR: la temática del show]'),
        ],
      },
    });
    // No se lee ni se crea ninguna cotización de Eventia.
    expect(repo.cotizacion).not.toHaveBeenCalled();
    const [ruta] = adjuntos.subirArchivo.mock.calls[0];
    const texto = textoDeDocx(subidos.get(ruta) as Buffer) ?? '';
    expect(texto).not.toContain('Cotización N°');
    expect(texto).toContain('Validez: 30 días');
    expect(texto).toContain(
      'Carne mechada; Taza de regalo para cada uno de los 20 participantes',
    );
    expect(texto).toContain('También incluye, dentro del mismo precio:');
    expect(texto).toContain('• Amplificación con 2 micrófonos inalámbricos');
    expect(texto).toContain('• 2 galvanos para el premio');
    expect(texto).not.toContain('COMPLETAR');
    // El precio que manda, repartido sobre los precios del catálogo.
    expect(texto).toContain('$600.000');
  });

  it('si el precio pasa la cotización, los precios suben en la misma proporción: ya no va en una sola línea (Felipe, 07-11)', async () => {
    const { servicio, adjuntos, subidos } = armar();
    await servicio.armar(USUARIO, 11072, 105, 600_000, {
      conPropuesta: false,
      reemplaza: [],
    });
    expect(adjuntos.guardar).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: 'Cotización detallada 2705-1740-COT26.docx',
      }),
    );
    const [ruta] = adjuntos.subirArchivo.mock.calls[0];
    const texto = textoDeDocx(subidos.get(ruta) as Buffer) ?? '';
    expect(texto).toContain('COTIZACIÓN DETALLADA');
    expect(texto).not.toContain('Servicio integral');
    expect(texto).toContain('$300.000');
    expect(texto).toContain('$15.000');
    expect(texto).toContain('$600.000');
    expect(texto).not.toContain('Descuento');
    expect(texto).not.toContain('$12.500');
  });

  it('usa el reparto que le pasa «Armar postulación», el mismo de los formularios; uno de otro precio no', async () => {
    const reparto = [
      {
        titulo: 'Miércoles 11 de noviembre de 2026',
        subtotal: 480_000,
        lineas: [
          {
            servicio: 'Salón auditorio día completo',
            detalle: '',
            cantidad: '1',
            unidades: 1,
            unitario: 240_020,
            total: 240_020,
            unitarioNeto: 201_701,
            totalNeto: 201_701,
          },
          {
            servicio: 'Almuerzo',
            detalle: 'Carne mechada',
            cantidad: '20 personas',
            unidades: 20,
            unitario: 11_999,
            total: 239_980,
            unitarioNeto: 10_083,
            totalNeto: 201_660,
          },
        ],
      },
    ];
    const pasado = armar();
    await pasado.servicio.armar(USUARIO, 11072, 105, 480_000, {
      conPropuesta: false,
      reemplaza: [],
      reparto,
    });
    const [ruta] = pasado.adjuntos.subirArchivo.mock.calls[0];
    const texto = textoDeDocx(pasado.subidos.get(ruta) as Buffer) ?? '';
    expect(texto).toContain('$240.020');
    expect(texto).toContain('$11.999');

    const otroPrecio = armar();
    await otroPrecio.servicio.armar(USUARIO, 11072, 105, 500_000, {
      conPropuesta: false,
      reemplaza: [],
      reparto,
    });
    const [otra] = otroPrecio.adjuntos.subirArchivo.mock.calls[0];
    const suyo = textoDeDocx(otroPrecio.subidos.get(otra) as Buffer) ?? '';
    expect(suyo).not.toContain('$240.020');
    expect(suyo).toContain('$250.000');
    expect(suyo).toContain('$12.500');
  });

  it('si las bases piden una cotización sin detalle de precios, también va en una sola línea', async () => {
    const { servicio, analisis, adjuntos, subidos } = armar();
    analisis.ultimo.mockResolvedValue({
      estado: 'listo',
      resultado: {
        documentos: [
          {
            nombre: 'Cotización formal con datos de contacto y bancarios',
            cuando: 'con_la_oferta',
          },
        ],
      },
    });
    await servicio.armar(USUARIO, 11072, 105, 480_000, {
      conPropuesta: false,
      reemplaza: [],
    });
    const [ruta] = adjuntos.subirArchivo.mock.calls[0];
    const texto = textoDeDocx(subidos.get(ruta) as Buffer) ?? '';
    expect(texto).toContain('Servicio integral');
    expect(texto).toContain('$480.000');
    expect(texto).not.toContain('Descuento');
  });

  it('con los colores de la marca de Configuración de empresa, como la cotización que Eventia manda', async () => {
    const { servicio, oferente, adjuntos, subidos } = armar();
    oferente.empresa.mockResolvedValue({
      name: 'Valle del Sol',
      logo_url: null,
      colors: { primary: '#213a33', secondary: 'no es un color' },
      bank_details: null,
    });
    await servicio.armar(USUARIO, 11072, 105, 480_000, {
      conPropuesta: false,
      reemplaza: [],
    });
    const [ruta] = adjuntos.subirArchivo.mock.calls[0];
    const documento =
      archivoDelZip(
        subidos.get(ruta) as Buffer,
        'word/document.xml',
      )?.toString() ?? '';
    expect(documento).toContain('w:fill="213A33"');
    // Un segundo color que no es color: el gris claro de siempre.
    expect(documento).toContain('w:fill="F3F4F6"');
  });

  it('si no se puede guardar su fila, el archivo no queda huérfano y el borrador de antes sigue', async () => {
    const { servicio, adjuntos } = armar();
    adjuntos.guardar.mockRejectedValue(new Error('se cayó la base'));
    await expect(
      servicio.armar(USUARIO, 11072, 105, 500_000, {
        conPropuesta: false,
        reemplaza: [90],
      }),
    ).rejects.toThrow('se cayó la base');
    expect(adjuntos.borrarArchivo).toHaveBeenCalled();
    expect(adjuntos.borrarBorradores).not.toHaveBeenCalled();
  });
});
