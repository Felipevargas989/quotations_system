import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { ClientsRepository } from '../clients.repository';

/**
 * Builds a chainable Supabase query-builder mock. Every builder method returns
 * the same object so calls like `.from().select().eq()` work, and each method is
 * a jest.fn so the exact table/columns/filters can be asserted. Terminal methods
 * (`single`) resolve to `{ data, error }`; override `builder.__result` per test.
 */
const createQueryBuilder = () => {
  const builder: any = { __result: { data: null, error: null } };
  for (const method of [
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'order',
  ]) {
    builder[method] = jest.fn(() => builder);
  }
  builder.single = jest.fn(() => Promise.resolve(builder.__result));
  // `order` is the terminal call for findAll, so make it awaitable too.
  builder.order = jest.fn(() => Promise.resolve(builder.__result));
  return builder;
};

describe('ClientsRepository', () => {
  let repository: ClientsRepository;
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
        ClientsRepository,
        { provide: SupabaseService, useValue: supabaseMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    repository = module.get<ClientsRepository>(ClientsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('create()', () => {
    it('inserts into clients and returns the single created row', async () => {
      const client = { name: 'Acme', company_id: companyId } as any;
      builder.__result = { data: { id: 'c1', ...client }, error: null };

      const result = await repository.create(client);

      expect(fromMock).toHaveBeenCalledWith('clients');
      expect(builder.insert).toHaveBeenCalledWith([client]);
      expect(builder.select).toHaveBeenCalled();
      expect(builder.single).toHaveBeenCalled();
      expect(result).toEqual({ id: 'c1', ...client });
    });

    it('throws when Supabase returns an error', async () => {
      builder.__result = { data: null, error: new Error('insert failed') };

      await expect(
        repository.create({ name: 'x', company_id: companyId } as any),
      ).rejects.toThrow('insert failed');
    });
  });

  describe('findAll()', () => {
    it('scopes the query by company_id and orders by name', async () => {
      builder.__result = { data: [{ id: 'c1' }], error: null };

      const result = await repository.findAll(companyId);

      expect(fromMock).toHaveBeenCalledWith('clients');
      expect(builder.select).toHaveBeenCalledWith('*');
      expect(builder.eq).toHaveBeenCalledWith('company_id', companyId);
      expect(builder.order).toHaveBeenCalledWith('name');
      expect(result).toEqual([{ id: 'c1' }]);
    });

    it('throws when Supabase returns an error', async () => {
      builder.__result = { data: null, error: new Error('select failed') };

      await expect(repository.findAll(companyId)).rejects.toThrow(
        'select failed',
      );
    });
  });

  describe('update()', () => {
    it('updates the row matching both id and company_id', async () => {
      const dto = { name: 'New' } as any;
      builder.__result = { data: { id: 'c1', name: 'New' }, error: null };

      const result = await repository.update('c1', dto, companyId);

      expect(fromMock).toHaveBeenCalledWith('clients');
      expect(builder.update).toHaveBeenCalledWith(dto);
      expect(builder.eq).toHaveBeenCalledWith('id', 'c1');
      expect(builder.eq).toHaveBeenCalledWith('company_id', companyId);
      expect(builder.single).toHaveBeenCalled();
      expect(result).toEqual({ id: 'c1', name: 'New' });
    });

    it('throws when Supabase returns an error', async () => {
      builder.__result = { data: null, error: new Error('update failed') };

      await expect(
        repository.update('c1', {} as any, companyId),
      ).rejects.toThrow('update failed');
    });
  });

  describe('remove()', () => {
    it('deletes the row matching both id and company_id', async () => {
      builder.__result = { data: { id: 'c1' }, error: null };

      const result = await repository.remove('c1', companyId);

      expect(fromMock).toHaveBeenCalledWith('clients');
      expect(builder.delete).toHaveBeenCalled();
      expect(builder.eq).toHaveBeenCalledWith('id', 'c1');
      expect(builder.eq).toHaveBeenCalledWith('company_id', companyId);
      expect(builder.single).toHaveBeenCalled();
      expect(result).toEqual({ id: 'c1' });
    });

    it('throws when Supabase returns an error', async () => {
      builder.__result = { data: null, error: new Error('delete failed') };

      await expect(repository.remove('c1', companyId)).rejects.toThrow(
        'delete failed',
      );
    });
  });

  describe('findOne()', () => {
    it('always scopes by company_id and adds no optional filters when none given', () => {
      repository.findOne(companyId);

      expect(fromMock).toHaveBeenCalledWith('clients');
      expect(builder.select).toHaveBeenCalledWith('*');
      expect(builder.eq).toHaveBeenCalledWith('company_id', companyId);
      // only the company_id filter is applied
      expect(builder.eq).toHaveBeenCalledTimes(1);
      expect(builder.single).toHaveBeenCalled();
    });

    it('adds id, email and phone filters when provided', () => {
      repository.findOne(companyId, 5, 'a@b.com', '555');

      expect(builder.eq).toHaveBeenCalledWith('company_id', companyId);
      expect(builder.eq).toHaveBeenCalledWith('id', 5);
      expect(builder.eq).toHaveBeenCalledWith('email', 'a@b.com');
      expect(builder.eq).toHaveBeenCalledWith('phone', '555');
      expect(builder.eq).toHaveBeenCalledTimes(4);
      expect(builder.single).toHaveBeenCalled();
    });
  });
});
