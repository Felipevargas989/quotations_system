import type { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import { QuotationStatus } from 'src/quotations/constants/constants';
import type { SeguimientoConIAService } from 'src/quotations/seguimiento/seguimiento.service';
import { UserRole, type User } from 'src/users/entities/user.entity';
import { herramientasPara } from '../herramientas';
import { ErrorDeHerramienta } from '../herramientas/comun';
import type { PropuestasRepository } from '../propuestas/propuestas.repository';
import { SeguimientoDesdeElChat } from '../propuestas/seguimiento-desde-el-chat';
import { armarServicio, camila, cotizacion } from './datos-de-prueba';

// «PREPÁRAME EL SEGUIMIENTO DE LA 600» (doc 20 §17, mejora 4): la tarjeta
// sale solo si la cotización entra al seguimiento por correo, y el «Sí,
// dejar el borrador» corre el mismo seguimiento con IA que el botón.

const vencida = {
  created_at: '2026-10-20T15:00:00Z',
  tipo: 'correo',
  note: 'Se le envió la cotización.',
  next_contact_date: '2026-10-27',
  next_contact_done_at: null,
};

const armar = (q = cotizacion(), notas: unknown[] = [vencida]) => {
  const guardadas = {
    cotizacionParaCambiar: jest.fn().mockResolvedValue(q),
    descartarPendientes: jest.fn().mockResolvedValue(undefined),
    crearPropuesta: jest.fn().mockImplementation((fila: object) =>
      Promise.resolve({
        ...fila,
        id: 'p-seg',
        vence_at: '2026-11-04T05:00:00Z',
      }),
    ),
  };
  const bitacora = { findByQuotation: jest.fn().mockResolvedValue(notas) };
  const seguimiento = {
    generar: jest.fn().mockResolvedValue({
      quotation_number: q.quotation_number,
      accion: 'borrador',
      motivo: null,
      buzon: 'contacto@valledelsolquillon.cl',
      modo: 'seguimiento',
      enlace: null,
      angulo: 'la visita',
      segundos: 31,
      costo_usd: 0.04,
    }),
  };
  const chat = new SeguimientoDesdeElChat(
    guardadas as unknown as PropuestasRepository,
    bitacora as unknown as QuotationFollowupsService,
    seguimiento as unknown as SeguimientoConIAService,
  );
  return { chat, guardadas, bitacora, seguimiento };
};

describe('El seguimiento desde el chat', () => {
  it('la tarjeta sale si la cotización entra: enviada, con el contacto por correo vencido', async () => {
    const { chat, guardadas, bitacora } = armar();
    const t = await chat.proponer(camila(), { numero: 500 });
    expect(bitacora.findByQuotation).toHaveBeenCalledWith(1, 'q500');
    expect(t).toMatchObject({
      tipo: 'seguimiento',
      numero: 500,
      cliente: 'Rudel',
      se_puede_deshacer: false,
    });
    expect(t.avisos[0]).toMatch(/Nunca se envía/);
    const [fila] = guardadas.crearPropuesta.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(fila).toMatchObject({
      company_id: 1,
      quotation_id: 'q500',
      tipo: 'seguimiento',
    });
  });

  it('si no entra, BelIA recibe el porqué y no hay tarjeta', async () => {
    const { chat, guardadas } = armar(
      cotizacion({ quotation_status: QuotationStatus.SOLICITADA }),
    );
    await expect(chat.proponer(camila(), { numero: 500 })).rejects.toThrow(
      ErrorDeHerramienta,
    );
    await expect(chat.proponer(camila(), { numero: 500 })).rejects.toThrow(
      'no entra al seguimiento por correo',
    );
    expect(guardadas.crearPropuesta).not.toHaveBeenCalled();
  });

  it('con el contacto por WhatsApp tampoco entra', async () => {
    const { chat } = armar(cotizacion(), [{ ...vencida, tipo: 'whatsapp' }]);
    await expect(chat.proponer(camila(), { numero: 500 })).rejects.toThrow(
      'no por correo',
    );
  });

  it('el «Sí» corre el seguimiento con IA con la sesión de quien lo pidió', async () => {
    const { chat, seguimiento } = armar();
    const r = await chat.dejar(camila(), cotizacion());
    expect(seguimiento.generar).toHaveBeenCalledWith(
      'q500',
      expect.objectContaining({ id: 'perfil-1', company_id: 1 }),
    );
    expect(r).toMatchObject({ estado: 'aplicada', numero: 500 });
    expect(r.aviso).toMatch(/contacto@valledelsolquillon\.cl/);
  });

  it('si el seguimiento lo salta, la tarjeta dice por qué', async () => {
    const { chat, seguimiento } = armar();
    seguimiento.generar.mockResolvedValue({
      quotation_number: 500,
      accion: 'saltada',
      motivo: 'el hilo ya tiene un borrador esperando.',
      buzon: null,
      modo: null,
      enlace: null,
      angulo: null,
      segundos: 2,
      costo_usd: null,
    });
    const r = await chat.dejar(camila(), cotizacion());
    expect(r.aviso).toBe(
      'No dejé borrador: el hilo ya tiene un borrador esperando.',
    );
  });
});

describe('El «Sí, dejar el borrador» por la puerta de las propuestas', () => {
  it('aplica, cierra la propuesta y devuelve el aviso', async () => {
    const q = cotizacion();
    const { servicio, repositorio, seguimientoDelChat } = armarServicio(q, {
      tipo: 'seguimiento',
      antes: {},
      despues: {},
    });
    const r = await servicio.aplicar(camila(), 'p1');
    expect(seguimientoDelChat.dejar).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'perfil-1' }),
      q,
    );
    expect(r.aviso).toMatch(/borrador/);
    expect(repositorio.moverPropuesta).toHaveBeenLastCalledWith(
      1,
      'p1',
      'aplicando',
      expect.objectContaining({ estado: 'aplicada' }),
    );
  });

  it('recepción no deja borradores', async () => {
    const { servicio, seguimientoDelChat } = armarServicio(cotizacion(), {
      tipo: 'seguimiento',
    });
    await expect(
      servicio.aplicar(camila(UserRole.RECEPCION), 'p1'),
    ).rejects.toThrow('recepción');
    expect(seguimientoDelChat.dejar).not.toHaveBeenCalled();
  });

  it('no se deshace: el borrador queda en Outlook', async () => {
    const { servicio } = armarServicio(cotizacion(), {
      tipo: 'seguimiento',
      estado: 'aplicada',
    });
    await expect(servicio.deshacer(camila(), 'p1')).rejects.toThrow('Outlook');
  });
});

describe('Quién tiene la herramienta', () => {
  const con = (role: UserRole, derechos: string[]) =>
    herramientasPara({ role, derechos } as unknown as User).map(
      (h) => h.nombre,
    );
  it('quien vende, en la empresa con el seguimiento con IA', () => {
    expect(con(UserRole.VENDEDOR, ['base', 'seguimiento_con_ia'])).toContain(
      'proponer_seguimiento',
    );
    expect(con(UserRole.VENDEDOR, ['base'])).not.toContain(
      'proponer_seguimiento',
    );
    // Recepción también desde el doc 21, en sus particulares (lo revisa
    // PropuestasService).
    expect(con(UserRole.RECEPCION, ['base', 'seguimiento_con_ia'])).toContain(
      'proponer_seguimiento',
    );
    expect(con(UserRole.RECEPCION, ['base'])).not.toContain(
      'proponer_seguimiento',
    );
  });
});
