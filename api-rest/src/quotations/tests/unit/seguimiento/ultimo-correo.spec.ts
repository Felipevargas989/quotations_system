import { mensajeDelSeguimiento } from '../../../seguimiento/contexto';
import {
  porQueNoEntraAPedido,
  reglaDelSeguimiento,
} from '../../../seguimiento/elegibles';
import { decidirRespuesta } from '../../../seguimiento/hilo';
import type { MensajeDelBuzon } from '../../../seguimiento/outlook';
import {
  buscarUltimoCorreo,
  correosDeLaCotizacion,
} from '../../../seguimiento/ultimo-correo';

// «¿DÓNDE ESTÁ EL ÚLTIMO CORREO?» y el seguimiento a pedido (doc 20 §18,
// sprint 2; Felipe, 10-11-2026).

const CASA = '@valledelsolquillon.cl';
const msj = (
  id: string,
  de: string,
  fecha: string,
  asunto = 'Cotización N° 612 · Cumpleaños',
  extra: Partial<MensajeDelBuzon> = {},
): MensajeDelBuzon => ({
  id,
  hilo: 'h1',
  de,
  para: [],
  cc: [],
  asunto,
  fecha,
  borrador: false,
  adelanto: `adelanto de ${id}`,
  ...extra,
});

const outlook = (porBuzon: Record<string, MensajeDelBuzon[]>) => ({
  buzones: ['contacto' + CASA, 'felipe' + CASA],
  buscar: jest.fn((buzon: string) => Promise.resolve(porBuzon[buzon] ?? [])),
  leerTexto: jest.fn((_b: string, id: string) =>
    Promise.resolve(`Texto completo de ${id}`),
  ),
  esDeLaCasa: (c: string) => c.endsWith(CASA),
  esDeEventia: () => false,
});

const Q = {
  quotation_number: 612,
  created_at: '2026-11-01T12:00:00Z',
  client_contact_id: 7,
  clients: {
    email: 'Ana@Gmail.com ',
    client_contacts: [{ id: 7, email: 'ana.trabajo@empresa.cl' }],
  },
};

describe('correosDeLaCotizacion', () => {
  it('el del contacto y el del cliente, limpios y sin repetir', () => {
    expect(correosDeLaCotizacion(Q)).toEqual([
      'ana.trabajo@empresa.cl',
      'ana@gmail.com',
    ]);
    expect(
      correosDeLaCotizacion({ ...Q, clients: { email: 'sincorreo@x.cl' } }),
    ).toEqual([]);
  });
});

describe('buscarUltimoCorreo', () => {
  it('el hilo de la cotización: buzón, el último y el último de la casa', async () => {
    const o = outlook({
      ['contacto' + CASA]: [
        msj(
          'm3',
          'ana@gmail.com',
          '2026-11-08T15:00:00Z',
          'RE: Cotización N° 612',
        ),
        msj('m2', 'contacto' + CASA, '2026-11-05T15:00:00Z'),
      ],
    });
    const r = await buscarUltimoCorreo(o, Q);
    expect(r).toMatchObject({
      encontrado: 'hilo_de_la_cotizacion',
      buzon: 'contacto' + CASA,
      correos_en_el_hilo: 2,
      hay_borrador: false,
      ultimo: {
        de: 'ana@gmail.com',
        de_la_casa: false,
        dia: '2026-11-08',
        extracto: 'Texto completo de m3',
      },
      ultimo_de_la_casa: { de: 'contacto' + CASA, de_la_casa: true },
    });
    // Encontrado en el primer buzón: no sigue buscando.
    expect(o.buscar).not.toHaveBeenCalledWith(
      'felipe' + CASA,
      expect.anything(),
    );
  });

  it('sin hilo de la cotización: el último correo con el cliente en otro hilo', async () => {
    const o = outlook({
      ['felipe' + CASA]: [
        msj(
          'x1',
          'ana@gmail.com',
          '2026-10-01T10:00:00Z',
          'Hola, una consulta',
        ),
      ],
    });
    const r = await buscarUltimoCorreo(o, Q);
    expect(r).toMatchObject({
      encontrado: 'otro_hilo',
      ultimo: { buzon: 'felipe' + CASA, asunto: 'Hola, una consulta' },
    });
  });

  it('sin correos: lo dice, y sin correo útil no busca', async () => {
    expect(await buscarUltimoCorreo(outlook({}), Q)).toEqual({
      encontrado: 'ninguno',
      correos_buscados: ['ana.trabajo@empresa.cl', 'ana@gmail.com'],
    });
    const o = outlook({});
    expect(await buscarUltimoCorreo(o, { ...Q, clients: null })).toEqual({
      encontrado: 'sin_correo',
    });
    expect(o.buscar).not.toHaveBeenCalled();
  });

  it('si no puede leer el texto, usa el adelanto', async () => {
    const o = outlook({
      ['contacto' + CASA]: [
        msj('m2', 'contacto' + CASA, '2026-11-05T15:00:00Z'),
      ],
    });
    o.leerTexto.mockRejectedValue(new Error('caída'));
    const r = await buscarUltimoCorreo(o, Q);
    expect(r).toMatchObject({ ultimo: { extracto: 'adelanto de m2' } });
  });
});

