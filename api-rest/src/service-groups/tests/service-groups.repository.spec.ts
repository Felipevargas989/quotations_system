import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { ServiceGroupsRepository } from '../service-groups.repository';

/**
 * Builds a chainable Supabase query-builder mock. Every builder method returns
 * the same object so calls like `.from().select().eq()` work, and each method is
 * a jest.fn so the exact table/columns/filters can be asserted.
 */
const createQueryBuilder = () => {
  const builder: any = {};
  for (const method of ['select', 'insert', 'delete', 'eq', 'single']) {
    builder[method] = jest.fn(() => builder);
  }
  return builder;
};

describe('ServiceGroupsRepository', () => {
  let repository: ServiceGroupsRepository;
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
        ServiceGroupsRepository,
        { provide: SupabaseService, useValue: supabaseMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    repository = module.get<ServiceGroupsRepository>(ServiceGroupsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('createGroup inserts into service_groups and returns a single row', () => {
    const group = { name: 'g', category: 'c', company_id: companyId } as any;
    repository.createGroup(group);

    expect(fromMock).toHaveBeenCalledWith('service_groups');
    expect(builder.insert).toHaveBeenCalledWith(group);
    expect(builder.select).toHaveBeenCalled();
    expect(builder.single).toHaveBeenCalled();
  });

  it('createGroupItems inserts the items into service_group_items', () => {
    const items = [{ group_id: 1, variable_service_id: 2, quantity: 3 }] as any;
    repository.createGroupItems(items);

    expect(fromMock).toHaveBeenCalledWith('service_group_items');
    expect(builder.insert).toHaveBeenCalledWith(items);
  });

  it('findAll selects the nested items and scopes the query by company_id', () => {
    repository.findAll(companyId);

    expect(fromMock).toHaveBeenCalledWith('service_groups');
    expect(builder.select).toHaveBeenCalledWith(
      '*, items:service_group_items(quantity, service:variable_services(*))',
    );
    expect(builder.eq).toHaveBeenCalledWith('company_id', companyId);
  });

  it('removeGroup deletes the row matching the id', () => {
    repository.removeGroup(5);

    expect(fromMock).toHaveBeenCalledWith('service_groups');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', 5);
  });
});
