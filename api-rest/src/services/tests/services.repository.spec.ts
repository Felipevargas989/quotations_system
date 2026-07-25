import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { ServicesRepository } from '../services.repository';

/**
 * Builds a chainable Supabase query-builder mock. Every builder method returns
 * the same object so calls like `.from().select().eq()` work, and each method is
 * a jest.fn so the exact table/columns/filters can be asserted.
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
    'single',
  ]) {
    builder[method] = jest.fn(() => builder);
  }
  return builder;
};

describe('ServicesRepository', () => {
  let repository: ServicesRepository;
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
        ServicesRepository,
        { provide: SupabaseService, useValue: supabaseMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    repository = module.get<ServicesRepository>(ServicesRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('createVariableServices upserts into variable_services ignoring duplicates', () => {
    const services = [{ name: 'v', company_id: companyId }] as any;
    repository.createVariableServices(services);

    expect(fromMock).toHaveBeenCalledWith('variable_services');
    expect(builder.upsert).toHaveBeenCalledWith(services, {
      ignoreDuplicates: true,
      onConflict: 'company_id,category,name',
    });
  });

  it('createFixedServices upserts into fixed_services ignoring duplicates', () => {
    const services = [{ name: 'f', company_id: companyId }] as any;
    repository.createFixedServices(services);

    expect(fromMock).toHaveBeenCalledWith('fixed_services');
    expect(builder.upsert).toHaveBeenCalledWith(services, {
      ignoreDuplicates: true,
      onConflict: 'company_id,name',
    });
  });

  it('createVariableService inserts and returns a single row', () => {
    const dto = { name: 'v' } as any;
    repository.createVariableService(dto);

    expect(fromMock).toHaveBeenCalledWith('variable_services');
    expect(builder.insert).toHaveBeenCalledWith(dto);
    expect(builder.select).toHaveBeenCalled();
    expect(builder.single).toHaveBeenCalled();
  });

  it('findAllVariableServices scopes the query by company_id', () => {
    repository.findAllVariableServices(companyId);

    expect(fromMock).toHaveBeenCalledWith('variable_services');
    expect(builder.select).toHaveBeenCalledWith('*');
    expect(builder.eq).toHaveBeenCalledWith('company_id', companyId);
  });

  it('findAllFixedServices scopes the query by company_id', () => {
    repository.findAllFixedServices(companyId);

    expect(fromMock).toHaveBeenCalledWith('fixed_services');
    expect(builder.eq).toHaveBeenCalledWith('company_id', companyId);
  });

  it('updateVariableService updates the row matching the id', () => {
    const dto = { name: 'v2' } as any;
    repository.updateVariableService(3, dto);

    expect(fromMock).toHaveBeenCalledWith('variable_services');
    expect(builder.update).toHaveBeenCalledWith(dto);
    expect(builder.eq).toHaveBeenCalledWith('id', 3);
  });

  it('updateFixedService updates the row matching the id', () => {
    const dto = { name: 'f2' } as any;
    repository.updateFixedService(4, dto);

    expect(fromMock).toHaveBeenCalledWith('fixed_services');
    expect(builder.update).toHaveBeenCalledWith(dto);
    expect(builder.eq).toHaveBeenCalledWith('id', 4);
  });

  it('removeVariableService deletes the row matching the id', () => {
    repository.removeVariableService(5);

    expect(fromMock).toHaveBeenCalledWith('variable_services');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', 5);
  });

  it('removeFixedService deletes the row matching the id', () => {
    repository.removeFixedService(6);

    expect(fromMock).toHaveBeenCalledWith('fixed_services');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', 6);
  });

  it('findAllServiceCategories scopes the query by company_id', () => {
    repository.findAllServiceCategories(companyId);

    expect(fromMock).toHaveBeenCalledWith('service_categories');
    expect(builder.eq).toHaveBeenCalledWith('company_id', companyId);
  });

  it('upsertServiceCategory upserts on the company_id,name conflict target', () => {
    repository.upsertServiceCategory(companyId, 'cat', true);

    expect(fromMock).toHaveBeenCalledWith('service_categories');
    expect(builder.upsert).toHaveBeenCalledWith(
      { company_id: companyId, name: 'cat', is_active: true },
      { onConflict: 'company_id,name' },
    );
    expect(builder.single).toHaveBeenCalled();
  });
});
