import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { CompaniesRepository } from 'src/companies/companies.repository';
import { Company } from 'src/companies/entities/company.entity';
import { CustomerSatisfactionSurveyService } from 'src/customer_satisfaction_survey/service';
import { EmailService } from 'src/email/email.service';
import { EmailStructure } from 'src/email/types/index';
import { CreateUserDto } from 'src/users/dto/create-user.dto';
import { UserRole } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { CreateSuscriptionDto } from './dto/create-suscription.dto';
import { NotifySuperAdminDto } from './dto/notify-super-admin.dto';
import { QuotationStatsResponse } from './dto/quotation-stats.dto';
import { SuperAdminRepository } from './super-admin.repository';

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly companiesRepository: CompaniesRepository,
    private readonly superAdminRepository: SuperAdminRepository,
    @Inject(forwardRef(() => CustomerSatisfactionSurveyService))
    private readonly customerSatisfactionSurveyService: CustomerSatisfactionSurveyService,
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
        // all notifications are enabled by default
        notifications: {
          emails: Object.values(EmailStructure).reduce(
            (acc, email) => {
              acc[email] = true;
              return acc;
            },
            {} as Record<EmailStructure, boolean>,
          ),
        },
        currency: createSuscriptionDto.currency,
        is_active: true,
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

      // create customer satisfaction survey template
      await this.customerSatisfactionSurveyService.createTemplate(
        companyData.id,
      );

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
      const rangeEnd = new Date();
      const rangeStart = new Date(rangeEnd);
      rangeStart.setDate(rangeStart.getDate() - 30);
      const periodStart = rangeStart.toISOString().split('T')[0];
      const periodEnd = rangeEnd.toISOString().split('T')[0];
      const period = `${periodStart} to ${periodEnd}`;

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

      const {
        data: usersLastSignIns,
        error: usersLastSignInsError,
        totals: userTotals,
      } = await this.superAdminRepository.getUsersLastSignIns({
        startDate: rangeStart,
        endDate: rangeEnd,
      });

      if (usersLastSignInsError) {
        this.logger.error(
          `Error getting auth user stats: ${usersLastSignInsError.message}`,
        );
        throw new Error(
          `Failed to get user stats: ${usersLastSignInsError.message}`,
        );
      }

      const response: QuotationStatsResponse = {
        period,
        companies: data,
        total_quotations,
        total_quotations_all_companies,
        total_amount_all_companies,
        user_sign_in_stats: {
          period_start: periodStart,
          period_end: periodEnd,
          total_users: userTotals.total_users,
          total_signed_in_in_period: userTotals.total_signed_in_in_period,
          total_never_signed_in: userTotals.total_never_signed_in,
          users: usersLastSignIns || [],
        },
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

  async notifySuperAdmins({ content }: NotifySuperAdminDto) {
    this.logger.info(`notifySuperAdmins with content: ${content}`);

    const emailsEnv = this.configService.get<string>('SUPER_ADMIN_EMAILS');

    if (!emailsEnv) {
      const errorMessage = 'SUPER_ADMIN_EMAILS env variable is not configured';
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    const recipients = emailsEnv
      .split(',')
      .map((email) => email.trim())
      .filter((email) => email.length > 0);

    if (recipients.length === 0) {
      const errorMessage =
        'SUPER_ADMIN_EMAILS env variable has no valid emails';
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    try {
      await this.emailService.sendEmail(
        recipients,
        EmailStructure.SUPER_ADMIN_NOTIFICATION,
        { content },
      );
      return {
        success: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error notifying super admins: ${errorMessage}`);
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
