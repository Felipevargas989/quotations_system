import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { RefundsRepository } from '../refunds.repository';

/**
 * Builds a chainable Supabase query-builder mock. Every builder method returns
 * the same object so calls like `.from().select().eq()` work, and each method is
 * a jest.fn so the exact table/columns/filters can be asserted.
 */
const createQueryBuilder = () => {
  const builder: any = {};
  for (const method of ['select', 'insert', 'eq', 'single', 'order']) {
    builder[method] = jest.fn(() => builder);
  }
  return builder;
};

describe('RefundsRepository', () => {
  let repository: RefundsRepository;
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
        RefundsRepository,
        { provide: SupabaseService, useValue: supabaseMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    repository = module.get<RefundsRepository>(RefundsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('create inserts into refunds and returns a single row', () => {
    const refund = {
      amount: 100,
      quotation_id: 'q1',
      is_paid: false,
    } as any;
    repository.create(refund);

    expect(fromMock).toHaveBeenCalledWith('refunds');
    expect(builder.insert).toHaveBeenCalledWith(refund);
    expect(builder.select).toHaveBeenCalled();
    expect(builder.single).toHaveBeenCalled();
  });

  it('findAll scopes the query by the nested quotation company_id and orders by created_at', () => {
    repository.findAll(companyId);

    expect(fromMock).toHaveBeenCalledWith('refunds');
    expect(builder.select).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('quotations.company_id', companyId);
    expect(builder.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    });
  });
});
