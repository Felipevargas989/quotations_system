import { Controller, Get } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import type { User } from 'src/users/entities/user.entity';
import { RefundsService } from './refunds.service';

@Controller('refunds')
export class RefundsController {
  constructor(
    private readonly refundsService: RefundsService,
    private readonly logger: PinoLogger,
  ) {}

  // @Post()
  // create(@Body() createRefundDto: CreateRefundDto) {
  //   return this.refundsService.create(createRefundDto);
  // }

  @Get()
  findAll(@CurrentUser() user: User) {
    this.logger.info(
      `GET /refunds with user ${user.id} and companyId ${user.company_id}`,
    );
    return this.refundsService.findAll(user.company_id);
  }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.refundsService.findOne(+id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateRefundDto: UpdateRefundDto) {
  //   return this.refundsService.update(+id, updateRefundDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.refundsService.remove(+id);
  // }
}
