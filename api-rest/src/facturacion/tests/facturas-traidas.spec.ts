import { BadRequestException, ConflictException } from '@nestjs/common';
import { deflateSync } from 'node:zlib';
import { mockPinoLogger } from '../../testing/mocks';
import { FacturasTraidasService } from '../facturas-traidas/facturas-traidas.service';
import {
  leerFacturaDelPdf,
  numeroDelPdf,
} from '../facturas-traidas/leer-factura-del-pdf';
import {
  nombreCompletoDelSii,
  numeroDelRut,
} from '../facturas-traidas/nombre-del-sii';
import { codigoPorLosMontos } from '../facturas-traidas/nota-traida';

/**
 * TRAER UNA FACTURA EMITIDA FUERA DE EVENTIA (doc 19 §9.36; Felipe, 08-11:
 * «¿podrás traer estas facturas para hacer las notas de crédito desde
 * acá?»). El PDF con las posiciones de la N° 374 de producción, medidas
 * el 08-11, y datos inventados.
 */

type Texto = [x: number, y: number, texto: string];

const literal = (texto: string) =>
  Array.from(texto)
    .map((c) => {
      const n = c.charCodeAt(0);
      if (c === '(' || c === ')' || c === '\\') return `\\${c}`;
      return n > 127 ? `\\${n.toString(8)}` : c;
    })
    .join('');

/** Un PDF con la forma de los de facturacion.cl (JasperReports + iText). */
const pdfComoFacturacionCl = (textos: Texto[]) => {
  const contenido = textos
    .map(
      ([x, y, t]) =>
        `BT\n1 0 0 1 ${x} ${y} Tm\n/F1 8 Tf\n0 0 0 rg\n(${literal(t)})Tj\n0 g\nET\n`,
    )
    .join('');
  const flujo = deflateSync(Buffer.from(contenido, 'latin1'));
  return Buffer.concat([
    Buffer.from(
      `%PDF-1.4\n5 0 obj\n<</Filter/FlateDecode/Length ${flujo.length}>>stream\n`,
      'latin1',
    ),
    flujo,
    Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1'),
  ]);
};

/** La N° 374 de producción, con otro cliente. */
const LA_374: Texto[] = [
  [446.7, 752.7, 'R.U.T.: 77.701.305-K'],
  [432.8, 718.5, 'FACTURA ELECTRONICA'],
  [479.3, 687.7, 'Nº 374'],
  [436.5, 663.7, 'S.I.I. - REGIONAL CHILLAN'],
  [436.5, 646.7, 'Quillon, 30 de octubre de 2026'],
  [36, 630.6, 'Señor(es)'],
  [85, 630.6, ':'],
  [90, 630.6, 'CORPORACION EJEMPLO DE EDUCACION'],
  [36, 618.6, 'R.U.T.'],
  [85, 618.6, ':'],
  [90, 618.6, '65.123.456-5'],
  [36, 606.6, 'Giro'],
  [85, 606.6, ':'],
  [90, 606.6, 'EDUCACION'],
  [423, 606.6, 'CREDITO'],
  [36, 594.6, 'Dirección'],
  [85, 594.6, ':'],
  [90, 594.6, 'AV. LOS AROMOS 4835'],
  [36, 582.6, 'Comuna'],
  [85, 582.6, ':'],
  [90, 582.6, 'SAN JOAQUIN'],
  [345, 582.6, 'Ciudad'],
  [417, 582.6, ':'],
  [423, 582.6, 'SANTIAGO'],
  [36, 567.6, 'Referencia'],
  [85, 567.6, ':'],
  [90, 567.6, ' en ORDEN DE COMPRA : Nro. 32000066941 del 30-10-2026'],
  [192.1, 535.6, 'Descripción'],
  [375, 535.6, 'Cant.'],
  [412.3, 535.6, 'Precio Unit.'],
  [540.4, 535.6, 'Total'],
  [101, 522.6, 'Fiesta de navidad'],
  [378.2, 522.6, '1,00'],
  [421.1, 522.6, '2.201.621,00'],
  [547.9, 522.6, '2.201.621'],
  [32, 229.7, 'SON: DOS MILLONES SEISCIENTOS DIECINUEVE MIL PESOS.--'],
  [317, 215.6, 'Exento:'],
  [435.6, 215.6, '0'],
  [460, 215.6, 'Neto:'],
  [505, 215.6, '$'],
  [544.4, 215.6, '2.201.621'],
  [457.1, 201.6, '19'],
  [469, 201.6, '% I.V.A.:'],
  [505, 201.6, '$'],
  [551.1, 201.6, '418.308'],
  [460, 186.6, 'Total:'],
  [505, 186.6, '$'],
  [544.4, 186.6, '2.619.929'],
  [319, 118.6, 'Observaciones:'],
  [33, 23.6, 'Documento creado por www.facturacion.cl'],
];

