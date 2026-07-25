import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { CompaniesController } from '../companies.controller';
import { CompaniesService } from '../companies.service';
import { UpdateCompanyDto } from '../dto/update-company.dto';

describe('CompaniesController', () => {
  let controller: CompaniesController;
  let serviceMock: jest.Mocked<CompaniesService>;
  let loggerMock: jest.Mocked<PinoLogger>;

  const user = { id: 10, company_id: 1 } as any;

  beforeEach(async () => {
    serviceMock = {
      findOne: jest.fn(),
      update: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompaniesController],
      providers: [
        { provide: CompaniesService, useValue: serviceMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    controller = module.get<CompaniesController>(CompaniesController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findOne coerces the id to a number and delegates to the service', () => {
    controller.findOne('5');
    expect(serviceMock.findOne).toHaveBeenCalledWith(5);
  });

  it('findOne logs the incoming request', () => {
    controller.findOne('5');
    expect(loggerMock.info).toHaveBeenCalledWith('GET /companies/5');
  });

  it('update forwards the user company id and the dto', () => {
    const dto: UpdateCompanyDto = { name: 'New name' } as any;
    controller.update(user, dto);
    expect(serviceMock.update).toHaveBeenCalledWith(user.company_id, dto);
  });
});
