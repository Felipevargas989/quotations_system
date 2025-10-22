import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CompaniesRepository } from 'src/companies/companies.repository';
import { Company } from 'src/companies/entities/company.entity';
import { EmailService } from 'src/email/email.service';
import { EmailStructure } from 'src/email/types/index';
import { CreateUserDto } from 'src/users/dto/create-user.dto';
import { UserRole } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { CreateSuscriptionDto } from './dto/create-suscription.dto';
import { QuotationStatsResponse } from './dto/quotation-stats.dto';
import { SuperAdminRepository } from './super-admin.repository';

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly logger: PinoLogger,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly companiesRepository: CompaniesRepository,
    private readonly superAdminRepository: SuperAdminRepository,
    private readonly emailService: EmailService,
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

      // send email to the admin
      try {
        void this.emailService.sendEmail(
          createSuscriptionDto.admin_email,
          EmailStructure.NEW_ACCOUNT,
        );
      } catch (error) {
        // Do not throw error, just log it
        this.logger.error(error);
      }
      return {
        userData,
        companyData,
      };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async getStatsLastMonth(): Promise<QuotationStatsResponse> {
    this.logger.info(`getStatsLastMonth for all companies`);

    try {
      const { data, error } =
        await this.superAdminRepository.getStatsLastMonth();

      if (error) {
        this.logger.error(`Error getting stats: ${error.message}`);
        throw new Error(`Failed to get quotation stats: ${error.message}`);
      }

      if (!data) {
        throw new Error('No data returned from repository');
      }

      // Calculate total quotations and total amount for all companies
      const total_quotations_all_companies = data.reduce(
        (sum, company) => sum + company.total_quotations,
        0,
      );
      const total_amount_all_companies = data.reduce(
        (sum, company) => sum + company.total_amount,
        0,
      );

      // Get the period string for last 30 days
      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const period = `${thirtyDaysAgo.toISOString().split('T')[0]} to ${now.toISOString().split('T')[0]}`;

      // Aggregate total quotations and amounts across all companies by day
      const totalQuotationsByDay = new Map<
        string,
        { count: number; total_amount: number }
      >();

      data.forEach((company) => {
        company.stats.forEach((stat) => {
          const current = totalQuotationsByDay.get(stat.date) || {
            count: 0,
            total_amount: 0,
          };
          totalQuotationsByDay.set(stat.date, {
            count: current.count + stat.count,
            total_amount: current.total_amount + stat.total_amount,
          });
        });
      });

      // Convert to array and sort by date
      const total_quotations = Array.from(totalQuotationsByDay.entries())
        .map(([date, data]) => ({
          date,
          count: data.count,
          total_amount: data.total_amount,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const response: QuotationStatsResponse = {
        period,
        companies: data,
        total_quotations,
        total_quotations_all_companies,
        total_amount_all_companies,
      };

      this.logger.info(
        `Successfully retrieved stats for all companies: ${total_quotations_all_companies} quotations in period ${period}`,
      );

      return response;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error in getStatsLastMonth service: ${errorMessage}`);
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