/** Una nota de crédito con las posiciones de la NC N° 115 de producción
 *  (08-11), que anula la 374 de arriba. Datos inventados. */
const LA_NC_113: Texto[] = [
  [446.7, 752.7, 'R.U.T.: 77.701.305-K'],
  [448.1, 724.4, 'NOTA DE CREDITOELECTRONICA'],
  [479.3, 687.7, 'Nº 113'],
  [436.5, 663.6, 'S.I.I. - REGIONAL CHILLAN'],
  [422.6, 646.7, 'Quillon, 30 de octubre de 2026'],
  ...LA_374.filter(([, y]) => y <= 630.6 && y >= 582.6),
  [36, 567.6, 'Referencia'],
  [85, 567.6, ':'],
  [
    90,
    567.6,
    'Error en el giro en FACTURA ELECTRONICA : Nro. 374 del 30-10-2026',
  ],
  ...LA_374.filter(([, y]) => y <= 535.6),
];

const con = (cambios: Record<string, string>, agregar: Texto[] = []) =>
  pdfComoFacturacionCl([
    ...LA_374.map(([x, y, t]): Texto => [x, y, cambios[t] ?? t]),
    ...agregar,
  ]);

describe('La factura emitida fuera de Eventia, leída de su PDF (§9.36)', () => {
  it('la N° 374: el cliente sin la condición de pago, la OC, la línea y los totales', () => {
    const r = leerFacturaDelPdf(pdfComoFacturacionCl(LA_374));
    expect(r).toEqual({
      ok: true,
      factura: {
        folio: 374,
        fecha_emision: '2026-10-30',
        receptor: {
          rut: '65123456-5',
          razon_social: 'CORPORACION EJEMPLO DE EDUCACION',
          // «CREDITO» va en la misma fila, a la derecha: no es del giro.
          giro: 'EDUCACION',
          direccion: 'AV. LOS AROMOS 4835',
          comuna: 'SAN JOAQUIN',
          ciudad: 'SANTIAGO',
        },
        forma_de_pago: 2,
        vencimiento: null,
        referencias: [
          { tipo: '801', folio: '32000066941', fecha: '2026-10-30' },
        ],
        lineas: [
          {
            descripcion: 'Fiesta de navidad',
            descripcionLarga: null,
            cantidad: 1,
            precio: 2201621,
          },
        ],
        exento: 0,
        neto: 2201621,
        iva: 418308,
        total: 2619929,
      },
    });
  });

  it('el precio con decimales, la descripción larga y el vencimiento a la derecha del RUT', () => {
    const r = leerFacturaDelPdf(
      con(
        {
          '2.201.621,00': '2.357.797,80',
          '2.201.621': '2.357.798',
          '418.308': '447.982',
          '2.619.929': '2.805.780',
        },
        [
          [101, 512.6, 'para 78 adultos y 32 niños'],
          [423, 618.6, '08/12/2026'],
        ],
      ),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.factura.receptor.rut).toBe('65123456-5');
    expect(r.factura.vencimiento).toBe('2026-12-08');
    expect(r.factura.lineas).toEqual([
      {
        descripcion: 'Fiesta de navidad',
        descripcionLarga: 'para 78 adultos y 32 niños',
        cantidad: 1,
        precio: 2357797.8,
      },
    ]);
    expect(r.factura).toMatchObject({ neto: 2357798, total: 2805780 });
  });

  it('lo que no cuadra no se trae: un IVA que no suma el total', () => {
    expect(leerFacturaDelPdf(con({ '418.308': '418.000' }))).toEqual({
      ok: false,
      motivo: 'El neto y el IVA no suman el total',
    });
  });

  it('lo que no es una factura de facturacion.cl tampoco', () => {
    expect(
      leerFacturaDelPdf(
        pdfComoFacturacionCl([[100, 700, 'BOLETA ELECTRONICA']]),
      ),
    ).toEqual({ ok: false, motivo: 'No es una factura electrónica' });
    expect(leerFacturaDelPdf(Buffer.from('no es un pdf'))).toMatchObject({
      ok: false,
    });
  });

  it('los números como los imprime: con puntos de miles y coma decimal', () => {
    expect(numeroDelPdf('2.201.621,00')).toBe(2201621);
    expect(numeroDelPdf('$ 418.308')).toBe(418308);
    expect(numeroDelPdf('1,00')).toBe(1);
    expect(numeroDelPdf('19')).toBe(19);
    expect(numeroDelPdf('EDUCACION')).toBeNull();
  });
});

