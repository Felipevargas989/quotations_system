import { QuotationStatus } from 'src/quotations/constants/constants';
import type { Catalogo } from 'src/quotations/generar/catalogo';
import {
  buscarEn,
  buscarEnCatalogo,
  normal,
} from '../herramientas/buscar-en-catalogo';
import { conDia, fecha, inicioDelDiaEnChile } from '../herramientas/comun';
import { resumenDePlata } from '../herramientas/pagos';
import { semaforo } from '../herramientas/seguimientos-pendientes';
import { diasDe } from '../herramientas/ver-cotizacion';

// Las herramientas de BelIA sin base: la regla del tablero, los días de la
// minuta y la búsqueda en el catálogo.

describe('seguimientos pendientes: la regla del tablero', () => {
  const hoy = '2026-11-03';
  const q = { sent_at: null, created_at: '2026-10-01T12:00:00Z' };

  it('con el compromiso al día no requiere', () => {
    expect(semaforo(q, { next_contact_date: '2026-11-03' }, hoy)).toEqual({
      requiere: false,
    });
  });

  it('con el compromiso vencido requiere, y es lo más urgente', () => {
    const s = semaforo(q, { next_contact_date: '2026-10-29' }, hoy);
    expect(s).toMatchObject({ requiere: true, urgencia: 1005 });
    if (s.requiere) expect(s.motivo).toContain('jue 29-10-2026');
  });

  it('sin compromiso, 3 días o más desde la última gestión', () => {
    expect(semaforo(q, { last_at: '2026-11-01T15:00:00Z' }, hoy)).toEqual({
      requiere: false,
    });
    expect(semaforo(q, { last_at: '2026-10-31T15:00:00Z' }, hoy)).toMatchObject(
      { requiere: true, urgencia: 103 },
    );
  });

  it('el envío cuenta como gestión', () => {
    expect(
      semaforo(
        { sent_at: '2026-11-02T13:00:00Z', created_at: '2026-10-01T12:00:00Z' },
        undefined,
        hoy,
      ),
    ).toEqual({ requiere: false });
  });
});

describe('ver_cotizacion: los servicios día por día', () => {
  it('agrupa por día con la fecha, para quiénes y el valor por persona', () => {
    const r = diasDe(
      {
        variable_services: [
          {
            category: 'Cena',
            day: 2,
            audience: 'adultos',
            people: 66,
            items: [
              { nombre: 'Pollo al jugo', precio: 6000 },
              { nombre: 'Arroz', precio: 1000 },
              { nombre: 'Leche asada', precio: 2000, quantity: 1 },
            ],
          },
          {
            category: 'Desayuno',
            day: 1,
            audience: 'adultos',
            people: 66,
            items: [{ nombre: 'Té, café y leche', precio: 3000 }],
          },
        ],
        fixed_services: [{ nombre: 'Salón', precio: 300000, day: 0 }],
      },
      '2026-11-09',
      66,
    );
    expect(r.dias.map((d) => d.fecha)).toEqual([
      'lun 09-11-2026',
      'mar 10-11-2026',
    ]);
    expect(r.dias[1].casillas).toEqual([
      {
        categoria: 'Cena',
        para: '66 adultos',
        por_persona: '$9.000',
        servicios: ['Pollo al jugo', 'Arroz', 'Leche asada'],
      },
    ]);
    expect(r.fijos_de_todo_el_evento).toEqual([
      { nombre: 'Salón', cantidad: 1, precio: '$300.000' },
    ]);
  });
});

describe('buscar_en_catalogo', () => {
  const catalogo: Catalogo = {
    categorias: [
      {
        id: 1,
        nombre: 'Cena',
        orden: 1,
        sueltos: [10],
        seccionFija: [],
        secciones: [{ nombre: 'Postres', servicios: [11] }],
      },
    ],
    menus: [
      {
        id: 94,
        nombre: 'Cena nivel 1 - pollo',
        categoria: 'Cena',
        nivel: 'Nivel 1',
        ordenNivel: 1,
        items: [
          { id: 10, nombre: 'Pollo al jugo', precio: 6000, cantidad: 1 },
          { id: 11, nombre: 'Leche asada', precio: 2000, cantidad: 1 },
        ],
      },
    ],
    servicios: new Map([
      [10, { id: 10, nombre: 'Pollo al jugo', precio: 6000 }],
      [11, { id: 11, nombre: 'Leche asada', precio: 2000 }],
    ]),
    fijos: new Map([[5, { id: 5, nombre: 'Salón principal', precio: 300000 }]]),
    paquetes: [],
  };

  it('sin importar tildes ni mayúsculas, y también dentro de los menús', () => {
    expect(normal('Leche ÁSADA')).toBe('leche asada');
    const r = buscarEn(catalogo, 'leche ásada', 'todo');
    expect(r.encontrados).toBe(2);
    expect(r.resultados).toEqual([
      {
        tipo: 'servicio por persona',
        nombre: 'Leche asada',
        categoria: 'Cena',
        seccion: 'Postres',
        precio_por_persona: '$2.000',
      },
      expect.objectContaining({
        tipo: 'menú guardado',
        nombre: 'Cena nivel 1 - pollo',
        precio_por_persona: '$8.000',
      }),
    ]);
  });

  it('acota por tipo', () => {
    expect(buscarEn(catalogo, 'salon', 'fijos').resultados).toEqual([
      { tipo: 'fijo', nombre: 'Salón principal', precio: '$300.000' },
    ]);
    expect(buscarEn(catalogo, 'salon', 'menus').encontrados).toBe(0);
  });
});

