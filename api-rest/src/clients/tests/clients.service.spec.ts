import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { UsersRepository } from 'src/users/users.repository';
import { mockPinoLogger, provideMock } from '../../testing/mocks';
import { ClientContactsRepository } from '../client-contacts.controller';
import { ClientsRepository } from '../clients.repository';
import { CLIENTE_PARECIDO, ClientsService } from '../clients.service';

// Arma el módulo con las dependencias REALES de la clase, todas
// mockeadas. Desde el 16-10-2026 prueba también el portero de las
// pantallas: un cliente parecido a uno existente no se crea sin
// preguntar.
describe('ClientsService', () => {
  let service: ClientsService;
  const repo = {
    paraCoincidir: jest.fn(),
    create: jest.fn(),
  };
  const personas = { create: jest.fn() };
  const usuarios = { findAll: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    repo.create.mockResolvedValue({ id: 'nuevo' });
    usuarios.findAll.mockResolvedValue([
      { email: 'felipe@valledelsolquillon.cl' },
    ]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        provideMock(ClientsRepository, repo),
        provideMock(ClientContactsRepository, personas),
        provideMock(UsersRepository, usuarios),
        { provide: PinoLogger, useValue: mockPinoLogger() },
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
  });

  const dto = {
    name: 'Rejuveneciendo a la vida',
    client_type: 'Club Adulto Mayor',
    phone: '+56991644870',
    contact_person: 'René Neira',
  };

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('el portero: si el cliente se parece a uno existente, NO lo crea y devuelve las coincidencias', async () => {
    repo.paraCoincidir.mockResolvedValue([
      {
        id: 'rene',
        name: 'Rene Neira',
        client_type: 'Club Adulto Mayor',
        email: null,
        phone: null,
        personas: [
          { id: 436, name: 'Rene Neira', email: null, phone: '+56991644870' },
        ],
        ultimaCotizacion: 590,
      },
    ]);
    const intento = service.crearDesdePantalla(dto, 1);
    await expect(intento).rejects.toBeInstanceOf(ConflictException);
    await intento.catch((e: ConflictException) => {
      const cuerpo = e.getResponse() as {
        codigo: string;
        coincidencias: unknown[];
      };
      expect(cuerpo.codigo).toBe(CLIENTE_PARECIDO);
      expect(cuerpo.coincidencias).toHaveLength(1);
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('"Es otro cliente, crear igual": con confirmado crea sin preguntar y sin guardar la marca', async () => {
    await service.crearDesdePantalla({ ...dto, confirmado: true }, 1);
    expect(repo.paraCoincidir).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledTimes(1);
    const guardado = (repo.create.mock.calls as unknown[][])[0][0];
    expect(guardado).not.toHaveProperty('confirmado');
  });

  it('sin nada parecido, crea como siempre (con su persona principal)', async () => {
    repo.paraCoincidir.mockResolvedValue([]);
    const creado = await service.crearDesdePantalla(dto, 1);
    expect(creado).toEqual({ id: 'nuevo' });
    expect(personas.create).toHaveBeenCalledTimes(1);
  });
});
