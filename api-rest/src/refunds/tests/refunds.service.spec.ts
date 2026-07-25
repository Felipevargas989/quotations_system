import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { CreateRefundDto } from '../dto/create-refund.dto';
import { RefundsRepository } from '../refunds.repository';
import { RefundsService } from '../refunds.service';

describe('RefundsService', () => {
  let service: RefundsService;
  let repositoryMock: jest.Mocked<RefundsRepository>;
  let loggerMock: jest.Mocked<PinoLogger>;

  const companyId = 1;

  beforeEach(async () => {
    repositoryMock = {
      create: jest.fn(),
      findAll: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundsService,
        { provide: RefundsRepository, useValue: repositoryMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    service = module.get<RefundsService>(RefundsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create()', () => {
    it('marks the refund as unpaid and delegates to the repository', async () => {
      const dto: CreateRefundDto = {
        amount: 100,
        quotation_id: 'q1',
      } as any;
      repositoryMock.create.mockResolvedValue({ data: { id: 1 } } as any);

      const result = await service.create(dto);

      expect(repositoryMock.create).toHaveBeenCalledWith({
        ...dto,
        is_paid: false,
      });
      expect(result).toEqual({ data: { id: 1 } });
    });

    it('logs and rethrows when the repository rejects', async () => {
      const dto: CreateRefundDto = {
        amount: 100,
        quotation_id: 'q1',
      } as any;
      const error = new Error('boom');
      repositoryMock.create.mockRejectedValue(error);

      await expect(service.create(dto)).rejects.toThrow('boom');
      expect(loggerMock.error).toHaveBeenCalledWith(error);
    });
  });

  describe('findAll()', () => {
    it('delegates to the repository scoped by company id', async () => {
      repositoryMock.findAll.mockResolvedValue({ data: [{ id: 1 }] } as any);

      const result = await service.findAll(companyId);

      expect(repositoryMock.findAll).toHaveBeenCalledWith(companyId);
      expect(result).toEqual({ data: [{ id: 1 }] });
    });

    it('logs and rethrows when the repository rejects', async () => {
      const error = new Error('boom');
      repositoryMock.findAll.mockRejectedValue(error);

      await expect(service.findAll(companyId)).rejects.toThrow('boom');
      expect(loggerMock.error).toHaveBeenCalledWith(error);
    });
  });
});
