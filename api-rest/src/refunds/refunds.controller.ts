import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { OPERATIONS_AND_UP, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { RegisterRefundDto } from './dto/register-refund.dto';
import { RefundsService } from './refunds.service';

// Mudanza #7 (28-07): Post-Venta deja el acceso directo. Reembolsos son
// terreno de operaciones y administración.
@Roles(...OPERATIONS_AND_UP)
@Controller('refunds')
export class RefundsController {
  constructor(
    private readonly refundsService: RefundsService,
    private readonly logger: PinoLogger,
  ) {}

  @Get('by-quotation')
  findByQuotation(
    @Query('quotationId') quotationId: string,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`GET /refunds/by-quotation ${quotationId}`);
    return this.refundsService.findByQuotation(user.company_id, quotationId);
  }

  @Get('paid-map')
  paidMap(@CurrentUser() user: User) {
    this.logger.info(`GET /refunds/paid-map company ${user.company_id}`);
    return this.refundsService.paidMapByCompany(user.company_id);
  }

  @Patch(':id/register')
  register(
    @Param('id') id: string,
    @Body() dto: RegisterRefundDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`PATCH /refunds/${id}/register`);
    return this.refundsService.registerPaid(user.company_id, id, dto);
  }

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
