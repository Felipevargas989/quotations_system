import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { ClientsRepository } from '../clients.repository';
import { ClientsService } from '../clients.service';
import { CreateClientDto } from '../dto/create-client.dto';
import { UpdateClientDto } from '../dto/update-client.dto';

describe('ClientsService', () => {
  let service: ClientsService;
  let repositoryMock: jest.Mocked<ClientsRepository>;
  let loggerMock: jest.Mocked<PinoLogger>;

  const companyId = 1;

  beforeEach(async () => {
    repositoryMock = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: ClientsRepository, useValue: repositoryMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create()', () => {
    it('scopes the client to the company before delegating to the repository', async () => {
      const dto: CreateClientDto = {
        name: 'Acme',
        email: 'acme@example.com',
        phone: '123',
        client_type: 'empresa',
      } as any;
      repositoryMock.create.mockResolvedValue({ id: 'c1' } as any);

      const result = await service.create(dto, companyId);

      expect(repositoryMock.create).toHaveBeenCalledWith({
        ...dto,
        company_id: companyId,
      });
      expect(result).toEqual({ id: 'c1' });
    });

    it('propagates repository errors', async () => {
      repositoryMock.create.mockRejectedValue(new Error('boom'));

      await expect(
        service.create({ name: 'x' } as any, companyId),
      ).rejects.toThrow('boom');
    });
  });

  describe('findAll()', () => {
    it('delegates to the repository with the company id', () => {
      repositoryMock.findAll.mockReturnValue([{ id: 'c1' }] as any);

      const result = service.findAll(companyId);

      expect(repositoryMock.findAll).toHaveBeenCalledWith(companyId);
      expect(result).toEqual([{ id: 'c1' }]);
    });
  });

  describe('findOne()', () => {
    it('forwards the company id and every optional lookup filter', async () => {
      repositoryMock.findOne.mockResolvedValue({ data: { id: 5 } } as any);

      const result = await service.findOne(companyId, 5, 'a@b.com', '555');

      expect(repositoryMock.findOne).toHaveBeenCalledWith(
        companyId,
        5,
        'a@b.com',
        '555',
      );
      expect(result).toEqual({ data: { id: 5 } });
    });

    it('logs and rethrows when the repository lookup fails', async () => {
      const error = new Error('not found');
      repositoryMock.findOne.mockRejectedValue(error);

      await expect(service.findOne(companyId, 5)).rejects.toThrow('not found');
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('update()', () => {
    it('delegates the id, dto and company id to the repository', () => {
      const dto: UpdateClientDto = { name: 'New' } as any;
      repositoryMock.update.mockReturnValue({ id: 'c1' } as any);

      const result = service.update('c1', dto, companyId);

      expect(repositoryMock.update).toHaveBeenCalledWith('c1', dto, companyId);
      expect(result).toEqual({ id: 'c1' });
    });
  });

  describe('remove()', () => {
    it('delegates the id and company id to the repository', () => {
      repositoryMock.remove.mockReturnValue({ id: 'c1' } as any);

      const result = service.remove('c1', companyId);

      expect(repositoryMock.remove).toHaveBeenCalledWith('c1', companyId);
      expect(result).toEqual({ id: 'c1' });
    });
  });
});
