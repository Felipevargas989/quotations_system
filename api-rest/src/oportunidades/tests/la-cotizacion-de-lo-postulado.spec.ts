import type { PinoLogger } from 'nestjs-pino';
import type { ClientsService } from 'src/clients/clients.service';
import type { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import type { GenerarRepository } from 'src/quotations/generar/generar.repository';
import type { QuotationsService } from 'src/quotations/quotations.service';
import { mockPinoLogger } from 'src/testing/mocks';
import type { AnalisisRepository } from '../analisis/analisis.repository';
import type { FilaDeLaMatriz } from '../postulacion/armar-la-oferta';
import { CotizacionDeLaPostulacionService } from '../postulacion/cotizacion-de-la-postulacion.service';
import { sinPrecioAparte } from '../postulacion/la-cotizacion-de-lo-postulado';
import {
  type DiaDeLaCotizacion,
  diasDeLaCotizacion,
} from '../postulacion/la-cotizacion-detallada';
import type { PostulacionRepository } from '../postulacion/postulacion.repository';
import { CATALOGO_DE_PRUEBA } from './generacion-de-prueba';

// LO QUE VA SIN PRECIO APARTE EN LA COTIZACIÓN DE LO POSTULADO (decisión
// 120, 08-11). Felipe: "sin precio aparte, el precio es 1 el que ponemos al
// armar", y lo particular de la licitación "la incluyo para no quedar
// fuera por bases". Lo particular que va con un producto del catálogo queda
// en su línea; lo demás que se compromete, en «También incluye».

const DIAS: DiaDeLaCotizacion[] = [
  {
    titulo: 'Viernes 20 de noviembre de 2026',
    subtotal: 1_000_000,
    lineas: [
      {
        servicio: 'Salón Cúpula',
        detalle: '',
        cantidad: '1',
        unidades: 1,
        unitario: 600_000,
        total: 600_000,
        codigos: ['40'],
      },
      {
        servicio: 'Colación',
        detalle: 'Sándwich de ave; Jugo natural',
        cantidad: '200 personas',
        unidades: 200,
        unitario: 2_000,
        total: 400_000,
        codigos: ['2201', '2202'],
      },
    ],
  },
];

const fila = (
  origen: FilaDeLaMatriz['origen'],
  como: string,
  productos: number[] = [],
): FilaDeLaMatriz => ({
  especificacion: como,
  pagina: 0,
  como,
  origen,
  productos,
});

describe('Lo que va sin precio aparte (decisión 120)', () => {
  it('lo particular con un producto, en su línea; lo particular suelto y lo subcontratado, en «También incluye»', () => {
    const { dias, tambien } = sinPrecioAparte(DIAS, [
      fila('catalogo', 'Salón para 200 personas', [40]),
      fila('parecido', 'Colación en bolsa individual', [2201]),
      fila('particular', 'Taza de regalo para cada participante', [2202]),
      fila('particular', '2 galvanos para el premio a los 30 años de servicio'),
      fila('subcontratar', 'Amplificación con 2 micrófonos inalámbricos'),
      fila('subcontratar', 'Amplificación con 2 micrófonos inalámbricos'),
    ]);
    expect(dias[0].lineas.map((l) => l.detalle)).toEqual([
      '',
      'Sándwich de ave; Jugo natural; Taza de regalo para cada participante',
    ]);
    expect(tambien).toEqual([
      '2 galvanos para el premio a los 30 años de servicio',
      'Amplificación con 2 micrófonos inalámbricos',
    ]);
    // Los precios no se tocan: van dentro del mismo precio.
    expect(dias[0].lineas.map((l) => l.total)).toEqual([600_000, 400_000]);
    // Y lo de entrada queda como estaba.
    expect(DIAS[0].lineas[1].detalle).toBe('Sándwich de ave; Jugo natural');
  });

  it('lo particular de un fijo va en su línea, y lo que no calza con ningún producto va aparte', () => {
    const { dias, tambien } = sinPrecioAparte(DIAS, [
      fila('particular', 'Decoración con los colores institucionales', [40]),
      fila('particular', 'Credenciales para los 200 asistentes', [9999]),
    ]);
    expect(dias[0].lineas[0].detalle).toBe(
      'Decoración con los colores institucionales',
    );
    expect(tambien).toEqual(['Credenciales para los 200 asistentes']);
  });

  it('lo que quedó por definir o por confirmar no se promete', () => {
    const { tambien } = sinPrecioAparte(DIAS, [
      fila('completar', '[COMPLETAR: la temática del show]'),
      fila(
        'subcontratar',
        'Show de [POR CONFIRMAR: qué artista] por 45 minutos',
      ),
      fila('particular', '   '),
    ]);
    expect(tambien).toEqual([]);
  });
});

// La de la 4364-13-LE26 (la misma oferta de cotizacion-de-la-postulacion
// .spec.ts): por persona, Plateada 12.000 + Tiramisú 3.000 + Pollo arvejado
// 9.000 + la sección fija (Pan amasado 500) = 24.500; × 235 = 5.757.500;
// más la amplificación (250.000) = 6.007.500.
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

function elServicio() {
  const repo = {
    oportunidad: jest.fn().mockResolvedValue({
      id: 87,
      codigo: '4364-13-LE26',
      quotation_id: null,
      etiquetas: [],
      proceso: {
        nombre: 'Producción de Evento día del Profesor',
        organismo: 'I MUNICIPALIDAD DE QUILLON',
        monto: null,
        fecha_cierre: '2026-10-19T19:00:00Z',
      },
    }),
    vincular: jest.fn(),
    cotizacion: jest.fn().mockResolvedValue(null),
    ultimaPropuesta: jest
      .fn()
      .mockResolvedValue({ id: 31, resultado: { oferta: OFERTA } }),
  };
  const cotizaciones = { create: jest.fn(), update: jest.fn() };
  const clientes = { coincidencias: jest.fn(), create: jest.fn() };
  const servicio = new CotizacionDeLaPostulacionService(
    repo as unknown as PostulacionRepository,
    {
      ultimo: jest.fn().mockResolvedValue({
        estado: 'listo',
        resultado: { personas: 235, fecha_del_servicio_iso: '2026-10-28' },
      }),
    } as unknown as AnalisisRepository,
    {
      catalogo: jest.fn().mockResolvedValue(CATALOGO_DE_PRUEBA),
    } as unknown as GenerarRepository,
    cotizaciones as unknown as QuotationsService,
    clientes as unknown as ClientsService,
    {} as unknown as QuotationFollowupsService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { servicio, repo, cotizaciones, clientes };
}

describe('La cotización de lo postulado, en memoria (decisión 120)', () => {
  it('sin vinculada, la que piden las bases sale de lo postulado: no crea ni vincula nada en Eventia', async () => {
    // Felipe, 08-11: "si las bases piden una cotización, tenemos que armar
    // una solamente en el módulo de oportunidades sin tener que hacer una
    // eventia... arma una tipo y la adjunto".
    const { servicio, cotizaciones, repo, clientes } = elServicio();
    const { cotizacion } = await servicio.deLoPostulado(1, 87);
    expect(cotizaciones.create).not.toHaveBeenCalled();
    expect(cotizaciones.update).not.toHaveBeenCalled();
    expect(clientes.create).not.toHaveBeenCalled();
    expect(repo.vincular).not.toHaveBeenCalled();
    expect(cotizacion).toMatchObject({
      quotation_number: 0,
      event_date: '2026-10-28',
      people_count: 235,
      client: null,
    });
    // Los mismos precios del catálogo que tendría «Crear la cotización».
    const dias = diasDeLaCotizacion(cotizacion);
    expect(dias.reduce((s, d) => s + d.subtotal, 0)).toBe(6_007_500);
  });

  it('sin oferta, lo dice en palabras', async () => {
    const { servicio, repo } = elServicio();
    repo.ultimaPropuesta.mockResolvedValue(null);
    await expect(servicio.deLoPostulado(1, 87)).rejects.toThrow(
      'No hay oferta armada',
    );
  });
});
