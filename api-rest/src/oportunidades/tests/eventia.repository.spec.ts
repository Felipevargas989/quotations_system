import type { PinoLogger } from 'nestjs-pino';
import type { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from 'src/testing/mocks';
import { EventiaRepository } from '../eventia/eventia.repository';

/** Lo que la empresa tiene en Eventia, contra una base falsa que anota cada
 *  consulta. Lo que fija: todo es de UNA empresa, la carta va sin precios y
 *  la agenda solo cuenta lo confirmado de ese día. */
type Consulta = { tabla: string; pasos: unknown[][] };

const METODOS = [
  'select',
  'eq',
  'in',
  'gte',
  'lt',
  'lte',
  'or',
  'order',
  'limit',
];

function armar(
  datos: Record<string, unknown[]> = {},
  balde: { download: jest.Mock } = { download: jest.fn() },
) {
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
    cadena.then = (
      bien: (v: unknown) => unknown,
      mal?: (e: unknown) => unknown,
    ) =>
      Promise.resolve({ data: datos[tabla] ?? [], error: null }).then(
        bien,
        mal,
      );
    return cadena;
  });
  const storage = { from: jest.fn(() => balde) };
  const repo = new EventiaRepository(
    { client: { from, storage } } as unknown as SupabaseService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { repo, consultas, storage };
}

const deLaEmpresa = (c: Consulta, id: number) =>
  c.pasos.some(([m, col, v]) => m === 'eq' && col === 'company_id' && v === id);

