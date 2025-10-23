import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { EmailService } from 'src/email/email.service';
import { EmailStructure } from 'src/email/types';
import { UserRole } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class AnalyticsCronService {
  constructor(
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
    private readonly logger: PinoLogger,
  ) {}

  // executed every Friday at 12:00 PM UTC
  @Cron('0 12 * * FRI')
  async sendWeeklyAnalytics() {
    this.logger.info('CRON job: Sending weekly analytics');
    // get admin of all companies
    const admins = await this.usersService.findAll(
      undefined,
      UserRole.ADMINISTRADOR,
    );

    // get emails
    const adminEmails = admins.map((admin) => admin.email);

    // get start and end date
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date();
    endDate.setDate(endDate.getDate());

    // Format dates as YYYY-MM-DD for URL parameters
    const formatDate = (date: Date) => {
      return date.toISOString().split('T')[0];
    };

    // send email to admin with link to week analytycs
    await this.emailService.sendEmail(
      adminEmails,
      EmailStructure.WEEKLY_ANALYTICS,
      {
        link: `https://www.eventi-app.com/analytics?from=${formatDate(startDate)}&to=${formatDate(endDate)}`,
      },
    );
  }
}
