import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { CompaniesRepository } from '../companies.repository';

/**
 * Builds a chainable Supabase query-builder mock. Every builder method returns
 * the same object so calls like `.from().select().eq()` work, and each method is
 * a jest.fn so the exact table/columns/filters can be asserted.
 */
const createQueryBuilder = () => {
  const builder: any = {};
  for (const method of ['select', 'insert', 'update', 'eq', 'single']) {
    builder[method] = jest.fn(() => builder);
  }
  return builder;
};

describe('CompaniesRepository', () => {
  let repository: CompaniesRepository;
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
        CompaniesRepository,
        { provide: SupabaseService, useValue: supabaseMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    repository = module.get<CompaniesRepository>(CompaniesRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('create inserts the company into companies and returns a single row', () => {
    const company = { name: 'Acme' } as any;
    repository.create(company);

    expect(fromMock).toHaveBeenCalledWith('companies');
    expect(builder.insert).toHaveBeenCalledWith([company]);
    expect(builder.select).toHaveBeenCalled();
    expect(builder.single).toHaveBeenCalled();
  });

  it('findOne scopes the query by id and returns a single row', () => {
    repository.findOne(companyId);

    expect(fromMock).toHaveBeenCalledWith('companies');
    expect(builder.select).toHaveBeenCalledWith('*');
    expect(builder.eq).toHaveBeenCalledWith('id', companyId);
    expect(builder.single).toHaveBeenCalled();
  });

  it('update updates the row matching the id and returns a single row', () => {
    const dto = { name: 'New name' } as any;
    repository.update(companyId, dto);

    expect(fromMock).toHaveBeenCalledWith('companies');
    expect(builder.update).toHaveBeenCalledWith(dto);
    expect(builder.eq).toHaveBeenCalledWith('id', companyId);
    expect(builder.select).toHaveBeenCalled();
    expect(builder.single).toHaveBeenCalled();
  });
});
