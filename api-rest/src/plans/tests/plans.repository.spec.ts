import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { PlansRepository } from '../plans.repository';

/**
 * Builds a chainable Supabase query-builder mock. Every builder method returns
 * the same object so calls like `.from().update().eq()` work, and each method is
 * a jest.fn so the exact table/columns/filters can be asserted.
 */
const createQueryBuilder = () => {
  const builder: any = {};
  for (const method of ['update', 'eq']) {
    builder[method] = jest.fn(() => builder);
  }
  return builder;
};

describe('PlansRepository', () => {
  let repository: PlansRepository;
  let builder: ReturnType<typeof createQueryBuilder>;
  let fromMock: jest.Mock;

  const companyId = 1;

  beforeEach(async () => {
    builder = createQueryBuilder();
    fromMock = jest.fn(() => builder);

    const supabaseMock = { client: { from: fromMock } } as any;
    const loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlansRepository,
        { provide: SupabaseService, useValue: supabaseMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    repository = module.get<PlansRepository>(PlansRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('confirmPlan marks the company as premium scoped by id', async () => {
    await repository.confirmPlan(companyId);

    expect(fromMock).toHaveBeenCalledWith('companies');
    expect(builder.update).toHaveBeenCalledWith({ is_premium: true });
    expect(builder.eq).toHaveBeenCalledWith('id', companyId);
  });

  it('confirmPlan returns the Supabase result', async () => {
    const supabaseResult = { data: { id: companyId }, error: null };
    builder.eq.mockReturnValueOnce(supabaseResult);

    const result = await repository.confirmPlan(companyId);

    expect(result).toBe(supabaseResult);
  });
});
