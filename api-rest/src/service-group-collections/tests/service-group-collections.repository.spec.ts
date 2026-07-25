import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { ServiceGroupCollectionsRepository } from '../service-group-collections.repository';

/**
 * Builds a chainable Supabase query-builder mock. Every builder method returns
 * the same object so calls like `.from().insert().select().single()` work, and
 * each method is a jest.fn so the exact table/columns/filters can be asserted.
 */
const createQueryBuilder = () => {
  const builder: any = {};
  for (const method of ['select', 'insert', 'delete', 'eq', 'single']) {
    builder[method] = jest.fn(() => builder);
  }
  return builder;
};

describe('ServiceGroupCollectionsRepository', () => {
  let repository: ServiceGroupCollectionsRepository;
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
        ServiceGroupCollectionsRepository,
        { provide: SupabaseService, useValue: supabaseMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    repository = module.get<ServiceGroupCollectionsRepository>(
      ServiceGroupCollectionsRepository,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('createCollection inserts into service_group_collections and returns a single row', () => {
    const collection = { name: 'Paquete', company_id: companyId } as any;
    repository.createCollection(collection);

    expect(fromMock).toHaveBeenCalledWith('service_group_collections');
    expect(builder.insert).toHaveBeenCalledWith(collection);
    expect(builder.select).toHaveBeenCalled();
    expect(builder.single).toHaveBeenCalled();
  });

  it('createCollectionItems inserts the items into service_group_collection_items', () => {
    const items = [
      { collection_id: 99, service_group_id: 11 },
      { collection_id: 99, service_group_id: 22 },
    ] as any;
    repository.createCollectionItems(items);

    expect(fromMock).toHaveBeenCalledWith('service_group_collection_items');
    expect(builder.insert).toHaveBeenCalledWith(items);
  });

  it('findAll scopes the query by company_id with the nested group selection', () => {
    repository.findAll(companyId);

    expect(fromMock).toHaveBeenCalledWith('service_group_collections');
    expect(builder.select).toHaveBeenCalledWith(
      '*, groups:service_group_collection_items(group:service_groups(*, items:service_group_items(quantity, service:variable_services(*))))',
    );
    expect(builder.eq).toHaveBeenCalledWith('company_id', companyId);
  });

  it('removeCollection deletes the row matching the id', () => {
    repository.removeCollection(7);

    expect(fromMock).toHaveBeenCalledWith('service_group_collections');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', 7);
  });
});
