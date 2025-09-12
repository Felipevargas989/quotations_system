import { Controller, Get } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { CurrentUser } from 'src/auth';
import type { User } from 'src/users/entities/user.entity';
import { PinoLogger } from 'nestjs-pino';

@Controller('quotations')
export class QuotationsController {
  constructor(
    private readonly quotationsService: QuotationsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(QuotationsController.name);
  }

  // @Post()
  // create(@Body() createQuotationDto: CreateQuotationDto) {
  //   return this.quotationsService.create(createQuotationDto);
  // }

  @Get()
  findAll(@CurrentUser() user: User) {
    this.logger.info(`GET /quotations with user ${user.id}`);
    return this.quotationsService.findAll(user);
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