describe('La nota de crédito emitida fuera de Eventia, leída de su PDF (§9.36)', () => {
  it('con la plantilla de la NC N° 115: el documento que modifica y la razón, aunque diga «en»', () => {
    const r = leerFacturaDelPdf(pdfComoFacturacionCl(LA_NC_113), 61);
    if (!r.ok) throw new Error(r.motivo);
    expect(r.factura).toMatchObject({
      folio: 113,
      fecha_emision: '2026-10-30',
      total: 2619929,
      referencias: [
        {
          tipo: '33',
          folio: '374',
          fecha: '2026-10-30',
          razon: 'Error en el giro',
        },
      ],
    });
  });

  it('la factura no se lee como nota, ni la nota como factura', () => {
    expect(leerFacturaDelPdf(pdfComoFacturacionCl(LA_374), 61)).toEqual({
      ok: false,
      motivo: 'No es una nota de crédito electrónica',
    });
    expect(leerFacturaDelPdf(pdfComoFacturacionCl(LA_NC_113))).toEqual({
      ok: false,
      motivo: 'No es una factura electrónica',
    });
  });

  it('el código sale de los montos: por el total anula, en cero corrige, por menos rebaja', () => {
    expect(codigoPorLosMontos(100, 100)).toBe(1);
    expect(codigoPorLosMontos(0, 100)).toBe(2);
    expect(codigoPorLosMontos(40, 100)).toBe(3);
    expect(codigoPorLosMontos(120, 100)).toBeNull();
  });
});

