import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  IsNotEmpty,
  IsNumberString,
  IsString,
  MaxLength,
} from 'class-validator';
import { PinoLogger } from 'nestjs-pino';
import { Public } from 'src/auth';
import { QuotationsService } from './quotations.service';

class SubmitPortalReceiptDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  payment_id: string;

  // Llega como texto (multipart); el servicio lo valida como monto.
  @IsNumberString()
  @IsNotEmpty()
  declared_amount: string;
}

/**
 * Portal del mandante (Fases 2a y 2b): las únicas puertas PÚBLICAS del
 * portal, protegidas por el enlace secreto del contacto (migración 48).
 * Token inválido = 404 sin pistas. Techos de frecuencia estrictos como
 * en toda escritura pública.
 */
@Controller('portal')
export class PortalController {
  constructor(
    private readonly quotationsService: QuotationsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PortalController.name);
  }

  @Public()
  @Get(':token')
  getPortal(@Param('token') token: string) {
    this.logger.info('GET /portal (token oculto)');
    return this.quotationsService.getPortalData(token);
  }

  // La cotización completa para la hoja/PDF del portal. Solo si
  // pertenece al mandante del token; campos en LISTA BLANCA (los
  // costos internos jamás salen por aquí).
  @Public()
  @Get(':token/cotizacion/:quotationId')
  getPortalQuotation(
    @Param('token') token: string,
    @Param('quotationId') quotationId: string,
  ) {
    this.logger.info('GET /portal/cotizacion (token oculto)');
    return this.quotationsService.getPortalQuotation(token, quotationId);
  }

  // Fase 2b: "Ya transferí" — el cliente sube su comprobante. Queda
  // PENDIENTE hasta que el equipo lo confirme en Post-Venta.
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':token/comprobante')
  @UseInterceptors(FileInterceptor('file'))
  submitReceipt(
    @Param('token') token: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: SubmitPortalReceiptDto,
  ) {
    this.logger.info('POST /portal/comprobante (token oculto)');
    return this.quotationsService.submitPortalReceipt(token, file, {
      payment_id: dto.payment_id,
      declared_amount: Number(dto.declared_amount),
    });
  }
}
