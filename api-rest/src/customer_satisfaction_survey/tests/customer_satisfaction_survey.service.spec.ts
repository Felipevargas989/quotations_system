import { Test, TestingModule } from '@nestjs/testing';
import { CustomerSatisfactionSurveyService } from '../customer_satisfaction_survey.service';

describe('CustomerSatisfactionSurveyService', () => {
  let service: CustomerSatisfactionSurveyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomerSatisfactionSurveyService],
    }).compile();

    service = module.get<CustomerSatisfactionSurveyService>(
      CustomerSatisfactionSurveyService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
