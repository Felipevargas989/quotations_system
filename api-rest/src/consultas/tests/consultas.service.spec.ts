// El cartero de mentira: estas pruebas miran la LÓGICA del embudo,
// no a Resend — el envío responde ok sin salir a Internet.
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn().mockResolvedValue({ error: null }) },
  })),
}));

import type { ClientContactsRepository } from 'src/clients/client-contacts.controller';
import type { ClientsService } from 'src/clients/clients.service';
import type { CompaniesRepository } from 'src/companies/companies.repository';
import type { ConsultasRepository } from '../consultas.repository';
import { ConsultasService } from '../consultas.service';
import type { EventTypesService } from '../event-types.service';

// El embudo de consultas (05-09, doc 12): la regla de una vez, el
// correo que falla sin perder la consulta, y el convertir idempotente.

const CONFIG = {
  company_id: 1,
  event_type: 'Matrimonios',
  texto: null,
  brochures: [{ nombre: 'brochure.pdf', path: 'c1/x.pdf', bytes: 100 }],
};

const armar = (sobre: {
  repo?: Partial<Record<string, unknown>>;
  clients?: Partial<Record<string, unknown>>;
  entrada?: 'cotizacion' | 'consulta' | null;
}) => {
  const repo = {
    config: jest.fn().mockResolvedValue(CONFIG),
    crear: jest
      .fn()
      .mockImplementation((f: Record<string, unknown>) =>
        Promise.resolve({ ...f, id: 7, created_at: 'hoy' }),
      ),
    actualizar: jest
      .fn()
      .mockImplementation((_id: number, _c: number, cambios: object) =>
        Promise.resolve({ id: 7, ...cambios }),
      ),
    consultaReciente: jest.fn().mockResolvedValue(false),
    descargarBrochure: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    pendientesDeEnvio: jest.fn().mockResolvedValue([]),
    tomarEnvio: jest.fn().mockResolvedValue(true),
    una: jest.fn(),
    ...sobre.repo,
  };
  const clients = {
    findMatch: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'cli-9' }),
    ...sobre.clients,
  };
  const companies = {
    findOne: jest.fn().mockResolvedValue({ data: { name: 'Eventia' } }),
  };
  const contactos = {
    findByClient: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
  };
  const tipos = {
    entradaDe: jest.fn().mockResolvedValue(sobre.entrada ?? 'consulta'),
  };
  const config = { get: jest.fn().mockReturnValue('clave') };
  const logger = { setContext: jest.fn(), info: jest.fn(), error: jest.fn() };
  const service = new ConsultasService(
    repo as unknown as ConsultasRepository,
    tipos as unknown as EventTypesService,
    clients as unknown as ClientsService,
    contactos as unknown as ClientContactsRepository,
    companies as unknown as CompaniesRepository,
    config as never,
    logger as never,
  );
  return { service, repo, clients, contactos };
};

const DATOS = {
  name: 'María Pérez',
  email: 'maria@x.cl',
  phone: '+56911111111',
  client_type: 'Particulares',
  event_type: 'Matrimonios',
};

