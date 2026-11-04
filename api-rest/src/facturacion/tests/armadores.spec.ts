import { armarBoleta } from '../archivo/boleta';
import { armarFactura, type DatosDeFactura } from '../archivo/factura';
import {
  desgloseDelTotal,
  montosDesdeElNeto,
  netoParaElTotal,
  precioNetoDe,
} from '../archivo/montos';
import { numeroDelArchivo, textoLimpio } from '../archivo/texto';
import { revisarArchivo } from '../facturacion-cl/simulado';

/**
 * LOS ARMADORES DEL ARCHIVO DE FACTURACION.CL (doc 19, paso 1b).
 *
 * El caso de la factura es real: la N° 374 de Valle del Sol, del 30-10-2026,
 * al Instituto Profesional Santo Tomás por la OC 32000066941 (evento #481):
 * neto $2.201.621, IVA $418.308 y total $2.619.929. El archivo tiene que
 * salir campo por campo como lo pide archivoplano.php.
 */

const SANTO_TOMAS_IP = {
  rut: '65.175.239-6',
  razon_social: 'Corporación Instituto Profesional Santo Tomás',
  giro: 'Educación',
  direccion: 'Av. Vicuña Mackenna 4835',
  comuna: 'San Joaquín',
  ciudad: 'Santiago',
};

const factura374 = (): DatosDeFactura => ({
  tipo: 33,
  folio: 374,
  fecha: '2026-10-30',
  receptor: SANTO_TOMAS_IP,
  lineas: [{ descripcion: 'Fiesta de navidad', cantidad: 1, precio: 2201621 }],
  referencias: [
    {
      tipo: '801',
      folio: '32000066941',
      fecha: '2026-10-14',
      codigo: 0,
      razon: 'Orden de compra',
    },
  ],
});

const archivoDe = (armado: ReturnType<typeof armarFactura>) => {
  if (!armado.ok) throw new Error(armado.problemas.join(' | '));
  return armado;
};

describe('Los montos (L8 y L17)', () => {
  it('desde el neto, el IVA es el 19 % al peso: la N° 374 de Santo Tomás', () => {
    expect(montosDesdeElNeto(2201621)).toEqual({
      neto: 2201621,
      exento: 0,
      iva: 418308,
      total: 2619929,
    });
  });

  it('un total con IVA que calza al peso', () => {
    expect(netoParaElTotal(11900)).toMatchObject({
      neto: 10000,
      total: 11900,
      diferencia: 0,
    });
  });

  it('un total que no sale exacto desde ningún neto: queda $1 arriba y lo dice', () => {
    expect(netoParaElTotal(11903)).toMatchObject({
      total: 11904,
      diferencia: 1,
    });
  });

  it('78 menús de $55.000 suman exacto $4.290.000, con el precio neto en 6 decimales', () => {
    const armado = archivoDe(
      armarFactura({
        ...factura374(),
        lineas: [
          {
            descripcion: 'Menú adulto',
            cantidad: 78,
            precio: precioNetoDe(55000),
          },
        ],
        totalEsperado: 4290000,
      }),
    );
    expect(armado.montos.total).toBe(4290000);
    expect(armado.avisos).toEqual([]);
    expect(armado.archivo).toContain(
      '1;SERV;Menú adulto;78;46218.487395;0;0;0;0;0;3605042;INT1;UN;;',
    );
  });

  it('el desglose de un total con IVA (la boleta y los PDF de la casa) calza siempre', () => {
    expect(desgloseDelTotal(185000)).toEqual({
      neto: 155462,
      exento: 0,
      iva: 29538,
      total: 185000,
    });
  });
});

