import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { RequestPasswordRecoveryDto } from '../dto/request-password-recovery.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';

describe('AuthController', () => {
  let controller: AuthController;
  let authServiceMock: jest.Mocked<AuthService>;
  let loggerMock: jest.Mocked<PinoLogger>;

  beforeEach(async () => {
    authServiceMock = {
      requestPasswordRecovery: jest.fn(),
      resetPasswordWithToken: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('requestPasswordRecovery()', () => {
    it('delegates to the service with the email and returns a generic message', async () => {
      const dto: RequestPasswordRecoveryDto = { email: 'user@test.com' };

      const result = await controller.requestPasswordRecovery(dto);

      expect(authServiceMock.requestPasswordRecovery).toHaveBeenCalledWith(
        'user@test.com',
      );
      expect(result).toEqual({
        message:
          'If an account exists for that email, you will receive recovery instructions shortly.',
      });
    });

    it('propagates errors raised by the service', async () => {
      authServiceMock.requestPasswordRecovery.mockRejectedValue(
        new Error('boom'),
      );

      await expect(
        controller.requestPasswordRecovery({ email: 'user@test.com' }),
      ).rejects.toThrow('boom');
    });
  });

  describe('resetPassword()', () => {
    it('delegates to the service with the token and password and returns a confirmation', async () => {
      const dto: ResetPasswordDto = {
        accessToken: 'access-token-123',
        password: 'newPass123',
      };

      const result = await controller.resetPassword(dto);

      expect(authServiceMock.resetPasswordWithToken).toHaveBeenCalledWith(
        'access-token-123',
        'newPass123',
      );
      expect(result).toEqual({ message: 'Password updated successfully.' });
    });

    it('propagates errors raised by the service', async () => {
      authServiceMock.resetPasswordWithToken.mockRejectedValue(
        new Error('invalid'),
      );

      await expect(
        controller.resetPassword({
          accessToken: 'access-token-123',
          password: 'newPass123',
        }),
      ).rejects.toThrow('invalid');
    });
  });
});
