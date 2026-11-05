import { revisarArchivo } from '../facturacion-cl/simulado';
import {
  armarBorrador,
  glosaYDescripcion,
  revisarFactura,
  type ContextoDeLaFactura,
  type OrdenAFacturar,
  type RazonSocialGuardada,
} from '../facturas/borrador';

/**
 * EL BORRADOR DE LA FACTURA (doc 19 §9.2, paso 2c), con los casos del
 * laboratorio: CCU (#408, pide la nota de pedido) y Santo Tomás (#481, dos
 * RUT para un evento).
 */

const CCU: RazonSocialGuardada = {
  id: 1,
  rut: '90413000-1',
  razon_social: 'Compañía Cervecerías Unidas S.A.',
  giro: 'Elaboración de cervezas',
  direccion: 'Av. Vitacura 2670',
  comuna: 'Las Condes',
  ciudad: 'Santiago',
  correo_facturacion: 'facturas@ccu.cl, pagos@ccu.cl',
  referencias_exigidas: ['801', '802'],
};

const OC_CCU: OrdenAFacturar = {
  id: 1,
  numero: '4500918822',
  fecha: '2026-10-01',
  rut: '90413000-1',
  razon_social: 'Compañía Cervecerías Unidas S.A.',
  comprador: null,
  descripcion: 'Paseo fin de año CCU, 400 personas',
  neto: null,
  iva: null,
  total: 1428000,
  facturado: 0,
  pdf: '4500918822.pdf',
};

const contexto = (cambios: Partial<ContextoDeLaFactura> = {}) =>
  ({
    evento: {
      id: 'ev-408',
      numero: 408,
      estado: 'aceptada',
      tipoDeEvento: 'Paseo fin de año',
      desde: '2026-12-06',
      hasta: null,
      personas: 400,
      total: 1428000,
      clientId: 'ccu',
      cliente: 'CCU',
    },
    oc: OC_CCU,
    razones: [CCU],
    facturadoDelEvento: 0,
    totalDeLasOC: 1428000,
    ...cambios,
  }) as ContextoDeLaFactura;