describe('el embudo de consultas', () => {
  it('la categoría decide: tipo cotización no filtra; tipo consulta sí, aun sin config', async () => {
    const directo = armar({ entrada: 'cotizacion' });
    expect(await directo.service.embudoPara(1, 'Matrimonios')).toBe(false);

    const sinConfig = armar({
      entrada: 'consulta',
      repo: { config: jest.fn().mockResolvedValue(null) },
    });
    expect(await sinConfig.service.embudoPara(1, 'Matrimonios')).toEqual({
      config: null,
    });
  });

  it('el delay del embudo: registrar CITA el correo a +10 min, no lo envía', async () => {
    const antes = Date.now();
    const { service, repo } = armar({});
    const c = await service.registrar(1, DATOS);
    expect(c.correo_enviado).toBe(false);
    expect(repo.descargarBrochure).not.toHaveBeenCalled();
    const citado = new Date(c.correo_programado_para as string).getTime();
    expect(citado).toBeGreaterThanOrEqual(antes + 9.9 * 60_000);
    expect(citado).toBeLessThanOrEqual(Date.now() + 10.1 * 60_000);
  });

  it('la regla de una vez: consulta repetida queda registrada SIN cita', async () => {
    const { service, repo } = armar({
      repo: { consultaReciente: jest.fn().mockResolvedValue(true) },
    });
    const c = await service.registrar(1, DATOS);
    expect(c.correo_enviado).toBe(false);
    expect(c.correo_programado_para).toBeNull();
    expect(repo.descargarBrochure).not.toHaveBeenCalled();
  });

  const PENDIENTE = {
    id: 7,
    company_id: 1,
    name: 'María Pérez',
    email: 'maria@x.cl',
    event_type: 'Matrimonios',
    correo_enviado: false,
    correo_programado_para: 'hace-rato',
  };

  it('el reloj despacha la cita: relee la config, envía y marca', async () => {
    const { service, repo } = armar({
      repo: { pendientesDeEnvio: jest.fn().mockResolvedValue([PENDIENTE]) },
    });
    await service.despacharPendientes();
    expect(repo.tomarEnvio).toHaveBeenCalledWith(7, 1);
    expect(repo.config).toHaveBeenCalledWith(1, 'Matrimonios');
    expect(repo.descargarBrochure).toHaveBeenCalled();
    expect(repo.actualizar).toHaveBeenCalledWith(7, 1, {
      correo_enviado: true,
    });
  });

  it('si otro reloj se la llevó, no se envía dos veces', async () => {
    const { service, repo } = armar({
      repo: {
        pendientesDeEnvio: jest.fn().mockResolvedValue([PENDIENTE]),
        tomarEnvio: jest.fn().mockResolvedValue(false),
      },
    });
    await service.despacharPendientes();
    expect(repo.descargarBrochure).not.toHaveBeenCalled();
    expect(repo.actualizar).not.toHaveBeenCalled();
  });

  it('si el envío del reloj falla, queda visible como no-enviada', async () => {
    const { service, repo } = armar({
      repo: {
        pendientesDeEnvio: jest.fn().mockResolvedValue([PENDIENTE]),
        descargarBrochure: jest
          .fn()
          .mockRejectedValue(new Error('storage caído')),
      },
    });
    await service.despacharPendientes();
    expect(repo.actualizar).not.toHaveBeenCalled();
  });

  it('convertir matchea al cliente existente y es idempotente', async () => {
    const consulta = {
      id: 7,
      estado: 'respondida',
      client_id: null,
      name: 'María',
      email: 'maria@x.cl',
      phone: '+569',
      client_type: 'Particulares',
    };
    const { service, clients } = armar({
      repo: { una: jest.fn().mockResolvedValue(consulta) },
      clients: { findMatch: jest.fn().mockResolvedValue({ id: 'cli-1' }) },
    });
    const r = await service.convertir(7, 1);
    expect(r.client_id).toBe('cli-1');
    expect(clients.create).not.toHaveBeenCalled();

    const yaConvertida = armar({
      repo: {
        una: jest.fn().mockResolvedValue({
          ...consulta,
          estado: 'convertida',
          client_id: 'cli-1',
        }),
      },
    });
    const r2 = await yaConvertida.service.convertir(7, 1);
    expect(r2.client_id).toBe('cli-1');
    expect(yaConvertida.clients.findMatch).not.toHaveBeenCalled();
  });

  it('cliente existente: el consultante queda como persona de contacto', async () => {
    const consulta = {
      id: 7,
      estado: 'respondida',
      client_id: null,
      name: 'María',
      email: 'maria@x.cl',
      phone: '+569',
      client_type: 'Particulares',
    };
    const { service, contactos } = armar({
      repo: { una: jest.fn().mockResolvedValue(consulta) },
      clients: { findMatch: jest.fn().mockResolvedValue({ id: 'cli-1' }) },
    });
    await service.convertir(7, 1);
    expect(contactos.create).toHaveBeenCalled();

    const yaConContacto = armar({
      repo: { una: jest.fn().mockResolvedValue(consulta) },
      clients: { findMatch: jest.fn().mockResolvedValue({ id: 'cli-1' }) },
    });
    yaConContacto.contactos.findByClient.mockResolvedValue([
      { email: 'MARIA@x.cl' },
    ]);
    await yaConContacto.service.convertir(7, 1);
    expect(yaConContacto.contactos.create).not.toHaveBeenCalled();
  });

  it('una consulta convertida no se descarta', async () => {
    const { service } = armar({
      repo: {
        una: jest.fn().mockResolvedValue({ id: 7, estado: 'convertida' }),
      },
    });
    await expect(service.descartar(7, 1)).rejects.toThrow(
      'convertida no se descarta',
    );
  });
});
