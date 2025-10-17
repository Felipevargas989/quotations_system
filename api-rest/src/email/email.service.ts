import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Resend } from 'resend';
import { EmailStructure } from './types';

@Injectable()
export class EmailService {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  emailStructure = {
    [EmailStructure.NEW_ACCOUNT]: {
      subject: 'Bienvenido a Eventia',
      html: `
        <h1>Bienvenido a Eventia</h1>
        <p>Hola, bienvenido a Eventia. Te damos la bienvenida a nuestra plataforma de cotizaciones.</p>
        <p>Visita nuestro sitio web para más información: <a href="https://www.eventi-app.com/">Visitar Eventia</a></p>
      `,
    },
    [EmailStructure.NEW_PUBLIC_QUOTATION_CLIENT]: {
      subject: 'Solicitud de cotización recibida',
      html: `
        <h1>Solicitud de cotización recibida</h1>
        <p>Hola, tu solicitud de cotización ha sido creada exitosamente.</p>
      `,
    },
  };

  async sendEmail(
    to: string,
    emailStructure: keyof typeof this.emailStructure,
  ) {
    const resend = new Resend(
      this.configService.get<string>('RESEND_API_KEY') as string,
    );
    this.logger.info(
      `Sending email to ${to} with subject ${this.emailStructure[emailStructure].subject}`,
    );
    await resend.emails.send({
      from: 'Eventia <hola@eventi-app.com>',
      to: [to],
      subject: this.emailStructure[emailStructure].subject,
      html: this.emailStructure[emailStructure].html,
    });
  }
}
