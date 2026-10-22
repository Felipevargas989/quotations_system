import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { ClientsService } from 'src/clients/clients.service';
import { ConsultasService } from 'src/consultas/consultas.service';
import { EmailService } from 'src/email/email.service';
import { PaymentsService } from 'src/payments/payments.service';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { RefundsService } from 'src/refunds/refunds.service';
import { StorageService } from 'src/storage/storage.service';
import { UsersService } from 'src/users/users.service';
import { PortalReceiptsRepository } from '../../portal-receipts.controller';
import {
  QuotationsService,
  mensajeDelFormulario,
} from '../../quotations.service';

/**
 * EL FORMULARIO PÚBLICO NO ESCRIBE EN LO QUE VE EL CLIENTE (Felipe,
 * 19-10-2026). Observaciones salen en el PDF: parten en blanco. Lo que
 * escribió el visitante, con su presupuesto, va al comentario interno.
 */
describe('El requerimiento que llega del formulario público', () => {
  let service: QuotationsService;
  let crear: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotationsService,
        { provide: QuotationsRepository, useValue: {} },
        { provide: RefundsService, useValue: {} },
        { provide: PaymentsService, useValue: {} },
        {
          provide: ClientsService,
          useValue: {
            findMatch: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ id: 'c1' }),
          },
        },
        { provide: EmailService, useValue: { sendEmail: jest.fn() } },
        { provide: UsersService, useValue: {} },
        { provide: StorageService, useValue: {} },
        {
          provide: ConsultasService,
          useValue: { embudoPara: jest.fn().mockResolvedValue(false) },
        },
        { provide: PortalReceiptsRepository, useValue: {} },
        {
          provide: PinoLogger,
          useValue: {
            setContext: jest.fn(),
            error: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get<QuotationsService>(QuotationsService);
    // Lo que importa es lo que se manda a guardar: el resto del camino
    // (correos) no corre si `create` no devuelve fila.
    crear = jest.spyOn(service, 'create').mockResolvedValue(null as never);
  });

  const solicitud = (extra: Record<string, unknown> = {}) =>
    ({
      event_type: 'Paseo fin de año',
      name: 'Bastián',
      email: 'bastian@ejemplo.cl',
      phone: '+56911111111',
      event_date: '2026-11-05',
      people_count: 70,
      ...extra,
    }) as never;

  it('deja Observaciones en blanco y el mensaje con el presupuesto en el comentario interno', async () => {
    await service.createPublic(
      solicitud({
        observations: 'Somos 70, con almuerzo',
        budget_estimate: 2000000,
      }),
      1,
    );
    const dto = (crear.mock.calls[0] as unknown[])[0] as {
      observations: string;
      comentario_interno: string | null;
    };
    expect(dto.observations).toBe('');
    expect(dto.comentario_interno).toContain(
      'Mensaje del cliente en el formulario público',
    );
    expect(dto.comentario_interno).toContain('Somos 70, con almuerzo');
    expect(dto.comentario_interno).toContain(
      'Presupuesto estimado: $2.000.000',
    );
    expect(dto.observations).not.toContain('Desde formulario');
  });

  it('si el visitante no escribió nada, los dos campos quedan vacíos', async () => {
    await service.createPublic(solicitud({ observations: '   ' }), 1);
    const dto = (crear.mock.calls[0] as unknown[])[0] as {
      observations: string;
      comentario_interno: string | null;
    };
    expect(dto.observations).toBe('');
    expect(dto.comentario_interno).toBeNull();
  });

  it('mensajeDelFormulario: sin texto no inventa un rótulo vacío', () => {
    expect(mensajeDelFormulario(undefined)).toBeNull();
    expect(mensajeDelFormulario('')).toBeNull();
    expect(mensajeDelFormulario('Hola')).toBe(
      'Mensaje del cliente en el formulario público:\nHola',
    );
  });
});
