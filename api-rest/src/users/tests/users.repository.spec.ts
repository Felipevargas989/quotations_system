import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { UserRole } from '../entities/user.entity';
import { UsersRepository } from '../users.repository';

/**
 * Builds a chainable Supabase query-builder mock. Every builder method returns
 * the same object so calls like `.from().select().eq().single()` work, and each
 * method is a jest.fn so the exact table/columns/filters can be asserted.
 * The builder is also its own resolved value when awaited directly (as in
 * findAll), so tests can seed `builder.data` / `builder.error`.
 */
const createQueryBuilder = () => {
  const builder: any = {};
  for (const method of [
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'single',
  ]) {
    builder[method] = jest.fn(() => builder);
  }
  return builder;
};

describe('UsersRepository', () => {
  let repository: UsersRepository;
  let builder: ReturnType<typeof createQueryBuilder>;
  let fromMock: jest.Mock;
  let authMock: {
    signUp: jest.Mock;
    admin: { deleteUser: jest.Mock; updateUserById: jest.Mock };
  };

  const companyId = 1;

  beforeEach(async () => {
    builder = createQueryBuilder();
    fromMock = jest.fn(() => builder);
    authMock = {
      signUp: jest.fn(),
      admin: {
        deleteUser: jest.fn(),
        updateUserById: jest.fn(),
      },
    };

    const supabaseMock = {
      client: { from: fromMock, auth: authMock },
    } as any;
    const loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersRepository,
        { provide: SupabaseService, useValue: supabaseMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    repository = module.get<UsersRepository>(UsersRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('findOne()', () => {
    it('selects the profile joined with its company scoped by user_id', async () => {
      await repository.findOne('user-uuid');

      expect(fromMock).toHaveBeenCalledWith('user_profiles');
      expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-uuid');
      expect(builder.single).toHaveBeenCalled();
    });
  });

  describe('findAll()', () => {
    it('scopes the query by company_id and role when both are provided', async () => {
      await repository.findAll(companyId, UserRole.VENDEDOR);

      expect(fromMock).toHaveBeenCalledWith('user_profiles');
      expect(builder.select).toHaveBeenCalledWith('*');
      expect(builder.eq).toHaveBeenCalledWith('company_id', companyId);
      expect(builder.eq).toHaveBeenCalledWith('role', UserRole.VENDEDOR);
    });

    it('does not filter by company_id when it is undefined', async () => {
      await repository.findAll(undefined);

      expect(builder.eq).not.toHaveBeenCalledWith(
        'company_id',
        expect.anything(),
      );
    });

    it('throws when the query returns an error', async () => {
      builder.error = new Error('boom');

      await expect(repository.findAll(companyId)).rejects.toThrow('boom');
    });

    it('returns the data rows on success', async () => {
      builder.data = [{ id: '1' }];
      builder.error = null;

      const result = await repository.findAll(companyId);

      expect(result).toEqual([{ id: '1' }]);
    });
  });

  describe('createAuthUser()', () => {
    it('signs up the user with email and password', async () => {
      const dto = {
        email: 'user@test.com',
        password: 'secret',
        full_name: 'User',
        role: UserRole.VENDEDOR,
      } as any;

      await repository.createAuthUser(dto);

      expect(authMock.signUp).toHaveBeenCalledWith({
        email: dto.email,
        password: dto.password,
      });
    });
  });

  describe('createUser()', () => {
    it('inserts the profile row and returns a single record', async () => {
      const createUser = {
        email: 'user@test.com',
        full_name: 'User',
        role: UserRole.VENDEDOR,
        user_id: 'auth-uuid',
        company_id: companyId,
      } as any;

      await repository.createUser(createUser);

      expect(fromMock).toHaveBeenCalledWith('user_profiles');
      expect(builder.insert).toHaveBeenCalledWith([createUser]);
      expect(builder.select).toHaveBeenCalled();
      expect(builder.single).toHaveBeenCalled();
    });
  });

  describe('update()', () => {
    it('updates the row matching the id and returns a single record', async () => {
      const dto = { full_name: 'New Name' } as any;

      await repository.update('abc', dto);

      expect(fromMock).toHaveBeenCalledWith('user_profiles');
      expect(builder.update).toHaveBeenCalledWith(dto);
      expect(builder.eq).toHaveBeenCalledWith('id', 'abc');
      expect(builder.single).toHaveBeenCalled();
    });
  });

  describe('remove()', () => {
    it('deletes the row scoped by both id and company_id', async () => {
      await repository.remove('abc', companyId);

      expect(fromMock).toHaveBeenCalledWith('user_profiles');
      expect(builder.delete).toHaveBeenCalled();
      expect(builder.eq).toHaveBeenCalledWith('id', 'abc');
      expect(builder.eq).toHaveBeenCalledWith('company_id', companyId);
    });
  });

  describe('removeAuthUser()', () => {
    it('deletes the auth user via the admin api', async () => {
      await repository.removeAuthUser('abc', companyId);

      expect(authMock.admin.deleteUser).toHaveBeenCalledWith('abc');
    });
  });

  describe('updatePassword()', () => {
    it('updates the password via the admin api', async () => {
      await repository.updatePassword('auth-uuid', 'NewPass123');

      expect(authMock.admin.updateUserById).toHaveBeenCalledWith('auth-uuid', {
        password: 'NewPass123',
      });
    });
  });
});
