import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { CustomerSatisfactionSurveyRepository } from '../repository';

/**
 * Builds a chainable Supabase query-builder mock. Every builder method returns
 * the same object so calls like `.from().insert().select().single()` work, and
 * each method is a jest.fn so the exact table/columns/filters can be asserted.
 */
const createQueryBuilder = () => {
  const builder: any = {};
  for (const method of ['select', 'insert', 'eq', 'single']) {
    builder[method] = jest.fn(() => builder);
  }
  return builder;
};

describe('CustomerSatisfactionSurveyRepository', () => {
  let repository: CustomerSatisfactionSurveyRepository;
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
        CustomerSatisfactionSurveyRepository,
        { provide: SupabaseService, useValue: supabaseMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    repository = module.get<CustomerSatisfactionSurveyRepository>(
      CustomerSatisfactionSurveyRepository,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('createTemplate inserts the company id and questions and returns a single row', () => {
    const questions = [{ id: 1, question: 'q', type: 'number' }] as any;
    repository.createTemplate(companyId, questions);

    expect(fromMock).toHaveBeenCalledWith(
      'customer_satisfaction_survey_templates',
    );
    expect(builder.insert).toHaveBeenCalledWith([
      { company_id: companyId, questions },
    ]);
    expect(builder.select).toHaveBeenCalled();
    expect(builder.single).toHaveBeenCalled();
  });

  it('createAnswer inserts the quotation, template and answers and returns a single row', () => {
    const answers = [{ id: 1, answer: '5' }] as any;
    repository.createAnswer(42, 7, answers);

    expect(fromMock).toHaveBeenCalledWith(
      'customer_satisfaction_survey_responses',
    );
    expect(builder.insert).toHaveBeenCalledWith([
      { quotation_id: 42, template_id: 7, answers },
    ]);
    expect(builder.select).toHaveBeenCalled();
    expect(builder.single).toHaveBeenCalled();
  });

  it('getTemplate scopes the query by company_id and returns a single row', () => {
    repository.getTemplate(companyId);

    expect(fromMock).toHaveBeenCalledWith(
      'customer_satisfaction_survey_templates',
    );
    expect(builder.select).toHaveBeenCalledWith('*');
    expect(builder.eq).toHaveBeenCalledWith('company_id', companyId);
    expect(builder.single).toHaveBeenCalled();
  });

  it('findAllAnswersFromCompany scopes the joined query by the quotation company_id', () => {
    repository.findAllAnswersFromCompany(companyId);

    expect(fromMock).toHaveBeenCalledWith(
      'customer_satisfaction_survey_responses',
    );
    expect(builder.select).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('quotations.company_id', companyId);
  });
});
