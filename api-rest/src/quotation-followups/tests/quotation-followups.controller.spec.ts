import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger, provideMock } from '../../testing/mocks';
import { QuotationFollowupsController } from '../quotation-followups.controller';
import { QuotationFollowupsService } from '../quotation-followups.service';

// Mismo esqueleto que refunds: el controller se construye con sus
// servicios mockeados — nunca instanciar servicios reales acá.
describe('QuotationFollowupsController', () => {
  let controller: QuotationFollowupsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuotationFollowupsController],
      providers: [
        provideMock(QuotationFollowupsService),
        { provide: PinoLogger, useValue: mockPinoLogger() },
      ],
    }).compile();

    controller = module.get<QuotationFollowupsController>(
      QuotationFollowupsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