describe('EventiaRepository', () => {
  it('la carta: fijos activos con su sección, menús con sus platos y paquetes, sin precios', async () => {
    const { repo, consultas } = armar({
      fixed_services: [
        { name: 'Salón principal', seccion: { name: 'Salones' } },
      ],
      service_groups: [
        {
          name: 'Plateada',
          category: 'Cena',
          items: [
            { servicio: { name: 'Plateada al jugo' } },
            { servicio: null },
          ],
        },
      ],
      service_group_collections: [{ name: 'Matrimonio' }, { name: null }],
    });
    await expect(repo.carta(52)).resolves.toEqual({
      fijos: [{ nombre: 'Salón principal', seccion: 'Salones' }],
      menus: [
        { categoria: 'Cena', nombre: 'Plateada', platos: ['Plateada al jugo'] },
      ],
      paquetes: ['Matrimonio'],
    });
    expect(consultas.map((c) => c.tabla)).toEqual([
      'fixed_services',
      'service_groups',
      'service_group_collections',
    ]);
    for (const c of consultas) expect(deLaEmpresa(c, 52)).toBe(true);
    for (const c of consultas) {
      const [, columnas] = c.pasos.find(([m]) => m === 'select') ?? [];
      expect(String(columnas)).not.toMatch(/price/);
    }
    expect(consultas[0].pasos).toContainEqual(['eq', 'is_active', true]);
  });

  it('los eventos realizados: de la empresa, desde la fecha, del más nuevo al más viejo', async () => {
    const { repo, consultas } = armar({
      quotations: [
        {
          quotation_number: 455,
          event_type: 'Celebraciones',
          event_date: '2025-12-12T00:00:00+00:00',
          people_count: 150,
          total_amount: 9_800_000,
          items: { fixed_services: [{ nombre: 'Salón principal' }] },
          cliente: { name: 'Municipalidad de Bulnes' },
        },
      ],
    });
    await expect(repo.eventosRealizados(52, '2022-10-17')).resolves.toEqual([
      {
        numero: 455,
        tipo: 'Celebraciones',
        fecha: '2025-12-12',
        personas: 150,
        monto: 9_800_000,
        cliente: 'Municipalidad de Bulnes',
        fijos: ['Salón principal'],
      },
    ]);
    const [c] = consultas;
    expect(deLaEmpresa(c, 52)).toBe(true);
    expect(c.pasos).toContainEqual(['eq', 'quotation_status', 'realizada']);
    expect(c.pasos).toContainEqual(['gte', 'event_date', '2022-10-17']);
    expect(c.pasos).toContainEqual([
      'order',
      'event_date',
      { ascending: false },
    ]);
  });

  it('la agenda del día: solo lo aceptado de la empresa que cae ese día (también lo de varios días)', async () => {
    const { repo, consultas } = armar();
    await repo.agendaDelDia(52, '2026-10-30');
    const [c] = consultas;
    expect(deLaEmpresa(c, 52)).toBe(true);
    expect(c.pasos).toContainEqual(['eq', 'quotation_status', 'aceptada']);
    expect(c.pasos).toContainEqual([
      'lte',
      'event_date',
      '2026-10-30T23:59:59.999Z',
    ]);
    expect(c.pasos).toContainEqual([
      'or',
      'event_end_date.gte."2026-10-30T00:00:00.000Z",and(event_end_date.is.null,event_date.gte."2026-10-30T00:00:00.000Z")',
    ]);
  });

  it('las facturas y órdenes de compra de los eventos hechos: de la empresa por su cotización, juntas por evento, el más nuevo primero y con lo que se cobró (decisiones 45 y 75)', async () => {
    // El total llega como número o como texto (numeric): se lee igual.
    const totales: Record<number, number | string> = {
      415: 1_240_000,
      473: '1245000',
    };
    const cotizacion = (numero: number, fecha: string) => ({
      quotation_number: numero,
      event_date: `${fecha}T00:00:00+00:00`,
      total_amount: totales[numero] ?? null,
      clients: { name: ' Municipalidad de Quillón ' },
    });
    const { repo, consultas } = armar({
      event_documents: [
        {
          id: 15,
          category: 'ordenes_compra',
          file_name: '1213301-49-AG26.pdf',
          file_url:
            'c52/event-documents/q-415/ordenes_compra/x_1213301-49-AG26.pdf',
          quotations: cotizacion(415, '2026-07-23'),
        },
        {
          id: 17,
          category: 'facturas',
          file_name: '345.pdf',
          file_url: 'c52/event-documents/q-415/facturas/x_345.pdf',
          quotations: cotizacion(415, '2026-07-23'),
        },
        {
          id: 64,
          category: 'facturas',
          file_name: 'Factura 347.pdf',
          file_url: 'c52/event-documents/q-473/facturas/x_Factura_347.pdf',
          quotations: cotizacion(473, '2026-08-10'),
        },
        // Una ruta vieja (sin la empresa adelante) o de otra empresa: fuera.
        {
          id: 3,
          category: 'facturas',
          file_name: 'vieja.pdf',
          file_url: 'event-documents/q-300/facturas/vieja.pdf',
          quotations: cotizacion(300, '2025-05-01'),
        },
        {
          id: 4,
          category: 'facturas',
          file_name: 'ajena.pdf',
          file_url: 'c7/event-documents/q-301/facturas/ajena.pdf',
          quotations: cotizacion(301, '2025-05-02'),
        },
      ],
    });
    await expect(
      repo.documentosDeExperiencia(52, '2026-10-19'),
    ).resolves.toEqual([
      {
        numero: 473,
        fecha: '2026-08-10',
        cliente: 'Municipalidad de Quillón',
        total: 1_245_000,
        documentos: [
          {
            id: 64,
            categoria: 'facturas',
            nombre: 'Factura 347.pdf',
            ruta: 'c52/event-documents/q-473/facturas/x_Factura_347.pdf',
          },
        ],
      },
      {
        numero: 415,
        fecha: '2026-07-23',
        cliente: 'Municipalidad de Quillón',
        total: 1_240_000,
        documentos: [
          {
            id: 15,
            categoria: 'ordenes_compra',
            nombre: '1213301-49-AG26.pdf',
            ruta: 'c52/event-documents/q-415/ordenes_compra/x_1213301-49-AG26.pdf',
          },
          {
            id: 17,
            categoria: 'facturas',
            nombre: '345.pdf',
            ruta: 'c52/event-documents/q-415/facturas/x_345.pdf',
          },
        ],
      },
    ]);
    const [c] = consultas;
    expect(c.tabla).toBe('event_documents');
    // La tabla no tiene empresa: la da la cotización, con !inner.
    const [, columnas] = c.pasos.find(([m]) => m === 'select') ?? [];
    expect(String(columnas)).toContain('quotations!inner(');
    expect(String(columnas)).toContain('total_amount');
    expect(c.pasos).toContainEqual(['eq', 'quotations.company_id', 52]);
    expect(c.pasos).toContainEqual([
      'in',
      'quotations.quotation_status',
      ['aceptada', 'realizada'],
    ]);
    expect(c.pasos).toContainEqual([
      'lt',
      'quotations.event_date',
      '2026-10-19T00:00:00.000Z',
    ]);
    expect(c.pasos).toContainEqual([
      'in',
      'category',
      ['facturas', 'ordenes_compra'],
    ]);
  });

  it('baja una factura de un evento solo si la ruta es de la empresa', async () => {
    const download = jest.fn().mockResolvedValue({
      data: new Blob(['%PDF-1.7']),
      error: null,
    });
    const { repo, storage } = armar({}, { download });
    await expect(
      repo.descargarDocumento(52, 'c52/event-documents/q/facturas/x_345.pdf'),
    ).resolves.toEqual(Buffer.from('%PDF-1.7'));
    expect(storage.from).toHaveBeenCalledWith('payment-receipts');
    await expect(
      repo.descargarDocumento(52, 'c7/event-documents/q/facturas/x.pdf'),
    ).rejects.toThrow('no es de la empresa');
    await expect(
      repo.descargarDocumento(52, 'c52/oportunidades/40/bases.pdf'),
    ).rejects.toThrow('no es de la empresa');
    expect(download).toHaveBeenCalledTimes(1);
  });
});