describe('Traerla a Eventia (§9.36)', () => {
  const USUARIO = {
    id: 'u-felipe',
    company_id: 1,
    role: 'administrador',
  } as never;
  const OC = {
    id: 5,
    numero: '32000066941',
    quotation_id: 'ev-481',
    cotizacion: 481,
  };
  const armar = ({
    ambiente = 'produccion',
    pdf = pdfComoFacturacionCl(LA_374) as Buffer | null,
    yaEsta = false,
    subido = null as string | null,
    delSii = null as string | null,
    original = null as Record<string, unknown> | null,
  } = {}) => {
    const obtenerPdf = jest.fn().mockResolvedValue(pdf);
    const repo = {
      yaEsta: jest.fn().mockResolvedValue(yaEsta),
      ocPorNumero: jest.fn().mockResolvedValue(OC),
      pdfSubidoAlEvento: jest.fn().mockResolvedValue(subido),
      documentoPorFolio: jest.fn().mockResolvedValue(original),
      guardar: jest
        .fn()
        .mockImplementation((f: Record<string, unknown>) =>
          Promise.resolve({ id: 90, ...f }),
        ),
    };
    const documentos = { guardarPdf: jest.fn().mockResolvedValue(undefined) };
    const nomina = {
      contribuyente: jest
        .fn()
        .mockResolvedValue(delSii ? { razon_social: delSii } : null),
    };
    const servicio = new FacturasTraidasService(
      repo as never,
      documentos as never,
      { de: () => ({ ambiente, obtenerPdf }) } as never,
      nomina as never,
      mockPinoLogger() as never,
    );
    return { servicio, repo, documentos, obtenerPdf, nomina };
  };

  it('sin guardar, solo la lee: con su evento, por la OC', async () => {
    const { servicio, repo, obtenerPdf } = armar();
    const r = await servicio.traer(USUARIO, 374, false);
    expect(obtenerPdf).toHaveBeenCalledWith(33, 374);
    expect(r.guardada).toBeNull();
    expect(r.factura).toMatchObject({
      folio: 374,
      total: 2619929,
      evento: { cotizacion: 481, oc: '32000066941' },
    });
    expect(repo.guardar).not.toHaveBeenCalled();
  });

  it('al guardarla queda emitida en su evento, con el PDF que ya estaba subido', async () => {
    const subido = 'c1/event-documents/ev-481/facturas/2026-10-23_F374.pdf';
    const { servicio, repo, documentos } = armar({ subido });
    await servicio.traer(USUARIO, 374, true);
    expect(documentos.guardarPdf).not.toHaveBeenCalled();
    expect(repo.guardar).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 1,
        tipo: 33,
        ambiente: 'produccion',
        estado: 'emitido',
        folio: 374,
        fecha_emision: '2026-10-30',
        quotation_id: 'ev-481',
        orden_de_compra_id: 5,
        neto: 2201621,
        iva: 418308,
        total: 2619929,
        pdf_path: subido,
        // Crédito sin vencimiento: no se adivina la condición.
        forma_de_pago: null,
        respuesta: { traida: true, de: 'facturacion.cl' },
        detalle: [
          {
            descripcion: 'Fiesta de navidad',
            descripcionLarga: null,
            cantidad: 1,
            precio: 2201621,
          },
        ],
      }),
    );
  });

  it('sin PDF subido, guarda su copia en el evento, con el nombre de §9.35', async () => {
    const { servicio, documentos, repo } = armar();
    await servicio.traer(USUARIO, 374, true);
    const ruta =
      'c1/event-documents/ev-481/facturas/F374_CORPORACION_EJEMPLO_DE_EDUCACION_481_32000066941.pdf';
    expect(documentos.guardarPdf).toHaveBeenCalledWith(
      ruta,
      expect.any(Buffer),
    );
    expect(repo.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ pdf_path: ruta }),
    );
  });

  it('el nombre que facturacion.cl cortó en su PDF va completo con el del SII, y el del PDF queda anotado', async () => {
    const { servicio, repo, nomina } = armar({
      delSii: 'CORPORACION EJEMPLO DE EDUCACION SUPERIOR',
    });
    const leida = await servicio.traer(USUARIO, 374, false);
    expect(leida.factura.receptor.razon_social).toBe(
      'CORPORACION EJEMPLO DE EDUCACION SUPERIOR',
    );
    expect(leida.factura.nombre_del_sii).toBe(true);
    await servicio.traer(USUARIO, 374, true);
    expect(repo.guardar).toHaveBeenCalledWith(
      expect.objectContaining({
        receptor: expect.objectContaining({
          razon_social: 'CORPORACION EJEMPLO DE EDUCACION SUPERIOR',
        }),
        respuesta: {
          traida: true,
          de: 'facturacion.cl',
          razon_social_del_pdf: 'CORPORACION EJEMPLO DE EDUCACION',
        },
      }),
    );
    expect(nomina.contribuyente).toHaveBeenCalledWith(expect.any(Number));
  });

  it('si el SII dice otro nombre, o no lo tiene, queda el del PDF', async () => {
    for (const delSii of ['OTRA EMPRESA DISTINTA', null]) {
      const { servicio } = armar({ delSii });
      const r = await servicio.traer(USUARIO, 374, false);
      expect(r.factura.receptor.razon_social).toBe(
        'CORPORACION EJEMPLO DE EDUCACION',
      );
      expect(r.factura.nombre_del_sii).toBe(false);
    }
  });

  const LA_374_EN_EVENTIA = {
    id: 7,
    tipo: 33,
    folio: 374,
    total: 2619929,
    razon_social: 'CORPORACION EJEMPLO DE EDUCACION',
    quotation_id: 'ev-481',
    orden_de_compra_id: 5,
    cotizacion: 481,
    oc: '32000066941',
  };

  it('la nota de crédito: lo que modifica y cómo, con el evento de su factura', async () => {
    const { servicio, repo, obtenerPdf } = armar({
      pdf: pdfComoFacturacionCl(LA_NC_113),
      original: LA_374_EN_EVENTIA,
    });
    const r = await servicio.traer(USUARIO, 113, false, 61);
    expect(obtenerPdf).toHaveBeenCalledWith(61, 113);
    expect(repo.documentoPorFolio).toHaveBeenCalledWith(
      1,
      33,
      374,
      'produccion',
    );
    expect(r.factura).toMatchObject({
      tipo: 61,
      folio: 113,
      evento: { cotizacion: 481, oc: '32000066941' },
      modifica: {
        tipo: '33',
        folio: '374',
        fecha: '2026-10-30',
        que_hace: 'anula',
      },
    });
    expect(repo.ocPorNumero).not.toHaveBeenCalled();
  });

  it('al guardarla entra a la cadena: anula su factura, en su evento y su OC', async () => {
    const { servicio, repo, documentos } = armar({
      pdf: pdfComoFacturacionCl(LA_NC_113),
      original: LA_374_EN_EVENTIA,
    });
    await servicio.traer(USUARIO, 113, true, 61);
    const ruta =
      'c1/event-documents/ev-481/facturas/NC113_CORPORACION_EJEMPLO_DE_EDUCACION_481_32000066941.pdf';
    expect(documentos.guardarPdf).toHaveBeenCalledWith(
      ruta,
      expect.any(Buffer),
    );
    expect(repo.pdfSubidoAlEvento).not.toHaveBeenCalled();
    expect(repo.guardar).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 61,
        folio: 113,
        estado: 'emitido',
        modifica_id: 7,
        codigo_referencia: 1,
        quotation_id: 'ev-481',
        orden_de_compra_id: 5,
        forma_de_pago: null,
        vencimiento: null,
        pdf_path: ruta,
        referencias: [
          {
            tipo: '33',
            folio: '374',
            fecha: '2026-10-30',
            razon: 'Error en el giro',
            codigo: 1,
          },
        ],
        respuesta: {
          traida: true,
          de: 'facturacion.cl',
          codigo_por_los_montos: true,
        },
      }),
    );
  });

  it('una nota por menos rebaja; si su factura no está en Eventia, primero hay que traerla', async () => {
    const rebaja = await armar({
      pdf: pdfComoFacturacionCl(LA_NC_113),
      original: { ...LA_374_EN_EVENTIA, total: 3000000 },
    }).servicio.traer(USUARIO, 113, false, 61);
    expect(rebaja.factura.modifica?.que_hace).toBe('rebaja');
    await expect(
      armar({ pdf: pdfComoFacturacionCl(LA_NC_113) }).servicio.traer(
        USUARIO,
        113,
        false,
        61,
      ),
    ).rejects.toThrow(
      'La nota de crédito N° 113 modifica la factura N° 374, que no está en Eventia: tráela primero',
    );
    await expect(
      armar({
        pdf: pdfComoFacturacionCl(LA_NC_113),
        original: { ...LA_374_EN_EVENTIA, total: 100 },
      }).servicio.traer(USUARIO, 113, false, 61),
    ).rejects.toThrow(
      'La nota de crédito N° 113 es por más que la factura N° 374',
    );
  });

  it('la que ya está en Eventia no se trae dos veces', async () => {
    const { servicio, obtenerPdf } = armar({ yaEsta: true });
    await expect(servicio.traer(USUARIO, 374, true)).rejects.toThrow(
      new ConflictException('La factura N° 374 ya está en Eventia'),
    );
    expect(obtenerPdf).not.toHaveBeenCalled();
  });

  it('si facturacion.cl no tiene el PDF, o el PDF es de otro N°, lo dice', async () => {
    await expect(
      armar({ pdf: null }).servicio.traer(USUARIO, 374, false),
    ).rejects.toThrow('facturacion.cl no tiene el PDF de la factura N° 374');
    await expect(armar().servicio.traer(USUARIO, 375, false)).rejects.toThrow(
      'El PDF es de la factura N° 374, no de la 375',
    );
  });

  it('en el modo simulado no hay nada que traer', async () => {
    await expect(
      armar({ ambiente: 'simulado' }).servicio.traer(USUARIO, 374, false),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('El nombre que facturacion.cl corta (§9.36)', () => {
  it('la N° 375: el SII sigue con las palabras del PDF, vale el del SII', () => {
    expect(
      nombreCompletoDelSii(
        'CORPORACION CENTRO DE FORMACION TECNICA SANTO',
        'CORPORACION CENTRO DE FORMACION TECNICA SANTO TOMAS',
      ),
    ).toBe('CORPORACION CENTRO DE FORMACION TECNICA SANTO TOMAS');
  });

  it('sin importar tildes, mayúsculas ni espacios de más', () => {
    expect(
      nombreCompletoDelSii(
        'Sociedad  Gastronómica',
        'SOCIEDAD GASTRONOMICA DEL SUR',
      ),
    ).toBe('SOCIEDAD GASTRONOMICA DEL SUR');
  });

  it('el mismo nombre, otro nombre o una palabra a medias: nulo, queda el del PDF', () => {
    expect(nombreCompletoDelSii('EMPRESA UNO', 'EMPRESA UNO')).toBeNull();
    expect(
      nombreCompletoDelSii('EMPRESA UNO', 'OTRA EMPRESA UNO SPA'),
    ).toBeNull();
    expect(nombreCompletoDelSii('EMPRESA UN', 'EMPRESA UNO SPA')).toBeNull();
    expect(nombreCompletoDelSii('EMPRESA UNO', null)).toBeNull();
  });

  it('el RUT como lo guarda la nómina', () => {
    expect(numeroDelRut('65175242-6')).toBe(65175242);
    expect(numeroDelRut('')).toBeNull();
  });
});
