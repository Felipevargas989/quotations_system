import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { SuperAdminRepository } from '../super-admin.repository';

/**
 * Builds a chainable Supabase query-builder mock. Every non-terminal builder
 * method returns the same object so calls like `.from().select().gte().lte()`
 * chain, while `.order()` is the terminal call that resolves the query result.
 */
const createQueryBuilder = () => {
  const builder: any = {};
  for (const method of ['select', 'gte', 'lte']) {
    builder[method] = jest.fn(() => builder);
  }
  builder.order = jest.fn();
  return builder;
};

describe('SuperAdminRepository', () => {
  let repository: SuperAdminRepository;
  let builder: ReturnType<typeof createQueryBuilder>;
  let fromMock: jest.Mock;
  let listUsersMock: jest.Mock;

  beforeEach(async () => {
    builder = createQueryBuilder();
    fromMock = jest.fn(() => builder);
    listUsersMock = jest.fn();

    const supabaseMock = {
      client: {
        from: fromMock,
        auth: { admin: { listUsers: listUsersMock } },
      },
    } as any;
    const loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuperAdminRepository,
        { provide: SupabaseService, useValue: supabaseMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    repository = module.get<SuperAdminRepository>(SuperAdminRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('createSuscription only logs (no persistence) and returns undefined', () => {
    const result = repository.createSuscription({
      company_name: 'Acme',
    } as any);

    expect(result).toBeUndefined();
    expect(fromMock).not.toHaveBeenCalled();
  });

  describe('getStatsLastMonth()', () => {
    it('queries companies and quotations and aggregates per company', async () => {
      const todayIso = new Date().toISOString();
      builder.order
        .mockResolvedValueOnce({
          data: [{ id: 1, name: 'A' }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{ created_at: todayIso, company_id: 1, total_amount: 100 }],
          error: null,
        });

      const result = await repository.getStatsLastMonth();

      expect(fromMock).toHaveBeenCalledWith('companies');
      expect(fromMock).toHaveBeenCalledWith('quotations');
      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);
      expect(result.data![0]).toEqual(
        expect.objectContaining({
          company_id: 1,
          company_name: 'A',
          total_quotations: 1,
          total_amount: 100,
        }),
      );
    });

    it('returns an empty list when there are no companies', async () => {
      builder.order.mockResolvedValueOnce({ data: [], error: null });

      const result = await repository.getStatsLastMonth();

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
      // quotations query is skipped when there are no companies
      expect(fromMock).toHaveBeenCalledTimes(1);
    });

    it('returns the error when the companies query fails', async () => {
      builder.order.mockResolvedValueOnce({
        data: null,
        error: { message: 'companies boom' },
      });

      const result = await repository.getStatsLastMonth();

      expect(result.data).toBeNull();
      expect(result.error).toEqual({ message: 'companies boom' });
    });

    it('returns the error when the quotations query fails', async () => {
      builder.order
        .mockResolvedValueOnce({ data: [{ id: 1, name: 'A' }], error: null })
        .mockResolvedValueOnce({
          data: null,
          error: { message: 'quotations boom' },
        });

      const result = await repository.getStatsLastMonth();

      expect(result.data).toBeNull();
      expect(result.error).toEqual({ message: 'quotations boom' });
    });
  });

  describe('getUsersLastSignIns()', () => {
    it('returns users signed in within the range and computes totals', async () => {
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 30);
      const signedInAt = new Date(endDate.getTime() - 1000).toISOString();

      listUsersMock.mockResolvedValue({
        data: {
          users: [
            {
              id: 'u1',
              email: 'u1@a.com',
              last_sign_in_at: signedInAt,
              created_at: signedInAt,
              phone: null,
            },
            {
              id: 'u2',
              email: 'u2@a.com',
              last_sign_in_at: null,
              created_at: signedInAt,
            },
          ],
        },
        error: null,
      });

      const result = await repository.getUsersLastSignIns({
        startDate,
        endDate,
      });

      expect(listUsersMock).toHaveBeenCalledWith({ page: 1, perPage: 1000 });
      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);
      expect(result.data![0].id).toBe('u1');
      expect(result.totals).toEqual({
        total_users: 2,
        total_signed_in_in_period: 1,
        total_never_signed_in: 1,
      });
    });

    it('returns the error and zeroed totals when listUsers fails', async () => {
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 30);

      listUsersMock.mockResolvedValue({
        data: null,
        error: { message: 'auth boom' },
      });

      const result = await repository.getUsersLastSignIns({
        startDate,
        endDate,
      });

      expect(result.data).toBeNull();
      expect(result.error).toEqual({ message: 'auth boom' });
      expect(result.totals).toEqual({
        total_users: 0,
        total_signed_in_in_period: 0,
        total_never_signed_in: 0,
      });
    });
  });
});
