import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { CreateServiceGroupDto } from '../dto/create-service-group.dto';
import { ServiceGroupsRepository } from '../service-groups.repository';
import { ServiceGroupsService } from '../service-groups.service';

describe('ServiceGroupsService', () => {
  let service: ServiceGroupsService;
  let repositoryMock: jest.Mocked<ServiceGroupsRepository>;
  let loggerMock: jest.Mocked<PinoLogger>;

  const companyId = 1;

  beforeEach(async () => {
    repositoryMock = {
      createGroup: jest.fn(),
      createGroupItems: jest.fn(),
      findAll: jest.fn(),
      removeGroup: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceGroupsService,
        { provide: ServiceGroupsRepository, useValue: repositoryMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    service = module.get<ServiceGroupsService>(ServiceGroupsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create()', () => {
    const dto: CreateServiceGroupDto = {
      name: 'Group',
      category: 'cat',
      items: [
        { variable_service_id: 11, quantity: 2 },
        { variable_service_id: 22, quantity: 3 },
      ],
    };

    it('scopes the group to the company and persists the group and its items', async () => {
      repositoryMock.createGroup.mockResolvedValue({
        data: { id: 99 },
        error: null,
      } as any);
      repositoryMock.createGroupItems.mockResolvedValue({ error: null } as any);

      const result = await service.create(dto, companyId);

      expect(repositoryMock.createGroup).toHaveBeenCalledWith({
        name: 'Group',
        category: 'cat',
        company_id: companyId,
      });
      expect(repositoryMock.createGroupItems).toHaveBeenCalledWith([
        { group_id: 99, variable_service_id: 11, quantity: 2 },
        { group_id: 99, variable_service_id: 22, quantity: 3 },
      ]);
      expect(result).toEqual({ id: 99 });
    });

    it('throws an HttpException when the group creation fails', async () => {
      repositoryMock.createGroup.mockResolvedValue({
        data: null,
        error: new Error('group boom'),
      } as any);

      await expect(service.create(dto, companyId)).rejects.toBeInstanceOf(
        HttpException,
      );
      expect(repositoryMock.createGroupItems).not.toHaveBeenCalled();
    });

    it('throws an HttpException when the items creation fails', async () => {
      repositoryMock.createGroup.mockResolvedValue({
        data: { id: 99 },
        error: null,
      } as any);
      repositoryMock.createGroupItems.mockResolvedValue({
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
        data: [{ id: 1 }],
        error: null,
      } as any);

      const result = await service.findAll(companyId);

      expect(repositoryMock.findAll).toHaveBeenCalledWith(companyId);
      expect(result).toEqual([{ id: 1 }]);
    });

    it('throws when the repository lookup returns an error', async () => {
      repositoryMock.findAll.mockResolvedValue({
        data: null,
        error: new Error('boom'),
      } as any);

      await expect(service.findAll(companyId)).rejects.toThrow();
    });
  });

  describe('remove()', () => {
    it('delegates to the repository with the id', async () => {
      repositoryMock.removeGroup.mockResolvedValue({ error: null } as any);

      await service.remove(5);

      expect(repositoryMock.removeGroup).toHaveBeenCalledWith(5);
    });
  });
});
