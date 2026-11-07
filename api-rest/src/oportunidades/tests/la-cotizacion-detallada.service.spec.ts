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
    expect(texto).toContain('-$20.000');
    expect(texto).toContain('$480.000');
    expect(texto).toContain('Banco de Prueba');
    expect(texto).toContain('Compra Ágil 2705-1740-COT26');
  });

  it('sin cotización vinculada no se puede: lo dice en palabras', async () => {
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
    ).rejects.toThrow('vincula tu cotización');
    expect(adjuntos.subirArchivo).not.toHaveBeenCalled();
  });

  it('si el precio pasa la cotización, va en una sola línea por el total, con lo que incluye y sin precio por ítem', async () => {
    const { servicio, adjuntos, subidos } = armar();
    await servicio.armar(USUARIO, 11072, 105, 600_000, {
      conPropuesta: false,
      reemplaza: [],
    });
    expect(adjuntos.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'Cotización 2705-1740-COT26.docx' }),
    );
    const [ruta] = adjuntos.subirArchivo.mock.calls[0];
    const texto = textoDeDocx(subidos.get(ruta) as Buffer) ?? '';
    expect(texto).toContain('COTIZACIÓN');
    expect(texto).not.toContain('COTIZACIÓN DETALLADA');
    expect(texto).toContain('Servicio integral');
    expect(texto).toContain(
      'Incluye: miércoles 11 de noviembre de 2026: Salón auditorio día completo; Almuerzo para 20 personas (Carne mechada).',
    );
    expect(texto).toContain('1 servicio');
    expect(texto).toContain('$600.000');
    expect(texto).not.toContain('Descuento');
    expect(texto).not.toContain('$12.500');
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
