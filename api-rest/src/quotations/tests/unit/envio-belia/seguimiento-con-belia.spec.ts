import { ConflictException } from '@nestjs/common';
import type { User } from 'src/users/entities/user.entity';
import type { EnvioPreparado } from '../../../envio-belia/envio-con-belia.service';
import {
  porQueNoVaEnLaTanda,
  SeguimientoConBeliaService,
} from '../../../envio-belia/seguimiento-con-belia.service';
import { preguntarALaIA } from '../../../seguimiento/preguntar';

// El seguimiento que envía BelIA (doc 20 §20; Felipe, 28-11-2026: «siempre
// desde contacto@»): el hilo se busca SOLO en contacto@, en la tanda se
// saltan los que van por llamada o WhatsApp, y al enviar queda el próximo
// contacto en la bitácora con la regla de siempre (14 días por correo; con
// dos sin respuesta, una llamada en 7).

jest.mock('../../../seguimiento/preguntar', () => ({
  preguntarALaIA: jest.fn(),
}));

const CONTACTO = 'contacto@valledelsolquillon.cl';
const ENSAYO = 'felipe@valledelsolquillon.cl';
const usuario = { id: 'u1', company_id: 7, full_name: 'Felipe' } as User;

const nota = (tipo: string, proximo: string | null, creada = '2026-11-01') => ({
  created_at: `${creada}T12:00:00Z`,
  tipo,
  note: 'x',
  next_contact_date: proximo,
  next_contact_done_at: null,
});

describe('porQueNoVaEnLaTanda', () => {
  it('deja fuera lo que no está enviado ni en negociación', () => {
    expect(porQueNoVaEnLaTanda('aceptada', [])).toMatch(/aceptada/);
  });
  it('salta lo que tiene el próximo contacto por WhatsApp o llamada', () => {
    expect(
      porQueNoVaEnLaTanda('enviada', [nota('whatsapp', '2026-11-20')]),
    ).toMatch(/por whatsapp, no por correo/);
    expect(
      porQueNoVaEnLaTanda('en_negociacion', [nota('llamada', '2026-11-20')]),
    ).toMatch(/por llamada/);
  });
  it('entra con próximo contacto por correo o sin compromiso', () => {
    expect(
      porQueNoVaEnLaTanda('enviada', [nota('correo', '2026-11-20')]),
    ).toBeNull();
    expect(porQueNoVaEnLaTanda('enviada', [])).toBeNull();
  });
});

const armar = (o: { estado?: string; borrador?: string } = {}) => {
  const outlook = {
    esDeLaCasa: (c: string) => c.endsWith('@valledelsolquillon.cl'),
    esDeEventia: (c: string) => c.endsWith('@eventi-app.com'),
    buscar: jest.fn().mockResolvedValue([]),
    leerTexto: jest.fn().mockResolvedValue('texto'),
    borradorParaEnviar: jest
      .fn()
      .mockResolvedValue({ id: 'b1', enlace: 'https://x' }),
    idInmutable: jest.fn().mockResolvedValue({ id: 'inm1', hilo: null }),
    estadoDelBorrador: jest
      .fn()
      .mockResolvedValue({ estado: o.borrador ?? 'borrador' }),
    enviar: jest.fn().mockResolvedValue(undefined),
  };
  const q = {
    id: 'q1',
    quotation_number: 612,
    quotation_status: o.estado ?? 'enviada',
    event_type: 'Almuerzo',
    event_date: '2099-12-12',
    event_end_date: null,
    people_count: 80,
    children_count: 0,
    total_amount: 2_800_000,
    sent_at: '2026-11-10T12:00:00Z',
    created_at: '2026-11-05T12:00:00Z',
    contact_name: 'Ana',
    client_contact_id: null,
    observations: null,
    comentario_interno: null,
    clients: {
      name: 'Ecofor',
      client_type: 'empresa',
      email: 'ana@ecofor.cl',
      client_contacts: [],
    },
  };
  const lecturas = {
    cotizacion: jest.fn().mockResolvedValue(q),
    bitacora: jest.fn().mockResolvedValue([]),
    borradoresEnEspera: jest.fn().mockResolvedValue([]),
  };
  const seguimiento = { llaveDeOutlook: () => outlook };
  const envio = { buzon: () => ({ buzon: ENSAYO, ensayo: true }) };
  const bitacora = { crearComoBeliaAPedidoDe: jest.fn().mockResolvedValue({}) };
  const choques = {
    cotizacionesConTope: jest.fn().mockResolvedValue(new Set()),
  };
  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const s = new SeguimientoConBeliaService(
    lecturas as never,
    seguimiento as never,
    envio as never,
    bitacora as never,
    choques as never,
    logger as never,
  );
  return { s, outlook, lecturas, bitacora };
};

