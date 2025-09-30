import { Body, Controller, Patch } from '@nestjs/common';
import { CurrentUser } from 'src/auth/user.decorator';
import type { User } from 'src/users/entities/user.entity';
import { CompaniesService } from './companies.service';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  // @Post()
  // create(@Body() createCompanyDto: CreateCompanyDto) {
  //   return this.companiesService.create(createCompanyDto);
  // }

  // @Get()
  // findAll() {
  //   return this.companiesService.findAll();
  // }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.companiesService.findOne(+id);
  // }

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
