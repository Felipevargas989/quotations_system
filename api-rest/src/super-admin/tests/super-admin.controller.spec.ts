import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { CreateSuscriptionDto } from '../dto/create-suscription.dto';
import { NotifySuperAdminDto } from '../dto/notify-super-admin.dto';
import { SuperAdminController } from '../super-admin.controller';
import { SuperAdminService } from '../super-admin.service';

describe('SuperAdminController', () => {
  let controller: SuperAdminController;
  let serviceMock: jest.Mocked<SuperAdminService>;
  let loggerMock: jest.Mocked<PinoLogger>;

  beforeEach(async () => {
    serviceMock = {
      createSuscription: jest.fn(),
      getStatsLastMonth: jest.fn(),
      notifySuperAdmins: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SuperAdminController],
      providers: [
        { provide: SuperAdminService, useValue: serviceMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    controller = module.get<SuperAdminController>(SuperAdminController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('createSuscription delegates the dto to the service', () => {
    const dto = { company_name: 'Acme' } as CreateSuscriptionDto;
    const expected = { userData: {}, companyData: {} };
    serviceMock.createSuscription.mockReturnValue(expected as any);

    const result = controller.createSuscription(dto);

    expect(serviceMock.createSuscription).toHaveBeenCalledWith(dto);
    expect(result).toBe(expected);
  });

  it('getStatsLastMonth delegates to the service', () => {
    const expected = { period: 'x' };
    serviceMock.getStatsLastMonth.mockReturnValue(expected as any);

    const result = controller.getStatsLastMonth();

    expect(serviceMock.getStatsLastMonth).toHaveBeenCalledTimes(1);
    expect(result).toBe(expected);
  });

  it('notifySuperAdmins delegates the dto to the service', () => {
    const dto = { content: 'hi' } as NotifySuperAdminDto;
    const expected = { success: true };
    serviceMock.notifySuperAdmins.mockReturnValue(expected as any);

    const result = controller.notifySuperAdmins(dto);

    expect(serviceMock.notifySuperAdmins).toHaveBeenCalledWith(dto);
    expect(result).toBe(expected);
  });
});
