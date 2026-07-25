import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { CalendarRepository } from '../calendar.repository';

/**
 * Builds a chainable Supabase query-builder mock. Every builder method returns
 * the same object so calls like `.from().select().eq().gte().lte().order()`
 * work, and each method is a jest.fn so table/columns/filters can be asserted.
 */
const createQueryBuilder = () => {
  const builder: any = {};
  for (const method of [
    'select',
    'insert',
    'upsert',
    'update',
    'delete',
    'eq',
    'gte',
    'lte',
    'order',
    'single',
  ]) {
    builder[method] = jest.fn(() => builder);
  }
  return builder;
};

describe('CalendarRepository', () => {
  let repository: CalendarRepository;
  let fromMock: jest.Mock;

  beforeEach(async () => {
    const builder = createQueryBuilder();
    fromMock = jest.fn(() => builder);

    const supabaseMock = { client: { from: fromMock } } as any;
    const loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarRepository,
        { provide: SupabaseService, useValue: supabaseMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    repository = module.get<CalendarRepository>(CalendarRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });
});
