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
import { CurrentUser } from 'src/auth';
import type { User } from 'src/users/entities/user.entity';
import { CheckConflictsWithExistingQuotationsDto } from './dto/check-conflicts-with-existing-quotations.dto';
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

  @Get()
  findAll(
    @CurrentUser() user: User,
    @Query() getQuotationsDto: GetQuotationsDto,
  ) {
    this.logger.info(
      `GET /quotations with user ${user.id} with params ${JSON.stringify(getQuotationsDto)}`,
    );
    return this.quotationsService.findAll(
      user.company_id,
      getQuotationsDto.request_type,
      getQuotationsDto.statuses,
    );
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
