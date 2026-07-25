import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { ClientsController } from '../clients.controller';
import { ClientsService } from '../clients.service';

describe('ClientsController', () => {
  let controller: ClientsController;
  let serviceMock: jest.Mocked<ClientsService>;
  let loggerMock: jest.Mocked<PinoLogger>;

  const user = { id: 10, company_id: 1 } as any;

  beforeEach(async () => {
    serviceMock = {
      create: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientsController],
      providers: [
        { provide: ClientsService, useValue: serviceMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    controller = module.get<ClientsController>(ClientsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create forwards the dto and the user company id', () => {
    const dto = {
      name: 'Acme',
      email: 'a@b.com',
      client_type: 'empresa',
    } as any;
    controller.create(dto, user);
    expect(serviceMock.create).toHaveBeenCalledWith(dto, user.company_id);
  });

  it('findAll forwards the user company id', () => {
    controller.findAll(user);
    expect(serviceMock.findAll).toHaveBeenCalledWith(user.company_id);
  });

  it('update forwards the id, dto and user company id', () => {
    const dto = { name: 'New' } as any;
    controller.update('c1', dto, user);
    expect(serviceMock.update).toHaveBeenCalledWith('c1', dto, user.company_id);
  });

  it('remove forwards the id and user company id', () => {
    controller.remove('c1', user);
    expect(serviceMock.remove).toHaveBeenCalledWith('c1', user.company_id);
  });
});
