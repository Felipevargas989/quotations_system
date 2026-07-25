import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { CompaniesRepository } from '../companies.repository';
import { CompaniesService } from '../companies.service';
import { UpdateCompanyDto } from '../dto/update-company.dto';

describe('CompaniesService', () => {
  let service: CompaniesService;
  let repositoryMock: jest.Mocked<CompaniesRepository>;
  let loggerMock: jest.Mocked<PinoLogger>;

  const companyId = 1;

  beforeEach(async () => {
    repositoryMock = {
      create: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        { provide: CompaniesRepository, useValue: repositoryMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    service = module.get<CompaniesService>(CompaniesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne()', () => {
    it('delegates to the repository and returns its result', async () => {
      const expected = { data: { id: companyId, name: 'Acme' }, error: null };
      repositoryMock.findOne.mockResolvedValue(expected as any);

      const result = await service.findOne(companyId);

      expect(repositoryMock.findOne).toHaveBeenCalledWith(companyId);
      expect(result).toBe(expected);
    });

    it('logs and rethrows when the repository rejects', async () => {
      const error = new Error('boom');
      repositoryMock.findOne.mockRejectedValue(error);

      await expect(service.findOne(companyId)).rejects.toThrow('boom');
      expect(loggerMock.error).toHaveBeenCalledWith(error);
    });
  });

  describe('update()', () => {
    it('delegates the id and dto to the repository and returns its result', async () => {
      const dto: UpdateCompanyDto = { name: 'New name' } as any;
      const expected = {
        data: { id: companyId, name: 'New name' },
        error: null,
      };
      repositoryMock.update.mockResolvedValue(expected as any);

      const result = await service.update(companyId, dto);

      expect(repositoryMock.update).toHaveBeenCalledWith(companyId, dto);
      expect(result).toBe(expected);
    });

    it('logs and rethrows when the repository rejects', async () => {
      const dto: UpdateCompanyDto = { name: 'New name' } as any;
      const error = new Error('boom');
      repositoryMock.update.mockRejectedValue(error);

      await expect(service.update(companyId, dto)).rejects.toThrow('boom');
      expect(loggerMock.error).toHaveBeenCalledWith(error);
    });
  });
});
