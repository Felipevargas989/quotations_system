import { Test, TestingModule } from '@nestjs/testing';
import { CustomerSatisfactionSurveyController } from '../customer_satisfaction_survey.controller';
import { CustomerSatisfactionSurveyService } from '../customer_satisfaction_survey.service';

describe('CustomerSatisfactionSurveyController', () => {
  let controller: CustomerSatisfactionSurveyController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomerSatisfactionSurveyController],
      providers: [CustomerSatisfactionSurveyService],
    }).compile();

    controller = module.get<CustomerSatisfactionSurveyController>(
      CustomerSatisfactionSurveyController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
