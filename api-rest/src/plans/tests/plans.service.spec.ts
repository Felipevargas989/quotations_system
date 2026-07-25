import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { PlansRepository } from '../plans.repository';
import { PlansService } from '../plans.service';

describe('PlansService', () => {
  let service: PlansService;
  let repositoryMock: jest.Mocked<PlansRepository>;
  let loggerMock: jest.Mocked<PinoLogger>;

  const companyId = 1;

  beforeEach(async () => {
    repositoryMock = {
      confirmPlan: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlansService,
        { provide: PlansRepository, useValue: repositoryMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    service = module.get<PlansService>(PlansService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('confirmPlan()', () => {
    it('delegates to the repository with the company id and returns its result', async () => {
      const repoResult = { data: { id: companyId }, error: null } as any;
      repositoryMock.confirmPlan.mockResolvedValue(repoResult);

      const result = await service.confirmPlan(companyId);

      expect(repositoryMock.confirmPlan).toHaveBeenCalledWith(companyId);
      expect(result).toBe(repoResult);
    });

    it('wraps a repository failure in an HttpException', async () => {
      repositoryMock.confirmPlan.mockRejectedValue(new Error('boom'));

      await expect(service.confirmPlan(companyId)).rejects.toBeInstanceOf(
        HttpException,
      );
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });
});