describe('La factura (33)', () => {
  it('sale campo por campo como pide el manual', () => {
    const armado = archivoDe(armarFactura(factura374()));
    expect(armado.archivo).toBe(
      [
        '->Encabezado<-',
        '33;374;2026-10-30;0;0;65175239-6;Corporación Instituto Profesional Santo Tomás;Educación;Av. Vicuña Mackenna 4835;San Joaquín;Santiago;;',
        '->Totales<-',
        '0;0;0;0;2201621;0;19;418308;2619929;',
        '->Detalle<-',
        '1;SERV;Fiesta de navidad;1;2201621;0;0;0;0;0;2201621;INT1;UN;;',
        '->Referencia<-',
        '1;801;32000066941;2026-10-14;0;Orden de compra;',
      ].join('\r\n'),
    );
    expect(armado.avisos).toEqual([]);
  });

  it('la OC 801 y la nota de pedido 802 van juntas (CCU)', () => {
    const armado = archivoDe(
      armarFactura({
        ...factura374(),
        referencias: [
          {
            tipo: '801',
            folio: '4500918822',
            fecha: '2026-10-01',
            razon: 'Orden de compra',
          },
          {
            tipo: '802',
            folio: '4505440173',
            fecha: '2026-10-02',
            razon: 'Nota de pedido',
          },
        ],
      }),
    );
    expect(armado.archivo).toContain(
      '->Referencia<-\r\n1;801;4500918822;2026-10-01;0;Orden de compra;\r\n2;802;4505440173;2026-10-02;0;Nota de pedido;',
    );
  });

  it('con vencimiento, forma de pago y observaciones (el N° de la cotización y la fecha del evento)', () => {
    const armado = archivoDe(
      armarFactura({
        ...factura374(),
        vencimiento: '2026-11-29',
        formaDePago: { codigo: 2, glosa: 'Crédito 30 días' },
        observaciones: ['Cotización N° 481', 'Evento del 12-12-2026'],
      }),
    );
    expect(armado.archivo).toContain(
      '->FechaVencimiento<-\r\n2026-11-29;\r\n->FormaPago<-\r\n2;Crédito 30 días;\r\n->Totales<-',
    );
    expect(
      armado.archivo.endsWith(
        '->Observacion<-\r\nCotización N° 481;\r\nEvento del 12-12-2026;',
      ),
    ).toBe(true);
  });

  it('el «;» y los saltos de línea no rompen el archivo', () => {
    const armado = archivoDe(
      armarFactura({
        ...factura374(),
        lineas: [
          { descripcion: 'Almuerzo; once\ny cena', cantidad: 1, precio: 1000 },
        ],
      }),
    );
    expect(armado.archivo).toContain(';Almuerzo, once y cena;');
    expect(textoLimpio('“Fiesta” – Navidad…')).toBe('"Fiesta" - Navidad...');
  });

  it('lo que no cabe se corta y SE AVISA (el giro de la OC de Santo Tomás pasa de 40)', () => {
    const armado = archivoDe(
      armarFactura({
        ...factura374(),
        receptor: {
          ...SANTO_TOMAS_IP,
          giro: '853202-ENSEÑANZA SUPERIOR EN CENTROS DE FORMACION TECNICA',
        },
      }),
    );
    expect(armado.archivo).toContain(
      ';853202-ENSEÑANZA SUPERIOR EN CENTROS DE;',
    );
    expect(armado.avisos).toEqual([
      'El giro no cabe entero (máximo 40 caracteres): queda «853202-ENSEÑANZA SUPERIOR EN CENTROS DE»',
    ]);
  });

  it('si no calza con lo esperado (el total de la OC), avisa antes de emitir', () => {
    const armado = archivoDe(
      armarFactura({ ...factura374(), totalEsperado: 2619930 }),
    );
    expect(armado.avisos).toEqual([
      'La factura queda en $2.619.929 y se esperaba $2.619.930: $1 menos',
    ]);
  });

  it('el SII pide la razón social, el giro, la dirección y la comuna', () => {
    const armado = armarFactura({
      ...factura374(),
      receptor: { rut: '65.175.239-6', razon_social: '' },
    });
    expect(armado).toEqual({
      ok: false,
      problemas: [
        'Falta la razón social del cliente',
        'Falta el giro del cliente',
        'Falta la dirección del cliente',
        'Falta la comuna del cliente',
      ],
    });
  });

  it('un RUT mal escrito no sale', () => {
    const armado = armarFactura({
      ...factura374(),
      receptor: { ...SANTO_TOMAS_IP, rut: '65.175.239-5' },
    });
    expect(armado.ok).toBe(false);
    expect(!armado.ok && armado.problemas[0]).toMatch(
      /^RUT del cliente: El RUT está mal escrito/,
    );
  });

  it('el N° de la OC no se corta: si pasa de 18, no sale', () => {
    const armado = armarFactura({
      ...factura374(),
      referencias: [
        { tipo: '801', folio: '1234567890123456789', fecha: '2026-10-14' },
      ],
    });
    expect(!armado.ok && armado.problemas).toEqual([
      'El N° de la referencia 1 pasa de 18 caracteres y el SII no lo acepta',
    ]);
  });

  it('una factura no anula nada: eso lo hace una nota', () => {
    const armado = armarFactura({
      ...factura374(),
      referencias: [
        { tipo: '33', folio: '370', fecha: '2026-10-01', codigo: 1 },
      ],
    });
    expect(!armado.ok && armado.problemas).toEqual([
      'Una factura no anula ni corrige otro documento: eso lo hace una nota',
    ]);
  });

  it('caben 3 líneas de observaciones de 60', () => {
    const armado = archivoDe(
      armarFactura({ ...factura374(), observaciones: ['a', 'b', 'c', 'd'] }),
    );
    expect(armado.avisos).toEqual([
      'Caben 3 líneas de observaciones: 1 no sale',
    ]);
  });
});

