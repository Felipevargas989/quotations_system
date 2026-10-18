import type { NotaDeBitacora } from '../../../seguimiento/elegibles';
import { ErrorDeOutlook } from '../../../seguimiento/outlook';
import {
  armar,
  compromiso,
  CONTACTO,
  cotizacion,
  delHilo,
  fila,
  nuevoParse,
  outlookFalso,
  restaurarEnv,
  usuario,
} from './seguimiento.fixtures';

// Cuando el borrador del seguimiento con IA sale (doc 18 §9; Felipe,
// 17-10-2026): Eventia mira Outlook al abrir Cotizaciones y, si salió, lo
// anota solo en la bitácora con el próximo contacto. Outlook simulado.
// Datos de prueba, no de clientes reales.

describe('cuando el borrador sale (doc 18 §9): Eventia lo anota solo', () => {
  const llave = process.env.ANTHROPIC_API_KEY;
  const outlookLlave = process.env.MS_CLIENT_SECRET;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'llave_de_prueba';
    process.env.MS_CLIENT_SECRET = 'llave_de_prueba';
  });
  afterAll(() => {
    restaurarEnv('ANTHROPIC_API_KEY', llave);
    restaurarEnv('MS_CLIENT_SECRET', outlookLlave);
  });

  it('salió: lo anota a nombre de Asistente con el próximo correo a 14 días, y la cotización sale de la lista', async () => {
    const outlook = outlookFalso();
    outlook.estadoDelBorrador.mockResolvedValue({
      estado: 'enviado',
      hilo: 'h1',
      enviado: '2026-10-17T20:58:00Z',
    });
    outlook.mensajesDelHilo.mockResolvedValue([
      delHilo('hola@eventi-app.com', '2026-10-11T13:34:00Z', {
        adjuntos: true,
      }),
      delHilo(CONTACTO, '2026-10-17T20:58:00Z'),
    ]);
    const { servicio, repositorio, bitacora } = armar(nuevoParse(), {
      outlook,
      enEspera: [fila()],
    });

    const r = await servicio.revisar(usuario);

    expect(r).toEqual({ revisados: 1, cambiaron: ['q607'] });
    expect(outlook.estadoDelBorrador).toHaveBeenCalledWith(
      CONTACTO,
      'inm-borr1',
    );
    expect(bitacora.crearComoAsistente).toHaveBeenCalledWith(1, {
      quotation_id: 'q607',
      note: 'Seguimiento con IA enviado desde contacto@ el 17-10. Próximo contacto por correo el 31-10, en 14 días.',
      tipo: 'correo',
      next_contact_date: '2026-10-31',
    });
    expect(repositorio.cerrarBorrador).toHaveBeenCalledWith(1, 7, {
      estado: 'enviado',
      enviado_at: '2026-10-17T20:58:00Z',
    });
  });

  it('con dos seguimientos sin respuesta, lo que sigue es una llamada a la semana', async () => {
    const outlook = outlookFalso();
    outlook.estadoDelBorrador.mockResolvedValue({
      estado: 'enviado',
      hilo: 'h1',
      enviado: '2026-10-17T20:58:00Z',
    });
    outlook.mensajesDelHilo.mockResolvedValue([
      delHilo('hola@eventi-app.com', '2026-10-01T13:34:00Z'),
      delHilo(CONTACTO, '2026-10-08T15:00:00Z'),
      delHilo(CONTACTO, '2026-10-17T20:58:00Z'),
    ]);
    const { servicio, bitacora } = armar(nuevoParse(), {
      outlook,
      enEspera: [fila()],
    });

    await servicio.revisar(usuario);

    expect(bitacora.crearComoAsistente).toHaveBeenCalledWith(1, {
      quotation_id: 'q607',
      note: 'Seguimiento con IA enviado desde contacto@ el 17-10. Van 2 seguimientos por correo sin respuesta: toca llamar el 24-10.',
      tipo: 'llamada',
      next_contact_date: '2026-10-24',
    });
  });

  it('se borró sin enviarse: queda descartado, sin línea, y el botón vuelve', async () => {
    const outlook = outlookFalso();
    outlook.estadoDelBorrador.mockResolvedValue({
      estado: 'eliminado',
      hilo: 'h1',
    });
    outlook.mensajesDelHilo.mockResolvedValue([
      delHilo(CONTACTO, '2026-10-14T20:04:00Z', { adjuntos: true }),
      delHilo(CONTACTO, '2026-10-17T20:52:00Z', { borrador: true }),
    ]);
    const { servicio, repositorio, bitacora } = armar(nuevoParse(), {
      outlook,
      enEspera: [fila()],
    });

    const r = await servicio.revisar(usuario);

    expect(r.cambiaron).toEqual(['q607']);
    expect(repositorio.cerrarBorrador).toHaveBeenCalledWith(1, 7, {
      estado: 'descartado',
    });
    expect(bitacora.crearComoAsistente).not.toHaveBeenCalled();
  });

  it('se borró, pero salió otro correo de la casa en el hilo: ese fue el seguimiento', async () => {
    const outlook = outlookFalso();
    outlook.estadoDelBorrador.mockResolvedValue({ estado: 'no_esta' });
    outlook.mensajesDelHilo.mockResolvedValue([
      delHilo(CONTACTO, '2026-10-14T20:04:00Z', { adjuntos: true }),
      delHilo(CONTACTO, '2026-10-17T22:10:00Z'),
    ]);
    const { servicio, bitacora } = armar(nuevoParse(), {
      outlook,
      enEspera: [fila()],
    });

    await servicio.revisar(usuario);

    // Sin el identificador, el hilo sale de la fila.
    expect(outlook.mensajesDelHilo).toHaveBeenCalledWith(CONTACTO, 'h1');
    expect(bitacora.crearComoAsistente).toHaveBeenCalledWith(1, {
      quotation_id: 'q607',
      note: 'Se envió un seguimiento en el hilo de contacto@ el 17-10 (el borrador de la IA no se usó). Próximo contacto por correo el 31-10, en 14 días.',
      tipo: 'correo',
      next_contact_date: '2026-10-31',
    });
  });

  it('si alguien ya anotó el próximo paso después del borrador, manda lo suyo', async () => {
    const outlook = outlookFalso();
    outlook.estadoDelBorrador.mockResolvedValue({
      estado: 'enviado',
      hilo: 'h1',
      enviado: '2026-10-17T20:58:00Z',
    });
    const aMano: NotaDeBitacora = {
      ...compromiso,
      created_at: '2026-10-17T21:05:00+00:00',
      note: 'Envié el seguimiento',
      next_contact_date: '2026-10-28',
    };
    const { servicio, repositorio, bitacora } = armar(nuevoParse(), {
      outlook,
      enEspera: [fila()],
      notas: [[compromiso, aMano]],
    });

    await servicio.revisar(usuario);

    expect(bitacora.crearComoAsistente).not.toHaveBeenCalled();
    expect(repositorio.cerrarBorrador).toHaveBeenCalledWith(1, 7, {
      estado: 'enviado',
      enviado_at: '2026-10-17T20:58:00Z',
    });
  });

  it('un negocio que ya no está vivo: se anota el envío, sin próximo contacto', async () => {
    const outlook = outlookFalso();
    outlook.estadoDelBorrador.mockResolvedValue({
      estado: 'enviado',
      hilo: 'h1',
      enviado: '2026-10-17T20:58:00Z',
    });
    const { servicio, bitacora } = armar(nuevoParse(), {
      outlook,
      enEspera: [fila()],
      fila: cotizacion({ quotation_status: 'aceptada' }),
    });

    await servicio.revisar(usuario);

    expect(bitacora.crearComoAsistente).toHaveBeenCalledWith(1, {
      quotation_id: 'q607',
      note: 'Seguimiento con IA enviado desde contacto@ el 17-10.',
      tipo: 'correo',
      next_contact_date: null,
    });
  });

  it('todavía de borrador: no anota nada', async () => {
    const outlook = outlookFalso();
    outlook.estadoDelBorrador.mockResolvedValue({
      estado: 'borrador',
      hilo: 'h1',
    });
    const { servicio, repositorio, bitacora } = armar(nuevoParse(), {
      outlook,
      enEspera: [fila()],
    });

    expect(await servicio.revisar(usuario)).toEqual({
      revisados: 1,
      cambiaron: [],
    });
    expect(repositorio.cerrarBorrador).not.toHaveBeenCalled();
    expect(bitacora.crearComoAsistente).not.toHaveBeenCalled();
  });

  it('el freno: lo que se miró hace menos de 5 minutos no se le pregunta a Outlook', async () => {
    const outlook = outlookFalso();
    outlook.estadoDelBorrador.mockResolvedValue({
      estado: 'borrador',
      hilo: 'h1',
    });
    const hace = (min: number) =>
      new Date(Date.now() - min * 60_000).toISOString();
    const haceDiez = hace(10);
    const { servicio, repositorio } = armar(nuevoParse(), {
      outlook,
      enEspera: [
        fila({ id: 7, revisado_at: hace(1) }),
        fila({ id: 8, quotation_id: 'q608', revisado_at: haceDiez }),
      ],
    });

    expect(await servicio.revisar(usuario)).toEqual({
      revisados: 1,
      cambiaron: [],
    });
    // La 7 se miró hace un minuto: ni se toma ni se pregunta. La 8 se toma
    // solo si nadie la tomó desde que se leyó (misma hora de revisión).
    expect(repositorio.tomarParaRevisar.mock.calls).toEqual([[1, 8, haceDiez]]);
    expect(outlook.estadoDelBorrador).toHaveBeenCalledTimes(1);
  });

  it('si otra pantalla lo tomó primero, no se le pregunta a Outlook', async () => {
    const outlook = outlookFalso();
    const { servicio, repositorio } = armar(nuevoParse(), {
      outlook,
      enEspera: [fila()],
    });
    repositorio.tomarParaRevisar.mockResolvedValue(false);

    expect(await servicio.revisar(usuario)).toEqual({
      revisados: 0,
      cambiaron: [],
    });
    expect(repositorio.tomarParaRevisar).toHaveBeenCalledWith(1, 7, null);
    expect(outlook.estadoDelBorrador).not.toHaveBeenCalled();
  });

  it('sin la llave de Outlook no hace nada (y no falla)', async () => {
    delete process.env.MS_CLIENT_SECRET;
    const { servicio, repositorio } = armar(nuevoParse(), {
      enEspera: [fila()],
    });
    expect(await servicio.revisar(usuario)).toEqual({
      revisados: 0,
      cambiaron: [],
    });
    expect(repositorio.borradoresEnEspera).not.toHaveBeenCalled();
  });

  it('si Outlook falla con un borrador, sigue con los demás y no rompe la pantalla', async () => {
    const outlook = outlookFalso();
    outlook.estadoDelBorrador
      .mockRejectedValueOnce(new ErrorDeOutlook('Outlook respondió 503', 503))
      .mockResolvedValueOnce({ estado: 'borrador', hilo: 'h2' });
    const { servicio } = armar(nuevoParse(), {
      outlook,
      enEspera: [fila(), fila({ id: 8, quotation_id: 'q608' })],
    });
    expect(await servicio.revisar(usuario)).toEqual({
      revisados: 2,
      cambiaron: [],
    });
  });

  it('con un borrador esperando, «Generar seguimiento» no escribe otro', async () => {
    const parse = nuevoParse();
    const outlook = outlookFalso();
    outlook.estadoDelBorrador.mockResolvedValue({
      estado: 'borrador',
      hilo: 'h1',
    });
    const { servicio } = armar(parse, { outlook, enEspera: [fila()] });

    const r = await servicio.generar('q607', usuario);

    expect(r).toMatchObject({
      accion: 'saltada',
      motivo:
        'ya hay un borrador esperando en Outlook (contacto@): ábrelo, revísalo y envíalo desde ahí.',
    });
    // Antes de decidir, una mirada fresca a Outlook (freno de 30 s).
    expect(outlook.estadoDelBorrador).toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalled();
    expect(outlook.buscar).not.toHaveBeenCalled();
  });
});
