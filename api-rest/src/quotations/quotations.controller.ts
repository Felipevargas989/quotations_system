import { Body, Controller, Get, Post } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import type { User } from 'src/users/entities/user.entity';
import { CreateQuotationDto } from './dto/create-quotation.dto';
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
  findAll(@CurrentUser() user: User) {
    this.logger.info(`GET /quotations with user ${user.id}`);
    return this.quotationsService.findAll(user.company_id);
  }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.quotationsService.findOne(+id);
  // }

  // @Patch(':id')
  // update(
  //   @Param('id') id: string,
  //   @Body() updateQuotationDto: UpdateQuotationDto,
  // ) {
  //   return this.quotationsService.update(+id, updateQuotationDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.quotationsService.remove(+id);
  // }
}