describe('Las notas (61 y 56): el circuito de anulación (doc 19 §9.5)', () => {
  const anulaLa374 = {
    tipo: '33',
    folio: '374',
    fecha: '2026-10-30',
    codigo: 1 as const,
    razon: 'Anula factura',
  };

  it('la nota de crédito que anula la factura: la misma plata y una sola referencia', () => {
    const armado = archivoDe(
      armarFactura({
        ...factura374(),
        tipo: 61,
        folio: 12,
        fecha: '2026-11-04',
        referencias: [anulaLa374],
      }),
    );
    expect(
      armado.archivo.startsWith('->Encabezado<-\r\n61;12;2026-11-04;'),
    ).toBe(true);
    expect(armado.archivo).toContain(
      '->Referencia<-\r\n1;33;374;2026-10-30;1;Anula factura;',
    );
    expect(armado.montos.total).toBe(2619929);
  });

  it('en las notas el SII no exige el giro ni la dirección', () => {
    const armado = armarFactura({
      ...factura374(),
      tipo: 61,
      receptor: {
        rut: '65.175.239-6',
        razon_social: 'Corporación Instituto Profesional Santo Tomás',
      },
      referencias: [anulaLa374],
    });
    expect(armado.ok).toBe(true);
  });

  it('la nota que anula lleva UNA sola referencia (ni la OC al lado)', () => {
    const armado = armarFactura({
      ...factura374(),
      tipo: 61,
      referencias: [
        anulaLa374,
        { tipo: '801', folio: '32000066941', fecha: '2026-10-14' },
      ],
    });
    expect(!armado.ok && armado.problemas).toEqual([
      'La nota de crédito que anula o corrige un texto lleva una sola referencia',
    ]);
  });

  it('una nota sin el documento que modifica no sale', () => {
    const armado = armarFactura({ ...factura374(), tipo: 61 });
    expect(!armado.ok && armado.problemas).toEqual([
      'La nota de crédito referencia un solo documento que modifica (tiene 0)',
    ]);
  });

  it('la que corrige un texto (código 2) va en $0', () => {
    const conPrecio = armarFactura({
      ...factura374(),
      tipo: 61,
      referencias: [{ ...anulaLa374, codigo: 2, razon: 'Corrige el giro' }],
    });
    expect(!conPrecio.ok && conPrecio.problemas).toEqual([
      'La nota que corrige un texto va en $0: sus líneas no llevan precio',
    ]);
    const enCero = archivoDe(
      armarFactura({
        ...factura374(),
        tipo: 61,
        lineas: [
          {
            descripcion: 'Donde dice Educación debe decir Enseñanza superior',
            cantidad: 1,
            precio: 0,
          },
        ],
        referencias: [{ ...anulaLa374, codigo: 2, razon: 'Corrige el giro' }],
      }),
    );
    expect(enCero.montos.total).toBe(0);
  });

  it('la que rebaja una parte (código 3), por lo que se rebaja', () => {
    const armado = archivoDe(
      armarFactura({
        ...factura374(),
        tipo: 61,
        lineas: [
          {
            descripcion: 'Rebaja por 10 personas menos',
            cantidad: 10,
            precio: 38840,
          },
        ],
        referencias: [{ ...anulaLa374, codigo: 3, razon: 'Corrige montos' }],
      }),
    );
    expect(armado.montos).toEqual({
      neto: 388400,
      exento: 0,
      iva: 73796,
      total: 462196,
    });
  });

  it('la nota de débito anula una nota de crédito, y nada más', () => {
    const anulaLaNota = {
      tipo: '61',
      folio: '12',
      fecha: '2026-11-04',
      codigo: 1 as const,
      razon: 'Anula nota de crédito',
    };
    expect(
      armarFactura({ ...factura374(), tipo: 56, referencias: [anulaLaNota] })
        .ok,
    ).toBe(true);
    const contraFactura = armarFactura({
      ...factura374(),
      tipo: 56,
      referencias: [anulaLa374],
    });
    expect(!contraFactura.ok && contraFactura.problemas).toEqual([
      'La nota de débito solo anula una nota de crédito',
    ]);
  });

  it('la factura exenta todavía no se arma (se prueba en el paso 0)', () => {
    const armado = armarFactura({ ...factura374(), tipo: 34 as never });
    expect(armado.ok).toBe(false);
  });
});

