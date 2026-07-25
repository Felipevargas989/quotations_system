import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { createClient } from '@supabase/supabase-js';
import { PinoLogger } from 'nestjs-pino';
import { AuthService } from '../auth.service';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let configServiceMock: jest.Mocked<ConfigService>;
  let loggerMock: jest.Mocked<PinoLogger>;

  // Supabase auth mock reused across tests
  let supabaseAuthMock: {
    getUser: jest.Mock;
    resetPasswordForEmail: jest.Mock;
    admin: { updateUserById: jest.Mock };
  };

  const config: Record<string, string> = {
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    SUPABASE_PASSWORD_RECOVERY_REDIRECT_URL: 'https://frontend.test/reset',
  };

  beforeEach(async () => {
    supabaseAuthMock = {
      getUser: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      admin: { updateUserById: jest.fn() },
    };

    (createClient as jest.Mock).mockReturnValue({ auth: supabaseAuthMock });

    configServiceMock = {
      get: jest.fn((key: string) => config[key]),
    } as any;

    loggerMock = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('throws during construction when Supabase configuration is missing', () => {
    const brokenConfig = {
      get: jest.fn(() => undefined),
    } as any;

    expect(() => new AuthService(brokenConfig, loggerMock)).toThrow(
      'Missing Supabase configuration',
    );
  });

  describe('validateToken()', () => {
    it('returns the user id and metadata when the token is valid', async () => {
      supabaseAuthMock.getUser.mockResolvedValue({
        data: {
          user: { id: 'user-1', user_metadata: { role: 'vendedor' } },
        },
        error: null,
      });

      const result = await service.validateToken('valid-token');

      expect(supabaseAuthMock.getUser).toHaveBeenCalledWith('valid-token');
      expect(result).toEqual({ id: 'user-1', role: 'vendedor' });
    });

    it('throws UnauthorizedException when Supabase returns an error', async () => {
      supabaseAuthMock.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('bad token'),
      });

      await expect(service.validateToken('bad-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('throws UnauthorizedException when no user is returned', async () => {
      supabaseAuthMock.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      await expect(service.validateToken('token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('requestPasswordRecovery()', () => {
    it('sends the recovery email with the configured redirect url', async () => {
      supabaseAuthMock.resetPasswordForEmail.mockResolvedValue({ error: null });

      await service.requestPasswordRecovery('user@test.com');

      expect(supabaseAuthMock.resetPasswordForEmail).toHaveBeenCalledWith(
        'user@test.com',
        { redirectTo: config.SUPABASE_PASSWORD_RECOVERY_REDIRECT_URL },
      );
    });

    it('throws BadRequestException when Supabase reports an error', async () => {
      supabaseAuthMock.resetPasswordForEmail.mockResolvedValue({
        error: { message: 'rate limited' },
      });

      await expect(
        service.requestPasswordRecovery('user@test.com'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('resetPasswordWithToken()', () => {
    it('updates the password for the user resolved from the token', async () => {
      supabaseAuthMock.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      });
      supabaseAuthMock.admin.updateUserById.mockResolvedValue({ error: null });

      await service.resetPasswordWithToken('access-token', 'newPass123');

      expect(supabaseAuthMock.getUser).toHaveBeenCalledWith('access-token');
      expect(supabaseAuthMock.admin.updateUserById).toHaveBeenCalledWith(
        'user-1',
        { password: 'newPass123' },
      );
    });

    it('throws UnauthorizedException when the recovery token is invalid', async () => {
      supabaseAuthMock.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('expired'),
      });

      await expect(
        service.resetPasswordWithToken('bad-token', 'newPass123'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(supabaseAuthMock.admin.updateUserById).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the password update fails', async () => {
      supabaseAuthMock.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      });
      supabaseAuthMock.admin.updateUserById.mockResolvedValue({
        error: { message: 'weak password' },
      });

      await expect(
        service.resetPasswordWithToken('access-token', 'weak'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });
});
