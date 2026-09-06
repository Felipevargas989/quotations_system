// El navegador invisible y el cartero, de mentira: estas pruebas miran
// la ORQUESTACIÓN del envío (portero, correo, bitácora), no a Chromium
// ni a Resend.
const enviarResend = jest.fn().mockResolvedValue({ error: null });
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: enviarResend },
  })),
}));
const pdfDeMentira = jest.fn().mockResolvedValue(Buffer.from('pdf'));
const cerrarNavegador = jest.fn();
jest.mock('puppeteer-core', () => ({
  launch: jest.fn().mockImplementation(() =>
    Promise.resolve({
      newPage: () =>
        Promise.resolve({
          goto: jest.fn().mockResolvedValue(undefined),
          waitForSelector: jest.fn().mockResolvedValue(undefined),
          evaluate: jest.fn().mockResolvedValue(undefined),
          pdf: pdfDeMentira,
        }),
      close: cerrarNavegador,
    }),
  ),
}));
jest.mock('@sparticuz/chromium', () => ({
  args: [],
  executablePath: jest.fn().mockResolvedValue('/bin/chromium'),
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ClientContactsRepository } from 'src/clients/client-contacts.controller';
import type { CompaniesRepository } from 'src/companies/companies.repository';
import type { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import type { User } from 'src/users/entities/user.entity';
import { EnvioCotizacionService } from '../../envio-cotizacion.service';
import type { QuotationsRepository } from '../../quotations.repository';

const USUARIO = { id: 'u-1', company_id: 1, email: 'vende@x.cl' } as User;

const COTIZACION = {
  id: 'q-1',
  quotation_number: 42,
  company_id: 1,
  client_id: 'cli-1',
  client_contact_id: 7,
  contact_name: 'Ana Soto',
  people_count: 10,
  event_type: 'Matrimonio',
  event_date: '2026-03-14',
  created_at: '2026-02-01',
  total_amount: 1_190_000,
  subtotal_amount: 1_190_000,
  items: {
    variable_services: [],
    fixed_services: [{ nombre: 'Salón', precio: 1_000_000, quantity: 1 }],
  },
  clients: { name: 'Cliente Demo', email: 'cliente@x.cl' },
};

const armar = (sobre?: {
  quotation?: Record<string, unknown> | null;
  contactos?: Record<string, unknown>[];
  followup?: jest.Mock;
}) => {
  const repo = {
    findOne: jest
      .fn()
      .mockResolvedValue({ data: sobre?.quotation ?? COTIZACION }),
    cartaDelCatalogo: jest.fn().mockResolvedValue(null),
  };
  const contactos = {
    findByClient: jest
      .fn()
      .mockResolvedValue(
        sobre?.contactos ?? [{ id: 7, name: 'Ana Soto', email: 'ana@x.cl' }],
      ),
  };
  const companies = {
    findOne: jest.fn().mockResolvedValue({
      data: { name: 'Valle del Sol', colors: { primary: '#134686' } },
      error: null,
    }),
  };
  const followups = { create: sobre?.followup ?? jest.fn() };
  const config = {
    get: jest.fn().mockImplementation((k: string) => {
      if (k === 'RESEND_API_KEY') return 'clave';
      if (k === 'FRONTEND_URL') return 'https://lab.eventi-app.com';
      return undefined;
    }),
  };
  const logger = { setContext: jest.fn(), info: jest.fn(), error: jest.fn() };
  const service = new EnvioCotizacionService(
    repo as unknown as QuotationsRepository,
    contactos as unknown as ClientContactsRepository,
    companies as unknown as CompaniesRepository,
    followups as unknown as QuotationFollowupsService,
    config as never,
    logger as never,
  );
  return { service, repo, contactos, followups };
};

beforeEach(() => {
  enviarResend.mockClear();
  pdfDeMentira.mockClear();
  cerrarNavegador.mockClear();
});

describe('enviar cotización por correo', () => {
  it('el circuito feliz: PDF adjunto, correo al contacto y bitácora', async () => {
    const { service, followups } = armar({});
    const r = await service.enviar('q-1', USUARIO);
    expect(r.enviado_a).toBe('ana@x.cl');
    expect(pdfDeMentira).toHaveBeenCalled();
    expect(cerrarNavegador).toHaveBeenCalled();
    const llamada = (enviarResend.mock.calls as unknown[][])[0][0] as {
      to: string[];
      subject: string;
      attachments: { filename: string }[];
      replyTo?: string;
    };
    expect(llamada.to).toEqual(['ana@x.cl']);
    expect(llamada.subject).toContain('sábado 14 de marzo de 2026');
    expect(llamada.attachments[0].filename).toBe(
      'Cotizacion_N42_ValledelSol.pdf',
    );
    // Sin replyTo de la empresa, responde el vendedor.
    expect(llamada.replyTo).toBe('vende@x.cl');
    expect(followups.create).toHaveBeenCalledWith(
      USUARIO,
      expect.objectContaining({ tipo: 'correo' }),
    );
  });

  it('sin contacto con correo cae al correo del cliente', async () => {
    const { service } = armar({ contactos: [] });
    const r = await service.enviar('q-1', USUARIO);
    expect(r.enviado_a).toBe('cliente@x.cl');
  });

  it('el portero frena ANTES de imprimir: sin correo ninguno', async () => {
    const { service } = armar({
      quotation: { ...COTIZACION, clients: { name: 'X', email: null } },
      contactos: [],
    });
    await expect(service.enviar('q-1', USUARIO)).rejects.toThrow(
      BadRequestException,
    );
    expect(pdfDeMentira).not.toHaveBeenCalled();
    expect(enviarResend).not.toHaveBeenCalled();
  });

  it('cotización de otra empresa: 404 sin pistas', async () => {
    const { service } = armar({
      quotation: { ...COTIZACION, company_id: 2 },
    });
    await expect(service.enviar('q-1', USUARIO)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('si la bitácora falla, el envío NO se rompe (el correo ya salió)', async () => {
    const { service } = armar({
      followup: jest.fn().mockRejectedValue(new Error('se cayó')),
    });
    const r = await service.enviar('q-1', USUARIO);
    expect(r.enviado_a).toBe('ana@x.cl');
  });

  it('la hoja pública exige token válido: basura = 404', async () => {
    const { service } = armar({});
    await expect(service.hojaParaImprimir('basura')).rejects.toThrow(
      NotFoundException,
    );
  });
});
