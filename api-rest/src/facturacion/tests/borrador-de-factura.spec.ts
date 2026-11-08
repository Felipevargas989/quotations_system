import { revisarArchivo } from '../facturacion-cl/simulado';
import {
  armarBorrador,
  glosaYDescripcion,
  revisarDte,
  type ContextoDeLaFactura,
  type OrdenAFacturar,
  type RazonSocialGuardada,
} from '../facturas/borrador';

/**
 * EL BORRADOR DEL DTE (doc 19 §9.2 y §9.20), con los casos del
 * laboratorio: CCU (#408, pide la nota de pedido) y Santo Tomás (#481, dos
 * RUT para un evento). Las líneas llevan la cantidad de personas y el
 * precio con IVA.
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
    // Va todo el evento: las 400 personas por su precio con IVA.
    expect(b.pedida.tipo).toBe(33);
    expect(b.pedida.lineas).toEqual([
      {
        descripcion: 'Paseo fin de año CCU, 400 personas',
        descripcion_larga: null,
        cantidad: 400,
        precio: 3570,
      },
    ]);
    expect(b.pedida.referencias).toEqual([
      { tipo: '801', folio: '4500918822', fecha: '2026-10-01' },
      { tipo: '802', folio: '', fecha: '' },
    ]);
    expect(b.pedida.pedir_siempre).toEqual(['801', '802']);
  });

  it('pregunta la nota de pedido, y con ella el archivo pasa la revisión de facturacion.cl', () => {
    const ctx = contexto();
    const { pedida } = armarBorrador(ctx);
    const sinNota = revisarDte(pedida, ctx, 1235, '2026-11-15');
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
    const lista = revisarDte(pedida, ctx, 1235, '2026-11-15');
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
    const r = revisarDte(b.pedida, ctx, 1, '2026-11-15');
    expect(r.ok).toBe(false);
    expect(r.problemas).toContain('El giro pasa de 40 caracteres');

    b.pedida.receptor.giro = 'EDUCACION';
    expect(revisarDte(b.pedida, ctx, 1, '2026-11-15').ok).toBe(true);
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
    const r = revisarDte(
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
    expect(b.pedida.lineas).toMatchObject([{ cantidad: 1, precio: 1000000 }]);

    const completa = contexto({ oc: { ...OC_CCU, facturado: 1428000 } });
    const r = revisarDte(
      {
        ...armarBorrador(completa).pedida,
        lineas: [{ ...b.pedida.lineas[0], precio: 1428000 }],
      },
      completa,
      1,
      '2026-11-15',
    );
    expect(r.problemas).toContain(
      'La OC N° 4500918822 ya está facturada completa',
    );

    const deMas = revisarDte(
      { ...b.pedida, lineas: [{ ...b.pedida.lineas[0], precio: 1100000 }] },
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
    const r = revisarDte(armarBorrador(ctx).pedida, ctx, 1, '2026-11-15');
    expect(r.avisos).toContain(
      'La cotización suma $1.500.000: la factura va por el total de la OC.',
    );
  });

  it('sin OC: la única razón social, el detalle de la cotización y sus personas (D4)', () => {
    const ctx = contexto({ oc: null, totalDeLasOC: 0 });
    const b = armarBorrador(ctx);
    expect(b.origenes).toEqual({ receptor: 'ficha', detalle: 'cotizacion' });
    expect(b.pedida.orden_de_compra_id).toBeNull();
    // Las personas van en la cantidad, no en el texto.
    expect(b.pedida.lineas).toEqual([
      {
        descripcion:
          'Servicio de paseo fin de año del 06-12-2026, según cotización N° 408',
        descripcion_larga: null,
        cantidad: 400,
        precio: 3570,
      },
    ]);
    // CCU pide la OC y no hay: se pregunta.
    expect(b.pedida.referencias.map((r) => r.tipo)).toEqual(['801', '802']);

    // A mano: la mitad de las personas.
    const mitad = revisarDte(
      {
        ...b.pedida,
        lineas: [{ ...b.pedida.lineas[0], cantidad: 200 }],
        referencias: [],
      },
      ctx,
      1,
      '2026-11-15',
    );
    expect(mitad.montos).toEqual({
      neto: 600000,
      exento: 0,
      iva: 114000,
      total: 714000,
    });
  });

  it('con niños, que tienen su propio precio: una línea por el monto y las personas en el texto', () => {
    const ctx = contexto({
      oc: null,
      evento: { ...contexto().evento, ninos: 20 },
    });
    const [linea] = armarBorrador(ctx).pedida.lineas;
    expect(linea).toMatchObject({ cantidad: 1, precio: 1428000 });
    expect(linea.descripcion_larga).toBe(
      'Servicio de paseo fin de año del 06-12-2026, 400 personas y 20 niños, según cotización N° 408',
    );
  });

  it('el precio con IVA va en neto con seis decimales: 78 menús de $55.000 suman exacto', () => {
    const ctx = contexto({ oc: null, razones: [CCU] });
    const { pedida } = armarBorrador(ctx);
    const r = revisarDte(
      {
        ...pedida,
        lineas: [
          {
            descripcion: 'Menú de matrimonio',
            descripcion_larga: null,
            cantidad: 78,
            precio: 55000,
          },
        ],
        referencias: [],
      },
      ctx,
      1,
      '2026-11-15',
    );
    expect(r.ok).toBe(true);
    expect(r.montos).toEqual({
      neto: 3605042,
      exento: 0,
      iva: 684958,
      total: 4290000,
    });
    expect(r.lineas[0].precio).toBe(46218.487395);
    expect(r.avisos).toEqual([
      'Con esta factura, lo emitido del evento suma $4.290.000 y la cotización $1.428.000.',
    ]);
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

describe('La condición de pago y el motivo de la referencia (§9.22)', () => {
  // La factura de «Nuevo documento»: sin evento ni OC, a un cliente con su
  // razón social completa.
  const sinEvento = contexto({ evento: null, oc: null, razones: [CCU] });
  const pedida = (cambios: Record<string, unknown> = {}) => ({
    tipo: 33 as const,
    orden_de_compra_id: null,
    receptor: {
      rut: CCU.rut,
      razon_social: CCU.razon_social,
      giro: CCU.giro,
      direccion: CCU.direccion,
      comuna: CCU.comuna,
      ciudad: CCU.ciudad,
      correo: null,
    },
    lineas: [
      {
        descripcion: 'Jornada corporativa',
        descripcion_larga: null,
        cantidad: 1,
        precio: 119000,
      },
    ],
    referencias: [] as {
      tipo: string;
      folio: string;
      fecha: string;
      razon?: string | null;
    }[],
    pedir_siempre: [],
    ...cambios,
  });

  it('sin decir nada, crédito a 30 días: la forma de pago y el vencimiento van en el archivo', () => {
    const r = revisarDte(pedida(), sinEvento, 1053, '2026-11-06');
    expect(r.ok).toBe(true);
    expect(r.pago).toEqual({ forma: 2, dias: 30, vencimiento: '2026-12-06' });
    expect(r.archivo).toContain('->FechaVencimiento<-\r\n2026-12-06;');
    // Sin glosa: facturacion.cl rechaza las tildes en TermPagoGlosa (06-11).
    expect(r.archivo).toContain('->FormaPago<-\r\n2;;');
    // El simulado lo lee entero, con sus secciones nuevas.
    expect(revisarArchivo(r.archivo ?? '')).toEqual({
      tipo: 33,
      folio: 1053,
      fecha: '2026-11-06',
    });
  });

  it('a 45 y a 60 días; el vencimiento cuenta desde la emisión', () => {
    expect(
      revisarDte(pedida({ plazo_dias: 45 }), sinEvento, 1, '2026-11-06').pago,
    ).toEqual({ forma: 2, dias: 45, vencimiento: '2026-12-21' });
    expect(
      revisarDte(pedida({ plazo_dias: 60 }), sinEvento, 1, '2026-12-15').pago
        ?.vencimiento,
    ).toBe('2027-02-13');
  });

  it('al contado: forma de pago 1 y sin vencimiento', () => {
    const r = revisarDte(
      pedida({ forma_de_pago: 1, plazo_dias: 30 }),
      sinEvento,
      1,
      '2026-11-06',
    );
    expect(r.pago).toEqual({ forma: 1, dias: null, vencimiento: null });
    expect(r.archivo).toContain('->FormaPago<-\r\n1;;');
    expect(r.archivo).not.toContain('->FechaVencimiento<-');
  });

  it('otro plazo no vale: la ley de pago a 30 días deja 30, 45 o 60', () => {
    const r = revisarDte(
      pedida({ plazo_dias: 90 }),
      sinEvento,
      1,
      '2026-11-06',
    );
    expect(r.ok).toBe(false);
    expect(r.problemas).toContain('El crédito va a 30, 45 o 60 días');
  });

  it('el motivo de la referencia va en el archivo (RazonRef)', () => {
    const r = revisarDte(
      pedida({
        referencias: [
          {
            tipo: '801',
            folio: '4500-112',
            fecha: '2026-11-02',
            razon: 'Paseo de fin de año',
          },
        ],
      }),
      sinEvento,
      1,
      '2026-11-06',
    );
    expect(r.archivo).toContain(
      '->Referencia<-\r\n1;801;4500-112;2026-11-02;0;Paseo de fin de año;',
    );
  });

  it('el descuento de la línea: en %, sobre el neto, con su monto en el archivo (PorcDescto y ValorDescto)', () => {
    const r = revisarDte(
      pedida({
        lineas: [
          {
            descripcion: 'Jornada corporativa',
            descripcion_larga: null,
            cantidad: 1,
            precio: 119000,
            descuento: 10,
          },
        ],
      }),
      sinEvento,
      1,
      '2026-11-06',
    );
    expect(r.ok).toBe(true);
    // $119.000 con IVA = $100.000 neto; el 10 % son $10.000.
    expect(r.montos).toEqual({
      neto: 90000,
      exento: 0,
      iva: 17100,
      total: 107100,
    });
    expect(r.archivo).toContain(
      '1;SERV;Jornada corporativa;1;100000;10;10000;0;0;0;90000;INT1;UN;',
    );
    // Los totales llevan la suma de los descuentos de las líneas
    // (ValorDesctoTot), y el neto ya descontado.
    expect(r.archivo).toContain(
      '->Totales<-\r\n0;10000;0;0;90000;0;19;17100;107100;',
    );
    expect(r.avisos).toEqual([]);
  });

  it('un descuento de 100 % o más no sirve; en la boleta no va', () => {
    const conDescuento = (descuento: number) =>
      pedida({
        lineas: [
          {
            descripcion: 'Jornada corporativa',
            descripcion_larga: null,
            cantidad: 1,
            precio: 119000,
            descuento,
          },
        ],
      });
    expect(
      revisarDte(conDescuento(100), sinEvento, 1, '2026-11-06').problemas,
    ).toContain('El descuento va de 0 a menos de 100 %');
    const boleta = revisarDte(
      { ...conDescuento(10), tipo: 39 },
      sinEvento,
      0,
      '2026-11-06',
    );
    expect(boleta.lineas[0].descuento).toBeUndefined();
    expect(boleta.montos?.total).toBe(119000);
  });

  it('el borrador del evento parte a crédito 30 días; la boleta no lleva condición', () => {
    expect(armarBorrador(contexto()).pedida).toMatchObject({
      forma_de_pago: 2,
      plazo_dias: 30,
    });
    const boleta = armarBorrador(contexto({ oc: null }), 39);
    expect(boleta.pedida.forma_de_pago).toBeNull();
    expect(
      revisarDte(boleta.pedida, contexto({ oc: null }), 0, '2026-11-06').pago,
    ).toBeNull();
  });
});

describe('La boleta del evento', () => {
  it('no va contra la OC ni lleva referencias: sus líneas con IVA y el correo del contacto', () => {
    const ctx = contexto({
      evento: { ...contexto().evento, correo: 'novios@gmail.com' },
    });
    const b = armarBorrador(ctx, 39);
    expect(b.leidoDe).toEqual(['cotización N° 408']);
    expect(b.pedida).toMatchObject({
      tipo: 39,
      orden_de_compra_id: null,
      referencias: [],
      pedir_siempre: [],
      receptor: { rut: '', razon_social: '', correo: 'novios@gmail.com' },
    });
    expect(b.pedida.lineas).toMatchObject([{ cantidad: 400, precio: 3570 }]);

    const r = revisarDte(b.pedida, ctx, 0, '2026-11-15');
    expect(r.ok).toBe(true);
    expect(r.faltan).toEqual([]);
    expect(r.montos).toEqual({
      neto: 1200000,
      exento: 0,
      iva: 228000,
      total: 1428000,
    });
    // Con IVA en la línea, y el folio lo pone facturacion.cl.
    expect(r.lineas[0].precio).toBe(3570);
    expect(r.archivo).toContain('39;0;2026-11-15;3;0;');
    expect(r.archivo).toContain(';400;3570;0;1428000;INT1;UN;');
    expect(revisarArchivo(r.archivo ?? '')).toMatchObject({ tipo: 39 });
  });

  it('sin descripción no sale, y sin RUT ni giro sí', () => {
    const ctx = contexto();
    const { pedida } = armarBorrador(ctx, 39);
    const r = revisarDte(
      { ...pedida, lineas: [{ ...pedida.lineas[0], descripcion: ' ' }] },
      ctx,
      0,
      '2026-11-15',
    );
    expect(r.ok).toBe(false);
    expect(r.faltan).toEqual([{ campo: 'detalle:0', texto: 'la descripción' }]);
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

describe('La factura por una parte: el 50 % y el 30 % (§9.26)', () => {
  // Felipe, 07-11: «el cliente emite OC por todo el monto pero pide
  // facturar un % primero y otro % después (50 % y 50 % es un caso
  // habitual, también puede ser 30 % y 70 %)».
  const OC_TODO: OrdenAFacturar = {
    ...OC_CCU,
    total: 20000000,
    neto: null,
    iva: null,
  };
  const conLaOC = (facturado: number, porcentaje: number | null) =>
    contexto({
      evento: { ...contexto().evento, total: 20000000 },
      oc: { ...OC_TODO, facturado },
      totalDeLasOC: 20000000,
      porcentaje,
    });

  it('el 50 % de la OC, y después lo que queda', () => {
    const primera = armarBorrador(conLaOC(0, 50));
    expect(primera.pedida.lineas).toMatchObject([
      { cantidad: 1, precio: 10000000 },
    ]);
    // La segunda: el otro 50 % es todo lo que queda.
    const segunda = armarBorrador(conLaOC(10000000, null));
    expect(segunda.pedida.lineas).toMatchObject([
      { cantidad: 1, precio: 10000000 },
    ]);
  });

  it('el 30 % y el 70 %; un % que pasa de lo que queda se corta en lo que queda', () => {
    expect(armarBorrador(conLaOC(0, 30)).pedida.lineas).toMatchObject([
      { precio: 6000000 },
    ]);
    expect(armarBorrador(conLaOC(6000000, 70)).pedida.lineas).toMatchObject([
      { precio: 14000000 },
    ]);
    expect(armarBorrador(conLaOC(14000000, 50)).pedida.lineas).toMatchObject([
      { precio: 6000000 },
    ]);
  });

  it('la parcial lo dice en las observaciones; la de la OC entera, no', () => {
    const ctx = conLaOC(0, 50);
    const pedida = { ...armarBorrador(ctx).pedida, referencias: [] };
    const r = revisarDte(pedida, ctx, 1, '2026-11-15');
    expect(r.observaciones).toEqual([
      'Cotización N° 408 · evento 06-12-2026',
      'Factura parcial: 50 % de la OC N° 4500918822',
    ]);
    const entera = conLaOC(0, null);
    const r2 = revisarDte(
      { ...armarBorrador(entera).pedida, referencias: [] },
      entera,
      1,
      '2026-11-15',
    );
    expect(r2.observaciones).toEqual(['Cotización N° 408 · evento 06-12-2026']);
  });

  it('sin OC, el % es de la cotización y las personas van en el texto', () => {
    const ctx = contexto({ oc: null, totalDeLasOC: 0, porcentaje: 30 });
    const b = armarBorrador(ctx);
    // Con las personas no cabe en los 80 de la glosa: el texto entero va
    // en la descripción larga.
    expect(b.pedida.lineas).toEqual([
      {
        descripcion:
          'Servicio de paseo fin de año del 06-12-2026, 400 personas, según cotización...',
        descripcion_larga:
          'Servicio de paseo fin de año del 06-12-2026, 400 personas, según cotización N° 408',
        cantidad: 1,
        precio: 428400,
      },
    ]);
    const r = revisarDte(
      { ...b.pedida, referencias: [] },
      ctx,
      1,
      '2026-11-15',
    );
    expect(r.observaciones[1]).toBe(
      'Factura parcial: 30 % de la cotización N° 408',
    );
  });
});
