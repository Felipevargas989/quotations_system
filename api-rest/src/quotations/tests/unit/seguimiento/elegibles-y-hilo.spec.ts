import {
  compromisoVivo,
  esCorreoUtil,
  fechaEnChile,
  type NotaDeBitacora,
  porQueNoEntra,
} from '../../../seguimiento/elegibles';
import { notaDelEnvio, proximoTrasElEnvio } from '../../../seguimiento/envio';
import {
  copiasDelHilo,
  decidirHilo,
  hiloDeLaCotizacion,
  otroEnvioEnElHilo,
  seguimientosSinRespuesta,
} from '../../../seguimiento/hilo';
import type { MensajeDelBuzon } from '../../../seguimiento/outlook';
import {
  BUZON_DE_ENSAYO,
  BUZONES_DE_LA_CASA,
  buzonesDelEntorno,
} from '../../../seguimiento/seguimiento.service';

// Qué cotizaciones entran al seguimiento con IA y dónde queda el borrador
// (doc 18, secciones 2 y 3). Datos de prueba, no de clientes reales.

const nota = (n: Partial<NotaDeBitacora> = {}): NotaDeBitacora => ({
  created_at: '2026-10-11T13:40:00+00:00',
  tipo: 'correo',
  note: 'Seguimiento por correo',
  next_contact_date: null,
  next_contact_done_at: null,
  ...n,
});

describe('qué cotizaciones entran (doc 18 §2)', () => {
  const hoy = '2026-10-17';

  it('enviada, con el próximo contacto por correo vencido: entra (el caso de la 607)', () => {
    expect(
      porQueNoEntra(
        'enviada',
        [nota({ next_contact_date: '2026-10-15' })],
        hoy,
      ),
    ).toBeNull();
    expect(
      porQueNoEntra(
        'en_negociacion',
        [nota({ next_contact_date: '2026-10-06' })],
        hoy,
      ),
    ).toBeNull();
  });

  it('una solicitada nunca salió: no es seguimiento', () => {
    expect(
      porQueNoEntra(
        'solicitada',
        [nota({ next_contact_date: '2026-10-15' })],
        hoy,
      ),
    ).toContain('enviadas y en negociación');
  });

  it('sin próximo contacto, o con uno que todavía no vence, no entra', () => {
    expect(porQueNoEntra('enviada', [nota()], hoy)).toBe(
      'no tiene próximo contacto.',
    );
    expect(
      porQueNoEntra(
        'enviada',
        [nota({ next_contact_date: '2026-10-17' })],
        hoy,
      ),
    ).toBe('su próximo contacto es el 17-10: todavía no vence.');
  });

  it('manda el botoncito de la nota: por WhatsApp o llamada no entra', () => {
    expect(
      porQueNoEntra(
        'enviada',
        [nota({ tipo: 'whatsapp', next_contact_date: '2026-10-15' })],
        hoy,
      ),
    ).toBe('su próximo contacto es por whatsapp, no por correo.');
  });

  it('el compromiso es la nota más reciente con fecha y sin cumplir', () => {
    const vieja = nota({
      created_at: '2026-10-01T10:00:00+00:00',
      tipo: 'whatsapp',
      next_contact_date: '2026-10-05',
    });
    const vigente = nota({
      created_at: '2026-10-10T10:00:00+00:00',
      next_contact_date: '2026-10-15',
    });
    const cumplida = nota({
      created_at: '2026-10-12T10:00:00+00:00',
      next_contact_date: '2026-10-14',
      next_contact_done_at: '2026-10-14T12:00:00+00:00',
    });
    const sinFecha = nota({ created_at: '2026-10-13T10:00:00+00:00' });
    expect(compromisoVivo([vieja, vigente, cumplida, sinFecha])).toBe(vigente);
  });

  it('los correos de relleno no sirven para escribirle al cliente', () => {
    expect(esCorreoUtil('cliente@ejemplo.cl')).toBe(true);
    expect(esCorreoUtil('noindica@gmail.com')).toBe(false);
    expect(esCorreoUtil('sincorreo@valle.cl')).toBe(false);
    expect(esCorreoUtil('sin correo')).toBe(false);
    expect(esCorreoUtil(null)).toBe(false);
  });

  it('el día de hoy es el de Chile', () => {
    // Las 23:00 del 17-10 en Chile (UTC−3) ya son el 18-10 en UTC.
    expect(fechaEnChile(new Date('2026-10-18T02:00:00Z'))).toBe('2026-10-17');
  });
});

