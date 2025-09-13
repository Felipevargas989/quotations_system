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
import { RequestType } from './constants/constants';
import { CreateQuotationDto } from './dto/create-quotation.dto';
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
    return this.quotationsService.create(
      createQuotationDto,
      user.company_id,
      user.id,
    );
  }

  @Get()
  findAll(
    @CurrentUser() user: User,
    @Query('request_type') request_type?: RequestType,
  ) {
    this.logger.info(`GET /quotations with user ${user.id}`);
    return this.quotationsService.findAll(user.company_id, request_type);
  }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.quotationsService.findOne(+id);
  // }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateQuotationDto: UpdateQuotationDto,
    @CurrentUser() user: User,
  ) {
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
