import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  async sendEmail(to: string, subject: string, text: string) {
    const resend = new Resend(
      this.configService.get<string>('RESEND_API_KEY') as string,
    );
    this.logger.info(`Sending email to ${to} with subject ${subject}`);
    await resend.emails.send({
      from: 'Eventia <hola@eventi-app.com>',
      to: [to],
      subject: subject,
      text: text,
    });
  }
}
