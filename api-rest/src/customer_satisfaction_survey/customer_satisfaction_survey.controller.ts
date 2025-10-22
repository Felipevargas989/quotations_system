import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CustomerSatisfactionSurveyService } from './customer_satisfaction_survey.service';
import { CreateCustomerSatisfactionSurveyDto } from './dto/create-customer_satisfaction_survey.dto';
import { UpdateCustomerSatisfactionSurveyDto } from './dto/update-customer_satisfaction_survey.dto';

@Controller('customer-satisfaction-survey')
export class CustomerSatisfactionSurveyController {
  constructor(
    private readonly customerSatisfactionSurveyService: CustomerSatisfactionSurveyService,
  ) {}

  @Post()
  create(
    @Body()
    createCustomerSatisfactionSurveyDto: CreateCustomerSatisfactionSurveyDto,
  ) {
    return this.customerSatisfactionSurveyService.create(
      createCustomerSatisfactionSurveyDto,
    );
  }

  @Get()
  findAll() {
    return this.customerSatisfactionSurveyService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customerSatisfactionSurveyService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    updateCustomerSatisfactionSurveyDto: UpdateCustomerSatisfactionSurveyDto,
  ) {
    return this.customerSatisfactionSurveyService.update(
      +id,
      updateCustomerSatisfactionSurveyDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customerSatisfactionSurveyService.remove(+id);
  }
}