const casa = (c: string) =>
  /@(valledelsolquillon\.cl|eventi-app\.com)$/.test(c);
const CONTACTO = 'contacto@valledelsolquillon.cl';
const FELIPE = 'felipe@valledelsolquillon.cl';

const mensaje = (m: Partial<MensajeDelBuzon> = {}): MensajeDelBuzon => ({
  id: 'm1',
  hilo: 'h1',
  de: 'hola@eventi-app.com',
  para: ['cliente@ejemplo.cl'],
  cc: [],
  asunto: 'Cotización N° 607',
  fecha: '2026-10-11T13:34:00Z',
  borrador: false,
  adelanto: '',
  ...m,
});

describe('dónde queda el borrador (doc 18 §3)', () => {
  const base = {
    esDeLaCasa: casa,
    esDeEventia: (c: string) => c.endsWith('@eventi-app.com'),
    ultimaGestion: '2026-10-11T13:40:00+00:00',
    buzonParaNuevo: CONTACTO,
    numero: 607,
    creada: '2026-10-11T13:00:00+00:00',
  };

  it('el último correo es el envío de Eventia (copia oculta en contacto@): seguimiento al cliente', () => {
    const d = decidirHilo({
      ...base,
      encontrados: [{ buzon: CONTACTO, mensajes: [mensaje()] }],
    });
    expect(d).toMatchObject({
      modo: 'seguimiento',
      buzon: CONTACTO,
      mensaje: { id: 'm1' },
    });
  });

  it('sin hilo en ningún buzón: correo nuevo en contacto@', () => {
    expect(
      decidirHilo({
        ...base,
        encontrados: [
          { buzon: CONTACTO, mensajes: [] },
          { buzon: FELIPE, mensajes: [] },
        ],
      }),
    ).toEqual({ modo: 'nuevo', buzon: CONTACTO });
  });

  it('gana el primer buzón que tenga el hilo de la cotización', () => {
    const d = decidirHilo({
      ...base,
      encontrados: [
        { buzon: CONTACTO, mensajes: [] },
        { buzon: FELIPE, mensajes: [mensaje({ id: 'f1', de: FELIPE })] },
      ],
    });
    expect(d).toMatchObject({ modo: 'seguimiento', buzon: FELIPE });
  });

  it('el hilo es la conversación del correo más nuevo', () => {
    const d = decidirHilo({
      ...base,
      encontrados: [
        {
          buzon: CONTACTO,
          mensajes: [
            mensaje({
              id: 'viejo',
              hilo: 'h-viejo',
              fecha: '2026-08-01T10:00:00Z',
            }),
            mensaje({
              id: 'nuevo',
              hilo: 'h-nuevo',
              fecha: '2026-10-11T10:00:00Z',
            }),
          ],
        },
      ],
    });
    expect(d).toMatchObject({ modo: 'seguimiento', mensaje: { id: 'nuevo' } });
  });

  it('un hilo que ya tiene un borrador no se toca', () => {
    const d = decidirHilo({
      ...base,
      encontrados: [
        {
          buzon: CONTACTO,
          mensajes: [
            mensaje(),
            mensaje({
              id: 'b1',
              borrador: true,
              fecha: '2026-10-16T10:00:00Z',
            }),
          ],
        },
      ],
    });
    expect(d).toEqual({
      modo: 'saltar',
      motivo: `ya hay un borrador en el hilo de ${CONTACTO}.`,
    });
  });

  it('el cliente escribió después de la última gestión: requiere respuesta, no seguimiento', () => {
    const d = decidirHilo({
      ...base,
      encontrados: [
        {
          buzon: CONTACTO,
          mensajes: [
            mensaje(),
            mensaje({
              id: 'c1',
              de: 'cliente@ejemplo.cl',
              para: [CONTACTO],
              asunto: 'RE: Cotización N° 607',
              fecha: '2026-10-16T15:00:00Z',
            }),
          ],
        },
      ],
    });
    expect(d).toEqual({
      modo: 'saltar',
      motivo:
        'el cliente escribió el 16-10 («RE: Cotización N° 607») después de la última gestión: requiere tu respuesta.',
    });
  });

  it('el cliente escribió antes de la última gestión: se le responde a todos en su hilo', () => {
    const d = decidirHilo({
      ...base,
      ultimaGestion: '2026-10-12T09:00:00+00:00',
      encontrados: [
        {
          buzon: CONTACTO,
          mensajes: [
            mensaje(),
            mensaje({
              id: 'c1',
              de: 'cliente@ejemplo.cl',
              fecha: '2026-10-11T20:00:00Z',
            }),
          ],
        },
      ],
    });
    expect(d).toMatchObject({ modo: 'responder', mensaje: { id: 'c1' } });
  });

  // Felipe, 18-10: "que prefiera el hilo de la cotización siempre".
  it('un hilo de factura no es el de la cotización: correo nuevo (la 493 del 17-10)', () => {
    const d = decidirHilo({
      ...base,
      encontrados: [
        {
          buzon: CONTACTO,
          mensajes: [
            mensaje({
              asunto: 'Factura N°347 evento OC 5040-126-TD26',
              fecha: '2026-10-16T10:00:00Z',
            }),
          ],
        },
      ],
    });
    expect(d).toEqual({ modo: 'nuevo', buzon: CONTACTO });
  });

  it('el hilo de OTRA cotización no sirve (la 508: su único hilo era el de la #535)', () => {
    const d = decidirHilo({
      ...base,
      encontrados: [
        {
          buzon: CONTACTO,
          mensajes: [
            mensaje({
              asunto: 'RE: Nueva cotización web #535 de Cotiza tu evento',
              fecha: '2026-10-16T10:00:00Z',
            }),
          ],
        },
      ],
    });
    expect(d).toEqual({ modo: 'nuevo', buzon: CONTACTO });
  });

  it('si contacto@ no tiene el hilo de la cotización, sirve el de felipe@', () => {
    const d = decidirHilo({
      ...base,
      encontrados: [
        {
          buzon: CONTACTO,
          mensajes: [mensaje({ asunto: 'Factura N°347', hilo: 'h-factura' })],
        },
        {
          buzon: FELIPE,
          mensajes: [
            mensaje({ id: 'f1', de: FELIPE, asunto: 'RE: Cotización paseo' }),
          ],
        },
      ],
    });
    expect(d).toMatchObject({
      modo: 'seguimiento',
      buzon: FELIPE,
      mensaje: { id: 'f1' },
    });
  });

  it('el hilo con el N° de la cotización gana a uno más nuevo que solo dice cotización', () => {
    const hilo = hiloDeLaCotizacion({
      mensajes: [
        mensaje({
          id: 'con-numero',
          hilo: 'h1',
          fecha: '2026-10-11T13:34:00Z',
        }),
        mensaje({
          id: 'generico',
          hilo: 'h2',
          asunto: 'RE: Cotización paseo',
          fecha: '2026-10-15T10:00:00Z',
        }),
      ],
      numero: 607,
      creada: base.creada,
      esDeEventia: base.esDeEventia,
    });
    expect(hilo?.map((m) => m.id)).toEqual(['con-numero']);
  });

  it('un hilo de cotización que quedó antes de crear esta es de otra (la del año pasado)', () => {
    expect(
      hiloDeLaCotizacion({
        mensajes: [
          mensaje({
            asunto: 'RE: Cotización paseo 2025',
            de: CONTACTO,
            fecha: '2025-11-20T10:00:00Z',
          }),
        ],
        numero: 607,
        creada: base.creada,
        esDeEventia: base.esDeEventia,
      }),
    ).toBeNull();
  });

  it('el correo de «Enviar cotización» de Eventia marca el hilo aunque el asunto no diga cotización', () => {
    const hilo = hiloDeLaCotizacion({
      mensajes: [
        mensaje({ asunto: 'Paseo fin de año', fecha: '2026-10-12T10:00:00Z' }),
      ],
      numero: 607,
      creada: base.creada,
      esDeEventia: base.esDeEventia,
    });
    expect(hilo).toHaveLength(1);
  });

  it('las copias del seguimiento: las del último correo, sin la casa ni el cliente', () => {
    expect(
      copiasDelHilo(
        mensaje({
          para: ['cliente@ejemplo.cl', CONTACTO],
          cc: ['jefa@ejemplo.cl', FELIPE],
        }),
        ['cliente@ejemplo.cl'],
        casa,
      ),
    ).toEqual(['jefa@ejemplo.cl']);
  });
});

