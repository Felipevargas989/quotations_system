import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { QuotationStatus, RequestType } from '../constants/constants';
import { QuotationsController } from '../quotations.controller';
import { QuotationsService } from '../quotations.service';

describe('QuotationsController', () => {
  let controller: QuotationsController;
  let serviceMock: jest.Mocked<QuotationsService>;
  let loggerMock: jest.Mocked<PinoLogger>;

  const user = { id: 10, company_id: 1 } as any;

  beforeEach(async () => {
    serviceMock = {
      create: jest.fn(),
      createPublic: jest.fn(),
      findAll: jest.fn(),
      checkConflictsWithExistingQuotations: jest.fn(),
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
      controllers: [QuotationsController],
      providers: [
        { provide: QuotationsService, useValue: serviceMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    controller = module.get<QuotationsController>(QuotationsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create forwards the dto, the user company id and the user id', () => {
    const dto = { event_type: 'Matrimonios' } as any;
    controller.create(dto, user);
    expect(serviceMock.create).toHaveBeenCalledWith(
      dto,
      user.company_id,
      user.id,
    );
  });

  it('createPublic forwards the dto and the company id from the param', () => {
    const dto = { client: { name: 'x' } } as any;
    controller.createPublic(dto, 7 as any);
    expect(serviceMock.createPublic).toHaveBeenCalledWith(dto, 7);
  });

  it('findAll forwards the user company id and the query params', () => {
    const query = {
      request_type: RequestType.COTIZACION,
      statuses: [QuotationStatus.ACEPTADA],
      sort_by: 'created_at',
      sort_order: 'desc',
    } as any;
    controller.findAll(user, query);
    expect(serviceMock.findAll).toHaveBeenCalledWith({
      companyId: user.company_id,
      request_type: query.request_type,
      statuses: query.statuses,
      sort_by: query.sort_by,
      sort_order: query.sort_order,
    });
  });

  it('checkConflictsWithExistingQuotations forwards the params and the user company id', () => {
    const params = { event_date: '2026-01-01' } as any;
    controller.checkConflictsWithExistingQuotations(params, user);
    expect(
      serviceMock.checkConflictsWithExistingQuotations,
    ).toHaveBeenCalledWith(params, user.company_id);
  });

  it('findOne forwards the id', () => {
    controller.findOne('abc');
    expect(serviceMock.findOne).toHaveBeenCalledWith('abc');
  });

  it('update forwards the id, the dto and the user company id', () => {
    const dto = { quotation_status: QuotationStatus.ENVIADA } as any;
    controller.update('abc', dto, user);
    expect(serviceMock.update).toHaveBeenCalledWith(
      'abc',
      dto,
      user.company_id,
    );
  });

  it('remove forwards the id and the user company id', () => {
    controller.remove('abc', user);
    expect(serviceMock.remove).toHaveBeenCalledWith('abc', user.company_id);
  });
});