describe('las fechas', () => {
  it('el día de la semana sale de la fecha del evento', () => {
    expect(conDia('2026-11-09')).toBe('lun 09-11-2026');
  });

  it('una fecha que no existe vuelve como error para la IA', () => {
    expect(() => fecha('2026-02-30', 'desde')).toThrow('no es una fecha real');
    expect(() => fecha('09-11-2026', 'desde')).toThrow('AAAA-MM-DD');
  });

  it('el día en Chile empieza a las 3 de la mañana UTC en noviembre', () => {
    expect(inicioDelDiaEnChile('2026-11-03')).toBe('2026-11-03T03:00:00.000Z');
    // Y a las 4 en invierno.
    expect(inicioDelDiaEnChile('2026-07-15')).toBe('2026-07-15T04:00:00.000Z');
  });
});

describe('buscar_en_catalogo con varios a la vez', () => {
  it('una sola búsqueda trae cada producto con lo suyo', async () => {
    const catalogo = {
      categorias: [],
      menus: [],
      servicios: new Map([
        [1, { id: 1, nombre: 'Once tradicional', precio: 9300 }],
        [2, { id: 2, nombre: 'Alojamiento temporada alta', precio: 28000 }],
      ]),
      fijos: new Map(),
      paquetes: [],
    };
    const ctx = {
      usuario: { company_id: 1 },
      catalogo: { catalogo: jest.fn().mockResolvedValue(catalogo) },
    } as unknown as Parameters<typeof buscarEnCatalogo.ejecutar>[1];
    const r = (await buscarEnCatalogo.ejecutar(
      { textos: ['once', 'alojamiento', 'x'] },
      ctx,
    )) as { busquedas: Array<{ texto: string; encontrados: number }> };
    // «x» no llega a dos letras: no se busca.
    expect(r.busquedas.map((b) => [b.texto, b.encontrados])).toEqual([
      ['once', 1],
      ['alojamiento', 1],
    ]);
    expect(ctx.catalogo.catalogo).toHaveBeenCalledTimes(1);
  });
});

describe('pagos_del_evento: la plata como la pestaña Pagos', () => {
  const cuotas = [
    {
      id: 'c1',
      payment_number: 1,
      amount: 1000,
      due_date: '2026-10-01',
      status: 'pagado',
      payment_type: null,
    },
    {
      id: 'c2',
      payment_number: 2,
      amount: 1000,
      due_date: '2026-10-20',
      status: 'pendiente',
      payment_type: null,
    },
    {
      id: 'c3',
      payment_number: 3,
      amount: 1000,
      due_date: '2026-12-01',
      status: 'pendiente',
      payment_type: null,
    },
  ];
  const abonos = [
    {
      payment_id: 'c1',
      amount: 1000,
      payment_method: 'transferencia',
      transaction_date: '2026-09-30',
    },
    {
      payment_id: 'c2',
      amount: 400,
      payment_method: 'transferencia',
      transaction_date: '2026-10-19',
    },
  ];

  it('saldo, cuota vencida con lo que le falta y la que viene', () => {
    const r = resumenDePlata(
      3000,
      QuotationStatus.ACEPTADA,
      cuotas,
      abonos,
      [],
      '2026-11-03',
    );
    expect(r.pagado).toBe('$1.400');
    expect(r.saldo).toBe('$1.600');
    expect(r.cuotas.map((c) => [c.cuota, c.estado, c.falta])).toEqual([
      [1, 'pagada', undefined],
      [2, 'vencida', '$600'],
      [3, 'pendiente', '$1.000'],
    ]);
  });

  it('un reembolso pagado vuelve al saldo y un anulado no debe nada', () => {
    const r = resumenDePlata(
      3000,
      QuotationStatus.ACEPTADA,
      cuotas,
      abonos,
      [{ amount: 400, is_paid: true, refund_date: '2026-10-25' }],
      '2026-11-03',
    );
    expect(r.saldo).toBe('$2.000');
    const anulado = resumenDePlata(
      3000,
      QuotationStatus.CANCELADA,
      cuotas,
      abonos,
      [],
      '2026-11-03',
    );
    expect(anulado.saldo).toBe('$0');
    expect(anulado.nota).toContain('anulado');
  });
});
