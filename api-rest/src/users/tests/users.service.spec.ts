import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { SuperAdminService } from 'src/super-admin/super-admin.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { SignupDto } from '../dto/signup.dto';
import { UpdatePasswordDto } from '../dto/update-password.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserRole } from '../entities/user.entity';
import { UsersRepository } from '../users.repository';
import { UsersService } from '../users.service';

describe('UsersService', () => {
  let service: UsersService;
  let repositoryMock: jest.Mocked<UsersRepository>;
  let superAdminServiceMock: jest.Mocked<SuperAdminService>;
  let loggerMock: jest.Mocked<PinoLogger>;

  const companyId = 1;

  beforeEach(async () => {
    repositoryMock = {
      createAuthUser: jest.fn(),
      createUser: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      removeAuthUser: jest.fn(),
      updatePassword: jest.fn(),
    } as any;

    superAdminServiceMock = {
      createSuscription: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: repositoryMock },
        { provide: SuperAdminService, useValue: superAdminServiceMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create()', () => {
    const dto: CreateUserDto = {
      email: 'user@test.com',
      password: 'secret',
      full_name: 'User Test',
      role: UserRole.VENDEDOR,
    };

    it('creates the auth user, then persists the profile scoped to the company without the password', async () => {
      repositoryMock.createAuthUser.mockResolvedValue({
        data: { user: { id: 'auth-uuid' } },
        error: null,
      } as any);
      repositoryMock.createUser.mockResolvedValue({
        data: { id: 'profile-id' },
        error: null,
      } as any);

      const result = await service.create(dto, companyId);

      expect(repositoryMock.createAuthUser).toHaveBeenCalledWith(dto);
      expect(repositoryMock.createUser).toHaveBeenCalledWith({
        email: dto.email,
        full_name: dto.full_name,
        role: dto.role,
        user_id: 'auth-uuid',
        company_id: companyId,
      });
      // password must not be forwarded to the profile row
      expect(repositoryMock.createUser).not.toHaveBeenCalledWith(
        expect.objectContaining({ password: expect.anything() }),
      );
      expect(result).toEqual({ data: { id: 'profile-id' }, error: null });
    });

    it('throws when the auth user creation returns an error', async () => {
      repositoryMock.createAuthUser.mockResolvedValue({
        data: { user: { id: 'auth-uuid' } },
        error: new Error('auth failed'),
      } as any);

      await expect(service.create(dto, companyId)).rejects.toThrow();
      expect(repositoryMock.createUser).not.toHaveBeenCalled();
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('throws when the created auth user has no id', async () => {
      repositoryMock.createAuthUser.mockResolvedValue({
        data: { user: {} },
        error: null,
      } as any);

      await expect(service.create(dto, companyId)).rejects.toThrow(
        'User ID is required',
      );
      expect(repositoryMock.createUser).not.toHaveBeenCalled();
    });
  });

  describe('findAll()', () => {
    it('delegates to the repository with the company id and optional role', () => {
      repositoryMock.findAll.mockReturnValue([{ id: '1' }] as any);

      const result = service.findAll(companyId, UserRole.ADMINISTRADOR);

      expect(repositoryMock.findAll).toHaveBeenCalledWith(
        companyId,
        UserRole.ADMINISTRADOR,
      );
      expect(result).toEqual([{ id: '1' }]);
    });

    it('forwards an undefined role when none is provided', () => {
      service.findAll(companyId);
      expect(repositoryMock.findAll).toHaveBeenCalledWith(companyId, undefined);
    });
  });

  describe('findOne()', () => {
    it('delegates to the repository with the id', () => {
      repositoryMock.findOne.mockResolvedValue({
        data: {},
        error: null,
      } as any);
      service.findOne('abc');
      expect(repositoryMock.findOne).toHaveBeenCalledWith('abc');
    });
  });

  describe('update()', () => {
    it('delegates to the repository with the id and dto', () => {
      const dto: UpdateUserDto = { full_name: 'New Name' } as any;
      service.update('abc', dto);
      expect(repositoryMock.update).toHaveBeenCalledWith('abc', dto);
    });
  });

  describe('remove()', () => {
    it('removes the profile then the auth user and returns a success message', async () => {
      repositoryMock.remove.mockResolvedValue({ error: null } as any);
      repositoryMock.removeAuthUser.mockResolvedValue({ error: null } as any);

      const result = await service.remove('abc', companyId);

      expect(repositoryMock.remove).toHaveBeenCalledWith('abc', companyId);
      expect(repositoryMock.removeAuthUser).toHaveBeenCalledWith(
        'abc',
        companyId,
      );
      expect(result).toEqual({ message: 'User removed successfully' });
    });

    it('throws and skips auth removal when the profile removal fails', async () => {
      repositoryMock.remove.mockResolvedValue({
        error: new Error('profile boom'),
      } as any);

      await expect(service.remove('abc', companyId)).rejects.toThrow(
        'profile boom',
      );
      expect(repositoryMock.removeAuthUser).not.toHaveBeenCalled();
    });

    it('throws when the auth user removal fails', async () => {
      repositoryMock.remove.mockResolvedValue({ error: null } as any);
      repositoryMock.removeAuthUser.mockResolvedValue({
        error: new Error('auth boom'),
      } as any);

      await expect(service.remove('abc', companyId)).rejects.toThrow(
        'auth boom',
      );
    });
  });

  describe('updatePassword()', () => {
    const dto: UpdatePasswordDto = { newPassword: 'NewPass123' };

    it('delegates to the repository and returns a success payload', async () => {
      repositoryMock.updatePassword.mockResolvedValue({
        data: { id: 'auth-uuid' },
        error: null,
      } as any);

      const result = await service.updatePassword('auth-uuid', dto);

      expect(repositoryMock.updatePassword).toHaveBeenCalledWith(
        'auth-uuid',
        dto.newPassword,
      );
      expect(result).toEqual({
        message: 'Password updated successfully',
        data: { id: 'auth-uuid' },
      });
    });

    it('throws when the repository returns an error', async () => {
      repositoryMock.updatePassword.mockResolvedValue({
        data: null,
        error: { message: 'weak password' },
      } as any);

      await expect(service.updatePassword('auth-uuid', dto)).rejects.toThrow(
        'Failed to update password: weak password',
      );
    });
  });

  describe('signup()', () => {
    it('delegates to the super admin service', async () => {
      const dto: SignupDto = {
        admin_email: 'admin@test.com',
        admin_password: 'secret',
        admin_full_name: 'Admin',
        company_name: 'Acme',
        currency: 'CLP',
      } as any;
      superAdminServiceMock.createSuscription.mockResolvedValue({
        id: 1,
      } as any);

      const result = await service.signup(dto);

      expect(superAdminServiceMock.createSuscription).toHaveBeenCalledWith(dto);
      expect(result).toEqual({ id: 1 });
    });
  });
});
