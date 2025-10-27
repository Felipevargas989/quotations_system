import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser, Public } from 'src/auth';
import { Company } from 'src/companies/entities/company.entity';
import type { User } from 'src/users/entities/user.entity';
import { CheckConflictsWithExistingQuotationsDto } from './dto/check-conflicts-with-existing-quotations.dto';
import { CreateQuotationPublicDto } from './dto/create-quotation-public.dto';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { GetQuotationsDto } from './dto/get-quotations.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { QuotationsService } from './quotations.service';

@Controller('quotations')
export class QuotationsController {
  constructor(
    private readonly quotationsService: QuotationsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(QuotationsController.name);
  }

  @Post()
  create(
    @Body() createQuotationDto: CreateQuotationDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /quotations with createQuotationDto ${JSON.stringify(createQuotationDto)}`,
    );
    return this.quotationsService.create(
      createQuotationDto,
      user.company_id,
      user.id,
    );
  }

  @Public()
  @Post('public/:company_id')
  createPublic(
    @Body() createQuotationPublicDto: CreateQuotationPublicDto,
    @Param('company_id') company_id: Company['id'],
  ) {
    this.logger.info(
      `POST /quotations with createQuotationDto ${JSON.stringify(createQuotationPublicDto)}`,
    );
    return this.quotationsService.createPublic(
      createQuotationPublicDto,
      company_id,
    );
  }

  @Get()
  findAll(
    @CurrentUser() user: User,
    @Query() getQuotationsDto: GetQuotationsDto,
  ) {
    this.logger.info(
      `GET /quotations with user ${user.id} with params ${JSON.stringify(getQuotationsDto)}`,
    );
    return this.quotationsService.findAll({
      companyId: user.company_id,
      request_type: getQuotationsDto.request_type,
      statuses: getQuotationsDto.statuses,
      sort_by: getQuotationsDto.sort_by,
      sort_order: getQuotationsDto.sort_order,
    });
  }

  @Get('check-conflicts')
  checkConflictsWithExistingQuotations(
    @Query()
    params: CheckConflictsWithExistingQuotationsDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `GET /quotations/check-conflicts with params ${JSON.stringify(params)}`,
    );
    return this.quotationsService.checkConflictsWithExistingQuotations(
      params,
      user.company_id,
    );
  }

  // This is public becaue it is used to display the quotation details in the public customer satisfaction survey
  // TODO: maybe create public endpoint for this, instead of using the current one
  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.quotationsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateQuotationDto: UpdateQuotationDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `PATCH /quotations/${id} with updateQuotationDto ${JSON.stringify(updateQuotationDto)}`,
    );
    return this.quotationsService.update(
      id,
      updateQuotationDto,
      user.company_id,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.quotationsService.remove(id, user.company_id);
  }
}