const preparado = (o: Partial<EnvioPreparado> = {}): EnvioPreparado => ({
  clase: 'seguimiento',
  sin_respuesta: 0,
  quotation_id: 'q1',
  numero: 612,
  cliente: 'Ecofor',
  para: 'ana@ecofor.cl',
  cc: [],
  para_real: null,
  buzon: CONTACTO,
  en_hilo: true,
  asunto: 'Cotización',
  borrador_id: 'inm1',
  enlace: null,
  texto: 'Hola Ana',
  resumen: 'pregunta si sigue la fecha',
  nota: 'Recibió la cotización y no ha respondido.',
  total: '$2.800.000',
  costo_usd: 0.01,
  ...o,
});

describe('SeguimientoConBeliaService.preparar', () => {
  const OLD = process.env.ANTHROPIC_API_KEY;
  beforeAll(() => {
    process.env.ANTHROPIC_API_KEY = 'k';
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = OLD;
  });

  it('sin hilo en contacto@ va como correo nuevo, con la voz de contacto@ y al buzón de ensayo en el laboratorio', async () => {
    (preguntarALaIA as jest.Mock).mockResolvedValue({
      accion: 'borrador',
      motivo: '',
      asunto: 'Seguimiento cotización Ecofor',
      cuerpo_html: '<p>Hola Ana, ¿cómo está?</p>',
      angulo: 'pregunta si sigue la fecha',
      nota: 'Sin conversación previa por correo.',
    });
    const { s, outlook } = armar();
    const r = (await s.preparar('q1', usuario, true)) as EnvioPreparado;
    // Busca solo en el buzón de este motor, nunca en los otros de la casa.
    expect(outlook.buscar).toHaveBeenCalledWith(ENSAYO, 'ana@ecofor.cl');
    expect(
      outlook.buscar.mock.calls.every(([b]: [string]) => b === ENSAYO),
    ).toBe(true);
    const mensaje = (preguntarALaIA as jest.Mock).mock.calls[0][3] as string;
    expect(mensaje).toContain(CONTACTO);
    const borrador = outlook.borradorParaEnviar.mock.calls[0][0];
    expect(borrador).toMatchObject({
      buzon: ENSAYO,
      idMensaje: null,
      para: ENSAYO,
      ensayo: true,
      asunto: 'Seguimiento cotización Ecofor',
    });
    expect(r).toMatchObject({
      clase: 'seguimiento',
      en_hilo: false,
      para_real: 'ana@ecofor.cl',
      nota: 'Sin conversación previa por correo.',
    });
  });

  it('en la tanda salta sin llamar a la IA lo que va por WhatsApp', async () => {
    (preguntarALaIA as jest.Mock).mockClear();
    const { s, lecturas } = armar();
    lecturas.bitacora.mockResolvedValue([nota('whatsapp', '2026-11-20')]);
    const r = await s.preparar('q1', usuario, false);
    expect(r).toMatchObject({ motivo: expect.stringMatching(/whatsapp/) });
    expect(preguntarALaIA).not.toHaveBeenCalled();
  });
});

describe('SeguimientoConBeliaService.enviar', () => {
  it('envía y anota el próximo correo en 14 días con lo hablado', async () => {
    const { s, outlook, bitacora } = armar();
    const r = await s.enviar(preparado(), usuario);
    expect(outlook.enviar).toHaveBeenCalledWith(CONTACTO, 'inm1');
    const [, fila] = bitacora.crearComoBeliaAPedidoDe.mock.calls[0];
    expect(fila.tipo).toBe('correo');
    expect(fila.next_contact_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(fila.note).toMatch(/Seguimiento con IA enviado desde contacto@/);
    expect(fila.note).toMatch(/Lo hablado: Recibió la cotización/);
    expect(r.aviso).toMatch(/en su hilo/);
  });

  it('con dos sin respuesta, lo que sigue es llamar', async () => {
    const { s, bitacora } = armar();
    await s.enviar(preparado({ sin_respuesta: 1 }), usuario);
    const [, fila] = bitacora.crearComoBeliaAPedidoDe.mock.calls[0];
    expect(fila.tipo).toBe('llamada');
    expect(fila.note).toMatch(/toca llamar/);
  });

  it('no envía si la cotización ya no está enviada ni en negociación', async () => {
    const { s, outlook } = armar({ estado: 'aceptada' });
    await expect(s.enviar(preparado(), usuario)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(outlook.enviar).not.toHaveBeenCalled();
  });

  it('no envía si el borrador ya no está en Outlook', async () => {
    const { s, outlook } = armar({ borrador: 'no_esta' });
    await expect(s.enviar(preparado(), usuario)).rejects.toThrow(/Pídemelo/);
    expect(outlook.enviar).not.toHaveBeenCalled();
  });
});