describe('El borrador que arma BelIA', () => {
  it('con OC: el receptor de la ficha, el detalle y el total de la OC, la 801 y la 802 por preguntar', () => {
    const b = armarBorrador(contexto());
    expect(b.origenes).toEqual({
      receptor: 'ficha',
      detalle: 'orden_de_compra',
    });
    expect(b.leidoDe).toEqual([
      'OC 4500918822.pdf',
      'cotización N° 408',
      'ficha de CCU',
    ]);
    expect(b.pedida.receptor.razon_social).toBe(
      'Compañía Cervecerías Unidas S.A.',
    );
    expect(b.pedida.porcentaje).toBe(100);
    expect(b.pedida.detalle).toEqual({
      descripcion: 'Paseo fin de año CCU, 400 personas',
      descripcion_larga: null,
    });
    expect(b.pedida.referencias).toEqual([
      { tipo: '801', folio: '4500918822', fecha: '2026-10-01' },
      { tipo: '802', folio: '', fecha: '' },
    ]);
    expect(b.pedida.pedir_siempre).toEqual(['801', '802']);
  });

  it('pregunta la nota de pedido, y con ella el archivo pasa la revisión de facturacion.cl', () => {
    const ctx = contexto();
    const { pedida } = armarBorrador(ctx);
    const sinNota = revisarFactura(pedida, ctx, 1235, '2026-11-15');
    expect(sinNota.ok).toBe(false);
    expect(sinNota.faltan).toEqual([
      {
        campo: 'referencia:802',
        texto: 'nota de pedido (802): su N° y su fecha',
      },
    ]);
    expect(sinNota.montos).toEqual({
      neto: 1200000,
      exento: 0,
      iva: 228000,
      total: 1428000,
    });

    pedida.referencias[1] = {
      tipo: '802',
      folio: '4505440173',
      fecha: '2026-10-30',
    };
    const lista = revisarFactura(pedida, ctx, 1235, '2026-11-15');
    expect(lista.ok).toBe(true);
    expect(lista.avisos).toEqual([]);
    expect(lista.archivo).toContain('1;801;4500918822;2026-10-01;0;;');
    expect(lista.archivo).toContain('2;802;4505440173;2026-10-30;0;;');
    expect(revisarArchivo(lista.archivo ?? '')).toMatchObject({ tipo: 33 });
  });

  it('un RUT nuevo (Santo Tomás): lo de la OC, y lo que no cabe en la factura se dice', () => {
    const cft: RazonSocialGuardada = {
      ...CCU,
      id: 2,
      rut: '65175242-6',
      razon_social: 'Corporación Centro de Formación Técnica Santo Tomás',
      referencias_exigidas: [],
    };
    const ctx = contexto({
      razones: [cft],
      oc: {
        ...OC_CCU,
        id: 3,
        numero: '32000066941',
        fecha: '2026-10-14',
        rut: '65.175.239-6',
        razon_social: 'Corporación Instituto Profesional Santo Tomás',
        comprador: {
          giro: '853201-ENSEÑANZA SUPERIOR EN INSTITUTOS PROFESIONALES',
          direccion: 'Av. Vicuña Mackenna 4835',
          comuna: 'San Joaquín',
          ciudad: 'Santiago',
        },
      },
    });
    const b = armarBorrador(ctx);
    expect(b.origenes.receptor).toBe('orden_de_compra');
    expect(b.pedida.receptor).toMatchObject({
      rut: '65175239-6',
      razon_social: 'Corporación Instituto Profesional Santo Tomás',
      direccion: 'Av. Vicuña Mackenna 4835',
    });
    expect(b.pedida.referencias).toEqual([
      { tipo: '801', folio: '32000066941', fecha: '2026-10-14' },
    ]);
    const r = revisarFactura(b.pedida, ctx, 1, '2026-11-15');
    expect(r.ok).toBe(false);
    expect(r.problemas).toContain('El giro pasa de 40 caracteres');

    b.pedida.receptor.giro = 'EDUCACION';
    expect(revisarFactura(b.pedida, ctx, 1, '2026-11-15').ok).toBe(true);
  });

  it('con el neto y el IVA de la OC (L17), la factura N° 374 de Santo Tomás cuadra al peso', () => {
    const ctx = contexto({
      oc: {
        ...OC_CCU,
        neto: 2201621,
        iva: 418308,
        total: 2619929,
      },
      totalDeLasOC: 2619929,
      evento: { ...contexto().evento, total: 2619929 },
    });
    const r = revisarFactura(
      { ...armarBorrador(ctx).pedida, referencias: [] },
      ctx,
      374,
      '2026-10-20',
    );
    expect(r.montos).toEqual({
      neto: 2201621,
      exento: 0,
      iva: 418308,
      total: 2619929,
    });
    expect(r.avisos).toEqual([]);
  });

  it('nunca más del 100 % de la OC; si ya se facturó una parte, propone lo que falta', () => {
    const parcial = contexto({ oc: { ...OC_CCU, facturado: 428000 } });
    const b = armarBorrador(parcial);
    expect(b.pedida).toMatchObject({ porcentaje: null, monto: 1000000 });

    const completa = contexto({ oc: { ...OC_CCU, facturado: 1428000 } });
    const r = revisarFactura(
      { ...armarBorrador(completa).pedida, porcentaje: 100, monto: null },
      completa,
      1,
      '2026-11-15',
    );
    expect(r.problemas).toContain(
      'La OC N° 4500918822 ya está facturada completa',
    );

    const deMas = revisarFactura(
      { ...b.pedida, monto: 1100000 },
      parcial,
      1,
      '2026-11-15',
    );
    expect(deMas.problemas).toContain(
      'A la OC N° 4500918822 le quedan $1.000.000 por facturar, y esta factura va por $1.100.000',
    );
  });

  it('si las OC no suman lo de la cotización, se avisa (E1)', () => {
    const ctx = contexto({
      evento: { ...contexto().evento, total: 1500000 },
    });
    const r = revisarFactura(armarBorrador(ctx).pedida, ctx, 1, '2026-11-15');
    expect(r.avisos).toContain(
      'La cotización suma $1.500.000: la factura va por el total de la OC.',
    );
  });

  it('sin OC: la única razón social, el detalle de la cotización y el % del evento (D4)', () => {
    const ctx = contexto({ oc: null, totalDeLasOC: 0 });
    const b = armarBorrador(ctx);
    expect(b.origenes).toEqual({ receptor: 'ficha', detalle: 'cotizacion' });
    expect(b.pedida.orden_de_compra_id).toBeNull();
    expect(b.pedida.detalle.descripcion_larga).toBe(
      'Servicio de paseo fin de año del 06-12-2026, 400 personas, según cotización N° 408',
    );
    expect(Array.from(b.pedida.detalle.descripcion).length).toBeLessThanOrEqual(
      80,
    );
    // CCU pide la OC y no hay: se pregunta.
    expect(b.pedida.referencias.map((r) => r.tipo)).toEqual(['801', '802']);

    const mitad = revisarFactura(
      { ...b.pedida, porcentaje: 50, referencias: [] },
      ctx,
      1,
      '2026-11-15',
    );
    expect(mitad.montos?.total).toBe(714000);
  });

  it('sin OC y con varias razones sociales, la persona elige a cuál', () => {
    const ctx = contexto({
      oc: null,
      razones: [CCU, { ...CCU, id: 9, rut: '76076123-K' }],
    });
    const b = armarBorrador(ctx);
    expect(b.origenes.receptor).toBe('persona');
    expect(b.pedida.receptor.rut).toBe('');
  });
});

describe('La glosa de la línea', () => {
  it('lo que no cabe en 80 caracteres va entero en la descripción larga, sin «…» (latin-1)', () => {
    const texto =
      'Servicio de Catering y arriendo de salon para actividades, Servicio de Catering y Arriendo de Salón, Ciclo de Foros Comerciales Quillon, 2026';
    const d = glosaYDescripcion(texto);
    expect(Array.from(d.descripcion).length).toBeLessThanOrEqual(80);
    expect(d.descripcion.endsWith('...')).toBe(true);
    expect(d.descripcion_larga).toBe(texto);
  });
});
