import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Public } from 'src/auth';
import { CreateAnswerDto } from './dto/create-answer.dto';
import { CustomerSatisfactionSurveyService } from './service';

@Controller('customer-satisfaction-survey')
export class CustomerSatisfactionSurveyController {
  constructor(
    private readonly customerSatisfactionSurveyService: CustomerSatisfactionSurveyService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CustomerSatisfactionSurveyController.name);
  }

  @Public()
  @Post('template')
  createTemplate(@Query('companyId') companyId: number) {
    this.logger.info(
      `POST /customer-satisfaction-survey/template with companyId ${companyId}`,
    );
    return this.customerSatisfactionSurveyService.createTemplate(companyId);
  }

  @Public()
  @Get('template')
  getTemplate(@Query('companyId') companyId: number) {
    this.logger.info(
      `GET /customer-satisfaction-survey/template with companyId ${companyId}`,
    );
    return this.customerSatisfactionSurveyService.getTemplate(companyId);
  }

  @Public()
  @Post('answer')
  createAnswer(@Body() createAnswerDto: CreateAnswerDto) {
    this.logger.info(
      `POST /customer-satisfaction-survey/answer with createAnswerDto ${JSON.stringify(createAnswerDto)}`,
    );
    return this.customerSatisfactionSurveyService.createAnswer(createAnswerDto);
  }

  // @Get()
  // findAll() {
  //   return this.customerSatisfactionSurveyService.findAll();
  // }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.customerSatisfactionSurveyService.findOne(+id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string) {
  //   return this.customerSatisfactionSurveyService.update(+id);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.customerSatisfactionSurveyService.remove(+id);
  // }
}