describe('el seguimiento a pedido', () => {
  const vencida = {
    created_at: '2026-10-20T15:00:00Z',
    tipo: 'whatsapp',
    note: null,
    next_contact_date: '2099-01-01',
    next_contact_done_at: null,
  };
  it('entra cualquier enviada o en negociación', () => {
    expect(porQueNoEntraAPedido('enviada')).toBeNull();
    expect(porQueNoEntraAPedido('en_negociacion')).toBeNull();
    expect(porQueNoEntraAPedido('solicitada')).toMatch('enviadas');
  });
  it('la regla de siempre sigue para el botón', () => {
    expect(
      reglaDelSeguimiento(true, '2026-11-10')('enviada', [vencida]),
    ).toBeNull();
    expect(
      reglaDelSeguimiento(false, '2026-11-10')('enviada', [vencida]),
    ).toMatch('todavía no vence');
  });
});

describe('decidirRespuesta (doc 20 §18, sprint 3)', () => {
  const base = {
    esDeLaCasa: (c: string) => c.endsWith(CASA),
    esDeEventia: () => false,
    buzonParaNuevo: 'contacto' + CASA,
    numero: 612,
    creada: '2026-11-01T12:00:00Z',
  };

  it('el hilo de la cotización: responde el último, aunque sea del cliente', () => {
    const d = decidirRespuesta({
      ...base,
      encontrados: [
        {
          buzon: 'contacto' + CASA,
          mensajes: [
            msj(
              'm3',
              'ana@gmail.com',
              '2026-11-08T15:00:00Z',
              'RE: Cotización N° 612',
            ),
            msj('m2', 'contacto' + CASA, '2026-11-05T15:00:00Z'),
          ],
        },
      ],
    });
    expect(d).toMatchObject({ modo: 'responder', mensaje: { id: 'm3' } });
  });

  it('sin hilo de la cotización: el último correo del cliente en su hilo', () => {
    const d = decidirRespuesta({
      ...base,
      encontrados: [
        { buzon: 'contacto' + CASA, mensajes: [] },
        {
          buzon: 'reservas' + CASA,
          mensajes: [
            msj(
              'c1',
              'ana@gmail.com',
              '2026-11-09T10:00:00Z',
              'Consulta cumpleaños',
              { hilo: 'h9' },
            ),
            msj(
              'c2',
              'reservas' + CASA,
              '2026-11-09T12:00:00Z',
              'RE: Consulta cumpleaños',
              { hilo: 'h9' },
            ),
          ],
        },
      ],
    });
    expect(d).toMatchObject({
      modo: 'responder',
      buzon: 'reservas' + CASA,
      mensaje: { id: 'c2' },
    });
  });

  it('con un borrador en el hilo no escribe otro; sin correos, nuevo', () => {
    expect(
      decidirRespuesta({
        ...base,
        encontrados: [
          {
            buzon: 'contacto' + CASA,
            mensajes: [
              msj(
                'b',
                'contacto' + CASA,
                '2026-11-09T10:00:00Z',
                'RE: Cotización N° 612',
                { borrador: true },
              ),
            ],
          },
        ],
      }),
    ).toMatchObject({ modo: 'saltar' });
    expect(decidirRespuesta({ ...base, encontrados: [] })).toEqual({
      modo: 'nuevo',
      buzon: 'contacto' + CASA,
    });
  });
});

describe('el pedido en el mensaje a la IA', () => {
  it('con instrucción, dice que no es un seguimiento y trae lo pedido', () => {
    const datos = {
      numero: 612,
      estado: 'solicitada',
      tipoEvento: 'Cumpleaños',
      fecha: null,
      fin: null,
      personas: 30,
      ninos: 0,
      total: 0,
      enviada: null,
      cliente: 'Ana',
      tipoCliente: 'Particulares',
      contacto: 'Ana',
      correo: 'ana@gmail.com',
      observaciones: null,
      comentarioInterno: null,
      notas: [],
      hoy: '2026-11-10',
      modo: 'responder' as const,
      buzon: 'contacto' + CASA,
      hilo: [],
    };
    const con = mensajeDelSeguimiento({
      ...datos,
      instruccion: 'que sí hay fecha',
    });
    expect(con).toMatch(/^RESPUESTA AL CLIENTE/);
    expect(con).toContain('ESTA VEZ NO ES UN SEGUIMIENTO');
    expect(con).toContain('que sí hay fecha');
    expect(mensajeDelSeguimiento(datos)).toMatch(
      /^SEGUIMIENTO DE LA COTIZACIÓN/,
    );
  });
});
