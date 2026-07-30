import { Body, Controller, NotFoundException, Post } from '@nestjs/common';
import { IsEmail, IsInt, IsNotEmpty } from 'class-validator';
import { PinoLogger } from 'nestjs-pino';
import { Public } from 'src/auth';
import { EmailService } from './email.service';

class SendEmailPreviewsDto {
  @IsEmail({}, { message: 'Correo de destino inválido' })
  @IsNotEmpty()
  to: string;

  @IsInt()
  @IsNotEmpty()
  company_id: number;
}

/**
 * Correos de PRUEBA (29-07-2026): dispara los correos del cliente con
 * datos de ejemplo a una casilla dada, para revisar el diseño real en
 * Gmail/Outlook. SOLO existe fuera de producción (en producción
 * responde 404): es una herramienta del laboratorio.
 */
@Controller('email-previews')
export class EmailPreviewsController {
  constructor(
    private readonly emailService: EmailService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EmailPreviewsController.name);
  }

  @Public()
  @Post()
  async sendPreviews(@Body() dto: SendEmailPreviewsDto) {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    this.logger.info(`email previews -> ${dto.to} (company ${dto.company_id})`);
    return this.emailService.sendPreviewBatch(dto.to, dto.company_id);
  }
}
