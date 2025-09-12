import { Controller, Get } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { CurrentUser } from 'src/auth';
import type { User } from 'src/users/entities/user.entity';

@Controller('quotations')
export class QuotationsController {
  constructor(private readonly quotationsService: QuotationsService) {}

  // @Post()
  // create(@Body() createQuotationDto: CreateQuotationDto) {
  //   return this.quotationsService.create(createQuotationDto);
  // }

  @Get()
  findAll(@CurrentUser() user: User) {
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
