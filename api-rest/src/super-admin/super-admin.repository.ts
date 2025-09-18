import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CreateSuscriptionDto } from './dto/create-suscription.dto';

@Injectable()
export class SuperAdminRepository {
  constructor(private readonly logger: PinoLogger) {}

  createSuscription(createSuscriptionDto: CreateSuscriptionDto) {
    this.logger.info(
      `createSuscription with createSuscriptionDto ${JSON.stringify(createSuscriptionDto)}`,
    );
  }
}
