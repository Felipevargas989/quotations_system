import { PinoLogger } from 'nestjs-pino';
import { DerechosService } from 'src/auth/derechos.service';
import { EmailService } from 'src/email/email.service';
import { SupabaseService } from 'src/supabase/supabase.service';
import { UsersService } from 'src/users/users.service';
import { mockPinoLogger } from '../../testing/mocks';
import { PlanCronService } from '../plan-cron.service';

/**
 * EL RELOJ DEL COBRO (16-09-2026, sprint B del paso 4+5).
 *
 * La prueba que más importa acá es la de la cortesía: el reloj decide
 * con filtros de estado, y NINGUNA de sus consultas puede calzar con
 * `gratis`. Si alguien un día le quita el filtro a una consulta, esta
 * prueba lo delata antes de que Valle del Sol amanezca bloqueada.
 */

type Consulta = {
  tabla: string;
  eq: Record<string, unknown>;
  update: Record<string, unknown> | null;
};

const armarCliente = (respuestas?: Array<{ data: unknown }>) => {
  const consultas: Consulta[] = [];
  let turno = 0;
  const from = jest.fn((tabla: string) => {
    const actual: Consulta = { tabla, eq: {}, update: null };
    consultas.push(actual);
    const respuesta = respuestas?.[turno++] ?? { data: [] };
    const cadena: Record<string, unknown> = {};
    for (const m of ['select', 'not', 'is', 'lt', 'gte', 'gt']) {
      cadena[m] = jest.fn(() => cadena);
    }
    (cadena as { update: unknown }).update = jest.fn(
      (campos: Record<string, unknown>) => {
        actual.update = campos;
        return cadena;
      },
    );
    (cadena as { eq: unknown }).eq = jest.fn(
      (columna: string, valor: unknown) => {
        actual.eq[columna] = valor;
        return cadena;
      },
    );
    (cadena as { then?: unknown }).then = (
      resolver: (v: unknown) => void,
    ): void => resolver({ ...respuesta, error: null });
    return cadena;
  });
  return { client: { from }, consultas };
};

const armarReloj = (client: unknown) => {
  const derechos = { olvidar: jest.fn() };
  const email = { sendEmail: jest.fn().mockResolvedValue(undefined) };
  const users = {
    findAll: jest
      .fn()
      .mockResolvedValue([
        { user_id: 'u-1', role: 'administrador', email: 'duena@sur.cl' },
      ]),
  };
  const reloj = new PlanCronService(
    { client } as unknown as SupabaseService,
    derechos as unknown as DerechosService,
    users as unknown as UsersService,
    email as unknown as EmailService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { reloj, derechos, email, users };
};

describe('el reloj del cobro', () => {
  it('JAMÁS consulta el estado gratis: la cortesía no existe para el reloj', async () => {
    const { client, consultas } = armarCliente();
    const { reloj } = armarReloj(client);
    await reloj.bloquearPruebasVencidas();
    await reloj.avisarPruebasPorVencer();
    await reloj.cosecharCobrosVencidos();

    expect(consultas.length).toBeGreaterThanOrEqual(5);
    for (const consulta of consultas) {
      // Toda consulta del reloj filtra por UN estado concreto...
      expect(consulta.eq.estado_plan).toBeDefined();
      // ...y ese estado nunca es la cortesía.
      expect(consulta.eq.estado_plan).not.toBe('gratis');
    }
  });

  it('cancelada con el mes cumplido → bloqueada directo (decisión 5)', async () => {
    const { client, consultas } = armarCliente([
      { data: [{ id: 9, name: 'La que canceló' }] }, // canceladas
      { data: [] }, // morosas nuevas
      { data: [] }, // gracias vencidas
    ]);
    const { reloj, derechos } = armarReloj(client);
    await reloj.cosecharCobrosVencidos();
    expect(consultas[0].update).toMatchObject({ estado_plan: 'bloqueado' });
    expect(consultas[0].eq).toMatchObject({
      estado_plan: 'activo',
      pago_proveedor: 'mercadopago',
    });
    expect(derechos.olvidar).toHaveBeenCalledWith(9);
  });

  it('pago vencido con suscripción viva → morosa con gracia y correo', async () => {
    const { client, consultas } = armarCliente([
      { data: [] },
      { data: [{ id: 7, name: 'La Morosa' }] },
      { data: [] },
    ]);
    const { reloj, email } = armarReloj(client);
    await reloj.cosecharCobrosVencidos();
    expect(consultas[1].update).toMatchObject({ estado_plan: 'moroso' });
    expect(consultas[1].update?.gracia_hasta).toBeDefined();
    expect(email.sendEmail).toHaveBeenCalledWith(
      'duena@sur.cl',
      expect.anything(),
      expect.objectContaining({ companyName: 'La Morosa' }),
    );
  });

  it('gracia vencida → bloqueada, sin borrar nada', async () => {
    const { client, consultas } = armarCliente([
      { data: [] },
      { data: [] },
      { data: [{ id: 5, name: 'Se le acabó la gracia' }] },
    ]);
    const { reloj, derechos } = armarReloj(client);
    await reloj.cosecharCobrosVencidos();
    expect(consultas[2].update).toMatchObject({ estado_plan: 'bloqueado' });
    expect(consultas[2].eq).toMatchObject({ estado_plan: 'moroso' });
    expect(derechos.olvidar).toHaveBeenCalledWith(5);
  });

  it('la prueba por vencer avisa una vez, al administrador', async () => {
    const { client } = armarCliente([
      {
        data: [
          { id: 3, name: 'Recién Llegada', prueba_vence: '2026-09-18T12:00:00Z' },
        ],
      },
    ]);
    const { reloj, email } = armarReloj(client);
    await reloj.avisarPruebasPorVencer();
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    expect(email.sendEmail).toHaveBeenCalledWith(
      'duena@sur.cl',
      expect.anything(),
      expect.objectContaining({ companyName: 'Recién Llegada' }),
    );
  });
});
