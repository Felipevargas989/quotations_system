import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { CreateServiceGroupCollectionDto } from '../dto/create-service-group-collection.dto';
import { ServiceGroupCollectionsRepository } from '../service-group-collections.repository';
import { ServiceGroupCollectionsService } from '../service-group-collections.service';

describe('ServiceGroupCollectionsService', () => {
  let service: ServiceGroupCollectionsService;
  let repositoryMock: jest.Mocked<ServiceGroupCollectionsRepository>;
  let loggerMock: jest.Mocked<PinoLogger>;

  const companyId = 1;

  beforeEach(async () => {
    repositoryMock = {
      createCollection: jest.fn(),
      createCollectionItems: jest.fn(),
      findAll: jest.fn(),
      removeCollection: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceGroupCollectionsService,
        {
          provide: ServiceGroupCollectionsRepository,
          useValue: repositoryMock,
        },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    service = module.get<ServiceGroupCollectionsService>(
      ServiceGroupCollectionsService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create()', () => {
    const dto: CreateServiceGroupCollectionDto = {
      name: 'Paquete Boda',
      items: [{ service_group_id: 11 }, { service_group_id: 22 }],
    };

    it('scopes the collection to the company and links the service groups to the new id', async () => {
      repositoryMock.createCollection.mockResolvedValue({
        data: { id: 99 },
        error: null,
      } as any);
      repositoryMock.createCollectionItems.mockResolvedValue({
        error: null,
      } as any);

      const result = await service.create(dto, companyId);

      expect(repositoryMock.createCollection).toHaveBeenCalledWith({
        name: dto.name,
        company_id: companyId,
      });
      expect(repositoryMock.createCollectionItems).toHaveBeenCalledWith([
        { collection_id: 99, service_group_id: 11 },
        { collection_id: 99, service_group_id: 22 },
      ]);
      expect(result).toEqual({ id: 99 });
    });

    it('throws an HttpException when the collection insert fails', async () => {
      repositoryMock.createCollection.mockResolvedValue({
        data: null,
        error: new Error('collection boom'),
      } as any);

      await expect(service.create(dto, companyId)).rejects.toBeInstanceOf(
        HttpException,
      );
      expect(repositoryMock.createCollectionItems).not.toHaveBeenCalled();
    });

    it('throws an HttpException when linking the items fails', async () => {
      repositoryMock.createCollection.mockResolvedValue({
        data: { id: 99 },
        error: null,
      } as any);
      repositoryMock.createCollectionItems.mockResolvedValue({
        error: new Error('items boom'),
      } as any);

      await expect(service.create(dto, companyId)).rejects.toBeInstanceOf(
        HttpException,
      );
    });
  });

  describe('findAll()', () => {
    it('returns the data scoped to the company', async () => {
      repositoryMock.findAll.mockResolvedValue({
        data: [{ id: 1 }, { id: 2 }],
        error: null,
      } as any);

      const result = await service.findAll(companyId);

      expect(repositoryMock.findAll).toHaveBeenCalledWith(companyId);
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('throws when the repository returns an error', async () => {
      repositoryMock.findAll.mockResolvedValue({
        data: null,
        error: new Error('boom'),
      } as any);

      await expect(service.findAll(companyId)).rejects.toThrow();
    });
  });

  describe('remove()', () => {
    it('delegates to the repository', async () => {
      repositoryMock.removeCollection.mockResolvedValue({ error: null } as any);

      await service.remove(5);

      expect(repositoryMock.removeCollection).toHaveBeenCalledWith(5);
    });
  });
});