describe('La boleta (39): las cabañas', () => {
  const cabanas = {
    fecha: '2026-11-04',
    lineas: [
      {
        descripcion: 'Cabaña 4 personas, temporada baja',
        cantidad: 2,
        precio: 80000,
        unidad: 'NOCH',
      },
      { descripcion: 'Tinaja', cantidad: 1, precio: 25000 },
    ],
  };

  it('sin el RUT del huésped va el auxiliar, folio 0 y las líneas con IVA', () => {
    const armado = armarBoleta(cabanas);
    if (!armado.ok) throw new Error(armado.problemas.join(' | '));
    expect(armado.archivo).toBe(
      [
        '->Boleta<-',
        '39;0;2026-11-04;3;0;;;;66666666-6;;;;;;;;',
        '->BoletaTotales<-',
        ';0;;185000;0;185000;0;185000;',
        '->BoletaDetalle<-',
        '1;SERV;Cabaña 4 personas, temporada baja;0;2;80000;0;160000;INT1;NOCH;;',
        '2;SERV;Tinaja;0;1;25000;0;25000;INT1;UN;;',
      ].join('\r\n'),
    );
    expect(armado.montos).toEqual({
      neto: 155462,
      exento: 0,
      iva: 29538,
      total: 185000,
    });
  });

  it('con el correo del huésped, facturacion.cl se la manda sola', () => {
    const armado = armarBoleta({
      ...cabanas,
      receptor: {
        rut: '7.093.990-8',
        razon_social: 'Avelina Pereira',
        correo: 'Avelina@correo.cl',
      },
    });
    expect(armado.ok && armado.archivo).toContain(
      ';7093990-8;;Avelina Pereira;;;;;avelina@correo.cl;',
    );
  });

  it('un correo que no sirve no sale', () => {
    const armado = armarBoleta({
      ...cabanas,
      receptor: { correo: 'avelina@correo' },
    });
    expect(!armado.ok && armado.problemas).toEqual([
      'El correo «avelina@correo» no es válido',
    ]);
  });

  it('si lo repartido no suma el cobro, avisa (E3)', () => {
    const armado = armarBoleta({ ...cabanas, totalEsperado: 200000 });
    expect(armado.ok && armado.avisos).toEqual([
      'La boleta suma $185.000 y se esperaba $200.000: $15.000 menos',
    ]);
  });
});

describe('Lo que arma Eventia pasa la revisión del archivo', () => {
  it.each([
    ['la factura', () => armarFactura(factura374())],
    [
      'la nota de crédito',
      () =>
        armarFactura({
          ...factura374(),
          tipo: 61,
          referencias: [
            { tipo: '33', folio: '374', fecha: '2026-10-30', codigo: 1 },
          ],
        }),
    ],
    [
      'la boleta',
      () =>
        armarBoleta({
          fecha: '2026-11-04',
          lineas: [{ descripcion: 'Cabaña', cantidad: 1, precio: 100000 }],
        }),
    ],
  ])('%s', (_nombre, armar) => {
    const armado = armar();
    if (!armado.ok) throw new Error(armado.problemas.join(' | '));
    expect(revisarArchivo(armado.archivo)).not.toHaveProperty('error');
  });

  it('los números van con punto decimal y sin ceros de más', () => {
    expect(
      [30.5, 1, 100, 0, 46218.487395].map((n) => numeroDelArchivo(n)),
    ).toEqual(['30.5', '1', '100', '0', '46218.487395']);
  });
});
