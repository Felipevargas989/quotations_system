import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { CreateUserDto } from '../dto/create-user.dto';
import { SignupDto } from '../dto/signup.dto';
import { UpdatePasswordDto } from '../dto/update-password.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserRole } from '../entities/user.entity';
import { UsersController } from '../users.controller';
import { UsersService } from '../users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let serviceMock: jest.Mocked<UsersService>;
  let loggerMock: jest.Mocked<PinoLogger>;

  const user = { id: 'user-uuid', company_id: 1 } as any;

  beforeEach(async () => {
    serviceMock = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      updatePassword: jest.fn(),
      signup: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: serviceMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create forwards the dto and the user company id', () => {
    const dto: CreateUserDto = {
      email: 'user@test.com',
      password: 'secret',
      full_name: 'User',
      role: UserRole.VENDEDOR,
    };
    controller.create(dto, user);
    expect(serviceMock.create).toHaveBeenCalledWith(dto, user.company_id);
  });

  it('findAll forwards the user company id', () => {
    controller.findAll(user);
    expect(serviceMock.findAll).toHaveBeenCalledWith(user.company_id);
  });

  it('updatePassword forwards the user id and dto', () => {
    const dto: UpdatePasswordDto = { newPassword: 'NewPass123' };
    controller.updatePassword(dto, user);
    expect(serviceMock.updatePassword).toHaveBeenCalledWith(user.id, dto);
  });

  it('findOne forwards the id', () => {
    controller.findOne('abc');
    expect(serviceMock.findOne).toHaveBeenCalledWith('abc');
  });

  it('update forwards the id and dto', () => {
    const dto: UpdateUserDto = { full_name: 'New Name' } as any;
    controller.update('abc', dto);
    expect(serviceMock.update).toHaveBeenCalledWith('abc', dto);
  });

  it('remove forwards the id and the user company id', () => {
    controller.remove('abc', user);
    expect(serviceMock.remove).toHaveBeenCalledWith('abc', user.company_id);
  });

  it('signup forwards the dto', () => {
    const dto: SignupDto = {
      admin_email: 'admin@test.com',
      admin_password: 'secret',
      admin_full_name: 'Admin',
      company_name: 'Acme',
      currency: 'CLP',
    } as any;
    controller.signup(dto);
    expect(serviceMock.signup).toHaveBeenCalledWith(dto);
  });
});
