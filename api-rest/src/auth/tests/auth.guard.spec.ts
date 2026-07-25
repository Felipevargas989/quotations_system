import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersRepository } from 'src/users/users.repository';
import { AuthGuard } from '../auth.guard';
import { AuthService } from '../auth.service';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let authServiceMock: jest.Mocked<AuthService>;
  let usersRepositoryMock: jest.Mocked<UsersRepository>;
  let reflectorMock: jest.Mocked<Reflector>;

  // Builds an ExecutionContext mock backed by the given request object.
  const buildContext = (request: any): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as any;

  beforeEach(async () => {
    authServiceMock = {
      validateToken: jest.fn(),
    } as any;

    usersRepositoryMock = {
      findOne: jest.fn(),
    } as any;

    reflectorMock = {
      getAllAndOverride: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthGuard,
        { provide: AuthService, useValue: authServiceMock },
        { provide: UsersRepository, useValue: usersRepositoryMock },
        { provide: Reflector, useValue: reflectorMock },
      ],
    }).compile();

    guard = module.get<AuthGuard>(AuthGuard);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('allows the request without authenticating when the route is @Public()', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(true);
    const request = { headers: {} };
    const context = buildContext(request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authServiceMock.validateToken).not.toHaveBeenCalled();
    expect(usersRepositoryMock.findOne).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when no Bearer token is present', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(false);
    const context = buildContext({ headers: {} });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authServiceMock.validateToken).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when the authorization scheme is not Bearer', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(false);
    const context = buildContext({
      headers: { authorization: 'Basic sometoken' },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authServiceMock.validateToken).not.toHaveBeenCalled();
  });

  it('validates the token, loads the user and attaches { id, company_id } to the request', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(false);
    authServiceMock.validateToken.mockResolvedValue({ id: 'user-1' });
    usersRepositoryMock.findOne.mockResolvedValue({
      data: { id: 'user-1', company_id: 42 },
    } as any);

    const request: any = { headers: { authorization: 'Bearer valid-token' } };
    const context = buildContext(request);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(authServiceMock.validateToken).toHaveBeenCalledWith('valid-token');
    expect(usersRepositoryMock.findOne).toHaveBeenCalledWith('user-1');
    expect(request.user).toEqual({ id: 'user-1', company_id: 42 });
  });

  it('re-throws the UnauthorizedException raised while validating an invalid token', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(false);
    authServiceMock.validateToken.mockRejectedValue(
      new UnauthorizedException('Invalid token'),
    );

    const context = buildContext({
      headers: { authorization: 'Bearer invalid-token' },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(usersRepositoryMock.findOne).not.toHaveBeenCalled();
  });

  it('wraps unexpected errors as UnauthorizedException', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(false);
    authServiceMock.validateToken.mockResolvedValue({ id: 'user-1' });
    usersRepositoryMock.findOne.mockRejectedValue(new Error('db down'));

    const context = buildContext({
      headers: { authorization: 'Bearer valid-token' },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
