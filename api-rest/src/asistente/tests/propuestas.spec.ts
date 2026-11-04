import { ConflictException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import type { LogisticsService } from 'src/logistics/logistics.service';
import { hoyEnChile } from 'src/oportunidades/analisis/comun';
import type { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import {
  QuotationStatus,
  RequestType,
} from 'src/quotations/constants/constants';
import type { Catalogo } from 'src/quotations/generar/catalogo';
import type { GenerarRepository } from 'src/quotations/generar/generar.repository';
import type { QuotationsService } from 'src/quotations/quotations.service';
import { verifyMoney } from 'src/quotations/utils/money';
import { UserRole, type User } from 'src/users/entities/user.entity';
import { mockPinoLogger } from '../../testing/mocks';
import type { AsistenteRepository, Propuesta } from '../asistente.repository';
import { ErrorDeHerramienta, sumarDias } from '../herramientas/comun';
import { leerCambios } from '../herramientas/proponer';
import {
  editarFoto,
  type EventoDeLaCotizacion,
  type FotoGuardada,
} from '../propuestas/editar-foto';
import { PropuestasService } from '../propuestas/propuestas.service';
import {
  choqueConLoServido,
  cuotasDespues,
  huellaDe,
  parcheDe,
  porQueNo,
  type CotizacionParaCambiar,
} from '../propuestas/reglas';

// BELIA, FASE 2 (doc 20 §12, "pruebas de lo prohibido"): BelIA propone y la
// persona aprueba. Lo que se prueba acá es que los candados vuelvan a
// cerrar al aplicar: lo realizado, los días servidos, las compras hechas y
// la cotización que alguien cambió entre medio. Y que los precios salgan
// siempre del catálogo.

// Un catálogo chico: la Cena con su sección fija (pan, id 1), dos postres y
// un menú guardado; un salón de precio fijo.
const catalogo = (): Catalogo => ({
  categorias: [
    {
      id: 10,
      nombre: 'Desayuno',
      orden: 1,
      sueltos: [5],
      seccionFija: [],
      secciones: [],
    },
    {
      id: 20,
      nombre: 'Cena',
      orden: 3,
      sueltos: [1, 2, 3, 4],
      seccionFija: [1],
      secciones: [
        { nombre: 'Fija', servicios: [1] },
        { nombre: 'Principales', servicios: [2] },
        { nombre: 'Postres', servicios: [3, 4] },
      ],
    },
  ],
  menus: [
    {
      id: 900,
      nombre: 'Cena nivel 1',
      categoria: 'Cena',
      nivel: 'Nivel 1',
      ordenNivel: 1,
      items: [
        { id: 2, nombre: 'Lomo', precio: 9_000, cantidad: 1 },
        { id: 3, nombre: 'Leche nevada', precio: 2_000, cantidad: 1 },
      ],
    },
  ],
  servicios: new Map([
    [1, { id: 1, nombre: 'Pan', precio: 500 }],
    [2, { id: 2, nombre: 'Lomo', precio: 9_000 }],
    [3, { id: 3, nombre: 'Leche nevada', precio: 2_000 }],
    [4, { id: 4, nombre: 'Leche asada', precio: 2_500 }],
    [5, { id: 5, nombre: 'Café', precio: 1_000 }],
  ]),
  fijos: new Map([[70, { id: 70, nombre: 'Salón', precio: 300_000 }]]),
  paquetes: [],
});

// Tres días, 40 adultos: la cena del día 1 con leche nevada guardada a
// $1.800 (el precio de cuando se cotizó; hoy el catálogo dice $2.000).
const foto = (): FotoGuardada => ({
  variable_services: [
    {
      category: 'Cena',
      category_id: 20,
      day: 1,
      audience: 'adultos',
      people: 40,
      items: [
        {
          codigo: '1',
          nombre: 'Pan',
          precio: 500,
          categoria: 'Cena',
          quantity: 1,
        },
        {
          codigo: '2',
          nombre: 'Lomo',
          precio: 9_000,
          categoria: 'Cena',
          quantity: 1,
        },
        {
          codigo: '3',
          nombre: 'Leche nevada',
          precio: 1_800,
          categoria: 'Cena',
          quantity: 1,
        },
      ],
    },
    {
      category: 'Desayuno',
      category_id: 10,
      day: 2,
      audience: 'adultos',
      people: 40,
      items: [
        {
          codigo: '5',
          nombre: 'Café',
          precio: 1_000,
          categoria: 'Desayuno',
          quantity: 1,
        },
      ],
    },
  ],
  fixed_services: [],
});

const evento: EventoDeLaCotizacion = {
  fecha: '2026-11-09',
  ultimoDia: '2026-11-11',
  personas: 40,
  ninos: 0,
  esTourOperador: false,
};

describe('Los cambios de BelIA sobre los servicios', () => {
  it('cambia un postre por otro: el nuevo con el precio del catálogo, lo demás intacto', () => {
    const r = editarFoto(
      foto(),
      [
        { accion: 'quitar', dia: 1, categoria: 'Cena', ids: ['3'] },
        {
          accion: 'agregar',
          dia: 1,
          categoria: 'Cena',
          servicios: [{ id: 4, cantidad: 1 }],
        },
      ],
      catalogo(),
      evento,
    );
    if (!r.ok) throw new Error(r.errores.join(' | '));
    const cena = r.foto.variable_services![0];
    expect(cena.items!.map((i) => [i.nombre, i.precio])).toEqual([
      ['Pan', 500],
      ['Lomo', 9_000],
      ['Leche asada', 2_500],
    ]);
    // El desayuno no se tocó.
    expect(r.foto.variable_services![1]).toEqual(foto().variable_services![1]);
    expect(r.lineas).toEqual([
      {
        dia: 1,
        que: 'Cena · 40 adultos',
        quita: ['Leche nevada'],
        agrega: ['Leche asada'],
      },
    ]);
    expect(r.diasTocados).toEqual([1]);
  });

  it('pone una casilla con un menú guardado: la sección fija entra sola y va en su día', () => {
    const r = editarFoto(
      foto(),
      [
        {
          accion: 'poner_casilla',
          dia: 3,
          categoria: 'Cena',
          audiencia: 'adultos',
          personas: 30,
          menu_id: 900,
          quitar: [3],
          servicios: [{ id: 4, cantidad: 1 }],
        },
      ],
      catalogo(),
      evento,
    );
    if (!r.ok) throw new Error(r.errores.join(' | '));
    const nueva = r.foto.variable_services![2];
    expect(nueva).toMatchObject({ day: 3, people: 30, category_id: 20 });
    expect(nueva.items!.map((i) => i.codigo).sort()).toEqual(['1', '2', '4']);
    expect(r.lineas[0]).toMatchObject({ dia: 3, casilla: 'nueva' });
  });

  it('bajar personas queda marcado (con compras hechas, solo el administrador)', () => {
    const r = editarFoto(
      foto(),
      [{ accion: 'personas', dia: 1, categoria: 'Cena', personas: 35 }],
      catalogo(),
      evento,
    );
    if (!r.ok) throw new Error(r.errores.join(' | '));
    expect(r.bajanPersonas).toBe(true);
    expect(r.lineas[0].personas).toEqual({ antes: 40, despues: 35 });
  });

  it('una casilla que queda sin servicios sale', () => {
    const r = editarFoto(
      foto(),
      [{ accion: 'quitar', dia: 2, categoria: 'Desayuno', ids: ['5'] }],
      catalogo(),
      evento,
    );
    if (!r.ok) throw new Error(r.errores.join(' | '));
    expect(r.foto.variable_services).toHaveLength(1);
    expect(r.lineas[0]).toMatchObject({ dia: 2, casilla: 'sale' });
  });

  it('pone y saca fijos del catálogo; un fijo que no es de precio fijo no entra', () => {
    const r = editarFoto(
      foto(),
      [{ accion: 'poner_fijo', id: 70, dia: 0, cantidad: 1 }],
      catalogo(),
      evento,
    );
    if (!r.ok) throw new Error(r.errores.join(' | '));
    expect(r.foto.fixed_services).toEqual([
      expect.objectContaining({ codigo: '70', precio: 300_000, day: 0 }),
    ]);
    expect(r.diasTocados).toEqual([0]);
    const otro = editarFoto(
      foto(),
      [{ accion: 'poner_fijo', id: 71, dia: 0, cantidad: 1 }],
      catalogo(),
      evento,
    );
    expect(otro.ok).toBe(false);
  });

  it('lo que no calza no arma nada: categoría, servicio de otra comida y día fuera del evento', () => {
    const r = editarFoto(
      foto(),
      [
        {
          accion: 'agregar',
          dia: 1,
          categoria: 'Cena',
          servicios: [{ id: 5, cantidad: 1 }],
        },
        { accion: 'quitar', dia: 7, categoria: 'Cena', ids: ['2'] },
        { accion: 'quitar_casilla', dia: 1, categoria: 'Almuerzo' },
      ],
      catalogo(),
      evento,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errores).toHaveLength(3);
    expect(r.errores[0]).toContain('no se ofrece en «Cena»');
    expect(r.errores[1]).toContain('el día debe ir de 1 a 3');
  });

  it('con dos casillas iguales el mismo día, pide cuál', () => {
    const doble = foto();
    doble.variable_services!.push({
      ...doble.variable_services![0],
      people: 10,
    });
    const r = editarFoto(
      doble,
      [{ accion: 'personas', dia: 1, categoria: 'Cena', personas: 12 }],
      catalogo(),
      evento,
    );
    expect(r.ok).toBe(false);
    const bien = editarFoto(
      doble,
      [
        {
          accion: 'personas',
          dia: 1,
          categoria: 'Cena',
          personas: 12,
          cual: 10,
        },
      ],
      catalogo(),
      evento,
    );
    expect(bien.ok).toBe(true);
  });

  it('si no cambia nada, no hay propuesta', () => {
    const r = editarFoto(
      foto(),
      [{ accion: 'personas', dia: 1, categoria: 'Cena', personas: 40 }],
      catalogo(),
      evento,
    );
    expect(r.ok).toBe(false);
  });

  it('la IA no puede mandar acciones que no existen', () => {
    expect(() => leerCambios([{ accion: 'anular' }])).toThrow(
      ErrorDeHerramienta,
    );
  });
});

const cotizacion = (
  c: Partial<CotizacionParaCambiar> = {},
): CotizacionParaCambiar => ({
  id: 'q500',
  quotation_number: 500,
  quotation_status: QuotationStatus.ENVIADA,
  request_type: RequestType.COTIZACION,
  event_date: '2026-11-09T00:00:00+00:00',
  event_end_date: '2026-11-11T00:00:00+00:00',
  people_count: 40,
  children_count: 0,
  items: foto(),
  subtotal_amount: 0,
  discount_percentage: 0,
  discount_amount: 0,
  tip_percentage: null,
  tip_amount: 0,
  total_amount: 0,
  value_per_person: 0,
  fixed_value: 0,
  clients: { name: 'Rudel', client_type: 'empresa' },
  ...c,
});

const persona = (role: UserRole, derechos = ['base', 'post_venta']) =>
  ({ role, derechos }) as unknown as User;

describe('Las reglas de los cambios', () => {
  it('lo realizado está congelado para todos, también el administrador', () => {
    expect(
      porQueNo(
        cotizacion({ quotation_status: QuotationStatus.REALIZADA }),
        persona(UserRole.ADMINISTRADOR),
      ),
    ).toContain('congelada');
  });

  it('una aceptada la cambian solo administración y operaciones', () => {
    const vendida = cotizacion({ quotation_status: QuotationStatus.ACEPTADA });
    expect(porQueNo(vendida, persona(UserRole.VENDEDOR))).toContain(
      'administración y operaciones',
    );
    expect(porQueNo(vendida, persona(UserRole.OPERACIONES))).toBeNull();
  });

  it('un requerimiento, una rechazada o una anulada no se cambian', () => {
    const v = persona(UserRole.VENDEDOR);
    expect(
      porQueNo(cotizacion({ request_type: RequestType.REQUERIMIENTO }), v),
    ).toContain('requerimiento');
    expect(
      porQueNo(cotizacion({ quotation_status: QuotationStatus.RECHAZADA }), v),
    ).toContain('rechazada');
    expect(
      porQueNo(cotizacion({ quotation_status: QuotationStatus.CANCELADA }), v),
    ).toContain('anulada');
  });

  it('en un evento que empezó, los días servidos y el de hoy no se tocan', () => {
    const enCurso = cotizacion({ quotation_status: QuotationStatus.ACEPTADA });
    // Hoy es el día 2 de 3.
    expect(choqueConLoServido(enCurso, [3], '2026-11-10')).toBeNull();
    expect(choqueConLoServido(enCurso, [2], '2026-11-10')).toContain(
      'días 1 a 2',
    );
    expect(choqueConLoServido(enCurso, [0], '2026-11-10')).toContain(
      'todo el evento',
    );
    expect(choqueConLoServido(enCurso, [3], '2026-11-11')).toContain(
      'último día',
    );
    // Antes de que empiece, y en lo no vendido, no hay días cerrados.
    expect(choqueConLoServido(enCurso, [1], '2026-11-08')).toBeNull();
    expect(choqueConLoServido(cotizacion(), [1], '2026-11-10')).toBeNull();
  });

  it('la plata la hace la cuenta de la casa, y el motor la acepta', () => {
    const q = cotizacion({ discount_percentage: 10 });
    const { parche } = parcheDe(q, foto());
    // Cena: (500 + 9.000 + 1.800) × 40; desayuno: 1.000 × 40.
    expect(parche.subtotal_amount).toBe(452_000 + 40_000);
    expect(parche.discount_amount).toBe(0);
    expect(parche.total_amount).toBe(Math.round(492_000 * 0.9));
    expect(
      verifyMoney(parche, {
        items: parche.items as never,
        people_count: 40,
        children_count: 0,
        discount_percentage: 10,
        discount_amount: 0,
        tip_percentage: null,
      }),
    ).toEqual([]);
  });

  it('las cuotas: si sube, crecen las por pagar que no han vencido', () => {
    const r = cuotasDespues(
      [
        {
          id: 'c1',
          payment_number: 1,
          amount: 500_000,
          due_date: '2026-10-01',
          status: 'pagado',
          payment_type: null,
        },
        {
          id: 'c2',
          payment_number: 2,
          amount: 500_000,
          due_date: '2026-12-01',
          status: 'pendiente',
          payment_type: null,
        },
      ],
      [
        {
          payment_id: 'c1',
          amount: 500_000,
          payment_method: 'transferencia',
          transaction_date: '2026-10-01',
        },
      ],
      [],
      100_000,
      '2026-11-03',
    );
    expect(r.cuotas).toEqual([
      expect.objectContaining({ cuota: 1, despues: '$500.000' }),
      expect.objectContaining({ cuota: 2, despues: '$600.000' }),
    ]);
  });

  it('las cuotas: un reembolso pendiente se compensa primero', () => {
    const r = cuotasDespues(
      [
        {
          id: 'c1',
          payment_number: 1,
          amount: 1_000_000,
          due_date: '2026-12-01',
          status: 'pendiente',
          payment_type: null,
        },
      ],
      [],
      [{ amount: 30_000, is_paid: false, refund_date: null }],
      100_000,
      '2026-11-03',
    );
    expect(r.reembolso_compensado).toBe('$30.000');
    expect(r.cuotas[0].despues).toBe('$1.070.000');
  });
});

// ---------- Aplicar: los candados vuelven a cerrar ----------

const hoy = hoyEnChile();

const armarServicio = (
  q: CotizacionParaCambiar,
  propuesta: Partial<Propuesta> = {},
) => {
  const p: Propuesta = {
    id: 'p1',
    company_id: 1,
    quotation_id: q.id,
    usuario_id: 'perfil-1',
    usuario_nombre: 'Camila',
    tipo: 'servicios',
    resumen: 'Leche asada en vez de leche nevada el día 1',
    antes: { items: q.items, total_amount: 0 },
    despues: {
      cambios: [],
      parche: parcheDe(q, foto()).parche,
      dias_tocados: [1],
      bajan_personas: false,
    },
    huella_antes: huellaDe(q),
    huella_despues: null,
    estado: 'pendiente',
    vence_at: new Date(Date.now() + 3_600_000).toISOString(),
    aplicada_at: null,
    deshecha_at: null,
    created_at: new Date().toISOString(),
    ...propuesta,
  };
  const repositorio = {
    propuesta: jest.fn().mockResolvedValue(p),
    moverPropuesta: jest.fn().mockResolvedValue(true),
    cotizacionParaCambiar: jest.fn().mockResolvedValue(q),
    comprasDelEvento: jest.fn().mockResolvedValue(0),
    descartarPendientes: jest.fn().mockResolvedValue(undefined),
    crearPropuesta: jest.fn(),
    plataDe: jest
      .fn()
      .mockResolvedValue({ cuotas: [], abonos: [], reembolsos: [] }),
  };
  const cotizaciones = { update: jest.fn().mockResolvedValue({}) };
  const bitacora = {
    crearComoAsistente: jest.fn().mockResolvedValue({}),
  };
  const servicio = new PropuestasService(
    repositorio as unknown as AsistenteRepository,
    {
      catalogo: jest.fn().mockResolvedValue(catalogo()),
    } as unknown as GenerarRepository,
    {
      findDayPrints: jest.fn().mockResolvedValue([]),
    } as unknown as LogisticsService,
    cotizaciones as unknown as QuotationsService,
    bitacora as unknown as QuotationFollowupsService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { servicio, repositorio, cotizaciones, bitacora };
};

const camila = (role = UserRole.VENDEDOR): User =>
  ({
    id: 'perfil-1',
    company_id: 1,
    role,
    full_name: 'Camila',
    derechos: ['base', 'post_venta', 'asistente'],
  }) as unknown as User;

describe('Sí, aplicar', () => {
  it('aplica por la puerta del cotizador y lo anota a nombre del Asistente', async () => {
    const q = cotizacion();
    const { servicio, cotizaciones, bitacora, repositorio } = armarServicio(q);
    const r = await servicio.aplicar(camila(), 'p1');
    expect(r.estado).toBe('aplicada');
    expect(cotizaciones.update).toHaveBeenCalledWith(
      'q500',
      expect.objectContaining({ total_amount: expect.any(Number) }),
      1,
      UserRole.VENDEDOR,
      expect.anything(),
    );
    expect(repositorio.moverPropuesta).toHaveBeenCalledWith(
      1,
      'p1',
      'pendiente',
      { estado: 'aplicando' },
    );
    const [, nota] = bitacora.crearComoAsistente.mock.calls[0] as [
      number,
      { note: string },
    ];
    expect(nota.note).toContain('a pedido de Camila');
  });

  it('si alguien cambió la cotización entre medio, no aplica', async () => {
    const q = cotizacion();
    const { servicio, cotizaciones, repositorio } = armarServicio(q);
    repositorio.cotizacionParaCambiar.mockResolvedValue(
      cotizacion({ people_count: 45 }),
    );
    await expect(servicio.aplicar(camila(), 'p1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(cotizaciones.update).not.toHaveBeenCalled();
    expect(repositorio.moverPropuesta).toHaveBeenLastCalledWith(
      1,
      'p1',
      'aplicando',
      { estado: 'vencida' },
    );
  });

  it('solo la aplica quien la pidió', async () => {
    const { servicio, cotizaciones } = armarServicio(cotizacion());
    await expect(
      servicio.aplicar({ ...camila(), id: 'otra-persona' } as User, 'p1'),
    ).rejects.toMatchObject({ status: 404 });
    expect(cotizaciones.update).not.toHaveBeenCalled();
  });

  it('dos clics: si otro pedido ya la tomó, no la aplica de nuevo', async () => {
    const { servicio, cotizaciones, repositorio } = armarServicio(cotizacion());
    repositorio.moverPropuesta.mockResolvedValueOnce(false);
    await expect(servicio.aplicar(camila(), 'p1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(cotizaciones.update).not.toHaveBeenCalled();
  });

  it('una ya aplicada o vencida no se aplica', async () => {
    const { servicio, cotizaciones } = armarServicio(cotizacion(), {
      estado: 'aplicada',
    });
    await expect(servicio.aplicar(camila(), 'p1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    const vieja = armarServicio(cotizacion(), {
      vence_at: new Date(Date.now() - 1_000).toISOString(),
    });
    await expect(vieja.servicio.aplicar(camila(), 'p1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(cotizaciones.update).not.toHaveBeenCalled();
    expect(vieja.cotizaciones.update).not.toHaveBeenCalled();
  });

  it('el día pasa: lo que tocaba un día que ya se está sirviendo no se aplica', async () => {
    // Un evento aceptado que empezó ayer: hoy es su día 2.
    const q = cotizacion({
      quotation_status: QuotationStatus.ACEPTADA,
      event_date: `${sumarDias(hoy, -1)}T00:00:00+00:00`,
      event_end_date: `${sumarDias(hoy, 3)}T00:00:00+00:00`,
    });
    const { servicio, cotizaciones } = armarServicio(q, {
      despues: {
        cambios: [],
        parche: parcheDe(q, foto()).parche,
        dias_tocados: [2],
        bajan_personas: false,
      },
    });
    await expect(
      servicio.aplicar(camila(UserRole.OPERACIONES), 'p1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(cotizaciones.update).not.toHaveBeenCalled();
  });

  it('con compras hechas, operaciones no baja personas', async () => {
    const q = cotizacion({
      quotation_status: QuotationStatus.ACEPTADA,
      event_date: `${sumarDias(hoy, 10)}T00:00:00+00:00`,
      event_end_date: `${sumarDias(hoy, 12)}T00:00:00+00:00`,
    });
    const { servicio, cotizaciones, repositorio } = armarServicio(q, {
      despues: {
        cambios: [],
        parche: parcheDe(q, foto()).parche,
        dias_tocados: [1],
        bajan_personas: true,
      },
    });
    repositorio.comprasDelEvento.mockResolvedValue(3);
    await expect(
      servicio.aplicar(camila(UserRole.OPERACIONES), 'p1'),
    ).rejects.toMatchObject({ status: 403 });
    expect(cotizaciones.update).not.toHaveBeenCalled();
  });

  it('proponer sobre algo realizado no arma nada', async () => {
    const q = cotizacion({ quotation_status: QuotationStatus.REALIZADA });
    const { servicio, repositorio } = armarServicio(q);
    await expect(
      servicio.proponerServicios(
        camila(UserRole.ADMINISTRADOR),
        { numero: 500 },
        [{ accion: 'personas', dia: 1, categoria: 'Cena', personas: 35 }],
        'Cinco menos en la cena',
        hoy,
      ),
    ).rejects.toBeInstanceOf(ErrorDeHerramienta);
    expect(repositorio.crearPropuesta).not.toHaveBeenCalled();
  });
});
