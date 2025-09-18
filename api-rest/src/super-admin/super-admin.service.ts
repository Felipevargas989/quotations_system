import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CompaniesRepository } from 'src/companies/companies.repository';
import { Company } from 'src/companies/entities/company.entity';
import { CreateUserDto } from 'src/users/dto/create-user.dto';
import { UserRole } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { CreateSuscriptionDto } from './dto/create-suscription.dto';

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly usersService: UsersService,
    private readonly companiesRepository: CompaniesRepository,
  ) {}

  async createSuscription(createSuscriptionDto: CreateSuscriptionDto) {
    this.logger.info(
      `createSuscription with createSuscriptionDto ${JSON.stringify(createSuscriptionDto)}`,
    );

    try {
      // 1. Create company in public.companies table
      const newCompany: Omit<Company, 'id'> = {
        name: createSuscriptionDto.company_name,
      };
      const { data: companyData, error: companyError } =
        await this.companiesRepository.create(newCompany);

      if (companyError) {
        throw new Error(`Failed to create company: ${companyError.message}`);
      }

      if (!companyData) {
        throw new Error(`Failed to create company`);
      }

      //  2. Create user
      const newUser: CreateUserDto = {
        email: createSuscriptionDto.admin_email,
        full_name: createSuscriptionDto.admin_full_name,
        role: UserRole.ADMINISTRADOR,
        password: createSuscriptionDto.admin_password,
      };

      const { data: userData, error: userError } =
        await this.usersService.create(newUser, companyData.id);

      if (userError) {
        throw userError;
      }

      return {
        userData,
        companyData,
      };

      // return this.superAdminRepository.createSuscription(createSuscriptionDto);
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
  // create(createSuperAdminDto: CreateSuperAdminDto) {
  //   return 'This action adds a new superAdmin';
  // }
  // findAll() {
  //   return `This action returns all superAdmin`;
  // }
  // findOne(id: number) {
  //   return `This action returns a #${id} superAdmin`;
  // }
  // update(id: number, updateSuperAdminDto: UpdateSuperAdminDto) {
  //   return `This action updates a #${id} superAdmin`;
  // }
  // remove(id: number) {
  //   return `This action removes a #${id} superAdmin`;
  // }
}