describe('qué buzones toca cada motor', () => {
  it('solo el motor de producción toca los de la casa; los demás, el de ensayo', () => {
    expect(buzonesDelEntorno({ RAILWAY_SERVICE_NAME: 'api-rest' })).toEqual(
      BUZONES_DE_LA_CASA,
    );
    expect(
      buzonesDelEntorno({ RAILWAY_SERVICE_NAME: 'api-rest-pruebas' }),
    ).toEqual([BUZON_DE_ENSAYO]);
    expect(
      buzonesDelEntorno({
        RAILWAY_SERVICE_NAME: 'api-rest',
        EMAILS_SILENCED: '1',
      }),
    ).toEqual([BUZON_DE_ENSAYO]);
    expect(buzonesDelEntorno({})).toEqual([BUZON_DE_ENSAYO]);
  });
});

describe('cuando el borrador sale (doc 18 §9)', () => {
  // Las formas de hilos reales medidos el 17-10, con datos de prueba.
  const CASA = 'contacto@valledelsolquillon.cl';
  const X500 =
    '/o=exchangelabs/ou=exchange administrative group (fydibohf23spdlt)/cn=recipients/cn=contacto';
  const m = (
    de: string,
    fecha: string,
    extra: Partial<MensajeDelBuzon> = {},
  ): MensajeDelBuzon => ({
    id: `${de}-${fecha}`,
    hilo: 'h',
    de,
    para: [],
    cc: [],
    asunto: 'RE: Cotización',
    fecha,
    borrador: false,
    adelanto: '',
    ...extra,
  });
  const casa = {
    esDeLaCasa: (c: string) =>
      c.startsWith('/o=') ||
      /@(valledelsolquillon\.cl|eventi-app\.com)$/.test(c),
    esDeEventia: (c: string) => c.endsWith('@eventi-app.com'),
  };

  it('dos seguimientos después de lo último que dijo el cliente: van 2 (la forma de la 477)', () => {
    const hilo = [
      m('cliente@ejemplo.cl', '2026-08-13T19:27:00Z'),
      m(CASA, '2026-09-01T20:25:00Z', { adjuntos: true }),
      m('cliente@ejemplo.cl', '2026-09-01T21:20:00Z'),
      m(CASA, '2026-09-23T15:28:00Z'),
      m(CASA, '2026-10-17T20:51:00Z'),
    ];
    expect(seguimientosSinRespuesta({ mensajes: hilo, ...casa })).toBe(2);
  });

  it('lo que va antes de la cotización no cuenta: el ancla es el envío con el PDF (la forma de la 578)', () => {
    const hilo = [
      m('cliente@ejemplo.cl', '2026-10-02T12:30:00Z'),
      m(CASA, '2026-10-05T16:15:00Z'),
      m(CASA, '2026-10-11T16:13:00Z', { adjuntos: true }),
      m(CASA, '2026-10-17T20:51:00Z'),
    ];
    expect(seguimientosSinRespuesta({ mensajes: hilo, ...casa })).toBe(1);
  });

  it('la cotización mandada desde la casa con la dirección interna de Exchange cuenta como envío (la forma de la 559)', () => {
    const hilo = [
      m(X500, '2026-09-25T21:27:00Z', { adjuntos: true }),
      m(CASA, '2026-10-17T20:56:00Z'),
    ];
    expect(seguimientosSinRespuesta({ mensajes: hilo, ...casa })).toBe(1);
  });

  it('el correo de Eventia es el envío; los borradores no cuentan', () => {
    const hilo = [
      m('hola@eventi-app.com', '2026-10-01T10:00:00Z'),
      m(CASA, '2026-10-08T10:00:00Z'),
      m(CASA, '2026-10-15T10:00:00Z', { borrador: true }),
      m(CASA, '2026-10-17T10:00:00Z'),
    ];
    expect(seguimientosSinRespuesta({ mensajes: hilo, ...casa })).toBe(2);
  });

  it('un correo nuevo sin hilo anterior: va 1', () => {
    expect(
      seguimientosSinRespuesta({
        mensajes: [m(CASA, '2026-10-17T10:00:00Z')],
        ...casa,
      }),
    ).toBe(1);
  });

  it('si el borrador se borró, el que salió después en el hilo fue el seguimiento', () => {
    const hilo = [
      m(CASA, '2026-10-14T20:04:00Z', { adjuntos: true }),
      m(CASA, '2026-10-17T20:52:00Z', { borrador: true }),
      m('cliente@ejemplo.cl', '2026-10-17T21:30:00Z'),
      m(CASA, '2026-10-17T22:10:00Z'),
    ];
    expect(
      otroEnvioEnElHilo({
        mensajes: hilo,
        desde: '2026-10-17T20:52:30Z',
        ...casa,
      })?.fecha,
    ).toBe('2026-10-17T22:10:00Z');
    expect(
      otroEnvioEnElHilo({
        mensajes: hilo.slice(0, 3),
        desde: '2026-10-17T20:52:30Z',
        ...casa,
      }),
    ).toBeNull();
  });

  it('el próximo contacto: correo a 14 días; con 2 sin respuesta, llamada a la semana (día de Chile)', () => {
    // 23:30 del sábado 17-10 en Chile (02:30 del 18 en UTC).
    expect(proximoTrasElEnvio('2026-10-18T02:30:00Z', 1)).toEqual({
      tipo: 'correo',
      fecha: '2026-10-31',
    });
    expect(proximoTrasElEnvio('2026-10-18T02:30:00Z', 2)).toEqual({
      tipo: 'llamada',
      fecha: '2026-10-24',
    });
  });

  it('la línea de la bitácora, sin cifras', () => {
    expect(
      notaDelEnvio({
        buzon: CASA,
        enviado: '2026-10-17T20:58:00Z',
        conElBorrador: true,
        sinRespuesta: 1,
        proximo: { tipo: 'correo', fecha: '2026-10-31' },
      }),
    ).toBe(
      'Seguimiento con IA enviado desde contacto@ el 17-10. Próximo contacto por correo el 31-10, en 14 días.',
    );
    expect(
      notaDelEnvio({
        buzon: CASA,
        enviado: '2026-10-17T20:58:00Z',
        conElBorrador: false,
        sinRespuesta: 2,
        proximo: { tipo: 'llamada', fecha: '2026-10-24' },
      }),
    ).toBe(
      'Se envió un seguimiento en el hilo de contacto@ el 17-10 (el borrador de la IA no se usó). Van 2 seguimientos por correo sin respuesta: toca llamar el 24-10.',
    );
    expect(
      notaDelEnvio({
        buzon: CASA,
        enviado: '2026-10-17T20:58:00Z',
        conElBorrador: true,
        sinRespuesta: 1,
        proximo: null,
      }),
    ).toBe('Seguimiento con IA enviado desde contacto@ el 17-10.');
  });
});
