import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { QuotationStatus, RequestType } from '../constants/constants';
import { QuotationsRepository } from '../quotations.repository';

/**
 * Builds a chainable Supabase query-builder mock. Every builder method returns
 * the same object so calls like `.from().select().eq()` work, and each method is
 * a jest.fn so the exact table/columns/filters can be asserted. The builder is
 * also thenable (resolves to `resolvedValue`) so `await query` works for the
 * methods that await the builder directly (e.g. findAll).
 */
const createQueryBuilder = (resolvedValue: any = { data: [], error: null }) => {
  const builder: any = {};
  for (const method of [
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'in',
    'order',
    'gte',
    'lte',
    'single',
  ]) {
    builder[method] = jest.fn(() => builder);
  }
  // Make the builder awaitable so `await query` resolves for findAll.
  builder.then = (resolve: any) => resolve(resolvedValue);
  return builder;
};

describe('QuotationsRepository', () => {
  let repository: QuotationsRepository;
  let builder: ReturnType<typeof createQueryBuilder>;
  let fromMock: jest.Mock;

  const companyId = 1;

  const buildWith = (resolvedValue?: any) => {
    builder = createQueryBuilder(resolvedValue);
    fromMock.mockImplementation(() => builder);
    return builder;
  };

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
        QuotationsRepository,
        { provide: SupabaseService, useValue: supabaseMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    repository = module.get<QuotationsRepository>(QuotationsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('findAll()', () => {
    it('selects from quotations and returns the data', async () => {
      const rows = [{ id: 'q1' }];
      buildWith({ data: rows, error: null });

      const result = await repository.findAll({ company_id: companyId });

      expect(fromMock).toHaveBeenCalledWith('quotations');
      expect(builder.select).toHaveBeenCalled();
      expect(result).toBe(rows);
    });

    it('scopes the query by company_id when provided', async () => {
      await repository.findAll({ company_id: companyId });
      expect(builder.eq).toHaveBeenCalledWith('company_id', companyId);
    });

    it('does not filter by company_id when it is undefined', async () => {
      await repository.findAll({ company_id: undefined });
      expect(builder.eq).not.toHaveBeenCalledWith(
        'company_id',
        expect.anything(),
      );
    });

    it('applies request_type, statuses, sort and event_date filters', async () => {
      const eventDate = new Date('2026-01-01T00:00:00.000Z');
      await repository.findAll({
        company_id: companyId,
        request_type: RequestType.COTIZACION,
        statuses: [QuotationStatus.ACEPTADA],
        sort_by: 'created_at',
        sort_order: 'asc',
        event_date: eventDate,
      });

      expect(builder.eq).toHaveBeenCalledWith(
        'request_type',
        RequestType.COTIZACION,
      );
      expect(builder.order).toHaveBeenCalledWith('created_at', {
        ascending: true,
      });
      expect(builder.in).toHaveBeenCalledWith('quotation_status', [
        QuotationStatus.ACEPTADA,
      ]);
      expect(builder.eq).toHaveBeenCalledWith(
        'event_date',
        eventDate.toISOString(),
      );
    });

    it('applies the created_at date range filters', async () => {
      const start_date = new Date('2026-01-01T00:00:00.000Z');
      const end_date = new Date('2026-02-01T00:00:00.000Z');
      await repository.findAll({
        company_id: companyId,
        dateRange: { start_date, end_date },
      });

      expect(builder.gte).toHaveBeenCalledWith(
        'created_at',
        start_date.toISOString(),
      );
      expect(builder.lte).toHaveBeenCalledWith(
        'created_at',
        end_date.toISOString(),
      );
    });

    it('throws when the query returns an error', async () => {
      buildWith({ data: null, error: new Error('boom') });
      await expect(
        repository.findAll({ company_id: companyId }),
      ).rejects.toThrow('boom');
    });
  });

  describe('findOne()', () => {
    it('selects a single quotation matching the id', async () => {
      buildWith({ data: { id: 'q1' }, error: null });
      await repository.findOne('q1');

      expect(fromMock).toHaveBeenCalledWith('quotations');
      expect(builder.eq).toHaveBeenCalledWith('id', 'q1');
      expect(builder.single).toHaveBeenCalled();
    });
  });

  describe('create()', () => {
    it('inserts the quotation and returns the created row', async () => {
      const created = { id: 'q1', event_type: 'Matrimonios' };
      buildWith({ data: created, error: null });
      const payload = { event_type: 'Matrimonios' } as any;

      const result = await repository.create(payload);

      expect(fromMock).toHaveBeenCalledWith('quotations');
      expect(builder.insert).toHaveBeenCalledWith([payload]);
      expect(builder.select).toHaveBeenCalled();
      expect(builder.single).toHaveBeenCalled();
      expect(result).toBe(created);
    });

    it('throws when the insert returns an error', async () => {
      buildWith({ data: null, error: new Error('insert failed') });
      await expect(repository.create({} as any)).rejects.toThrow(
        'insert failed',
      );
    });
  });

  describe('update()', () => {
    it('updates the row matching id and company_id', async () => {
      const updated = { id: 'q1' };
      buildWith({ data: updated, error: null });
      const dto = { quotation_status: QuotationStatus.ENVIADA } as any;

      const result = await repository.update('q1', dto, companyId);

      expect(fromMock).toHaveBeenCalledWith('quotations');
      expect(builder.update).toHaveBeenCalledWith(dto);
      expect(builder.eq).toHaveBeenCalledWith('id', 'q1');
      expect(builder.eq).toHaveBeenCalledWith('company_id', companyId);
      expect(builder.single).toHaveBeenCalled();
      expect(result).toBe(updated);
    });

    it('throws when the update returns an error', async () => {
      buildWith({ data: null, error: new Error('update failed') });
      await expect(
        repository.update('q1', {} as any, companyId),
      ).rejects.toThrow('update failed');
    });
  });

  describe('remove()', () => {
    it('deletes the row matching id and company_id', async () => {
      buildWith({ data: null, error: null });
      await repository.remove('q1', companyId);

      expect(fromMock).toHaveBeenCalledWith('quotations');
      expect(builder.delete).toHaveBeenCalled();
      expect(builder.eq).toHaveBeenCalledWith('id', 'q1');
      expect(builder.eq).toHaveBeenCalledWith('company_id', companyId);
    });

    it('throws when the delete returns an error', async () => {
      buildWith({ data: null, error: new Error('delete failed') });
      await expect(repository.remove('q1', companyId)).rejects.toThrow(
        'delete failed',
      );
    });
  });
});
