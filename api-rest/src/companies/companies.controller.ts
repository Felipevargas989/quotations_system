import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser, Public } from 'src/auth';
import type { User } from 'src/users/entities/user.entity';
import { CompaniesService } from './companies.service';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly logger: PinoLogger,
  ) {}

  // @Post()
  // create(@Body() createCompanyDto: CreateCompanyDto) {
  //   return this.companiesService.create(createCompanyDto);
  // }

  // @Get()
  // findAll() {
  //   return this.companiesService.findAll();
  // }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    this.logger.info(`GET /companies/${id}`);
    return this.companiesService.findOne(+id);
  }

  @Patch()
  update(
    @CurrentUser() user: User,
    @Body() updateCompanyDto: UpdateCompanyDto,
  ) {
    return this.companiesService.update(user.company_id, updateCompanyDto);
  }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.companiesService.remove(+id);
  // }
}
