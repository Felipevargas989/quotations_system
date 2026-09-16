import { Module } from '@nestjs/common';
import { EmailModule } from 'src/email/email.module';
import { MercadoPagoService } from './mercadopago.service';
import { PagosController } from './pagos.controller';
import { PagosRepository } from './pagos.repository';
import { PagosService } from './pagos.service';

// El módulo del cobro (sprint B del paso 4+5). UsersService llega solo
// (UsersModule es @Global), DerechosService también (paso 3.2).
@Module({
  imports: [EmailModule],
  controllers: [PagosController],
  providers: [PagosService, PagosRepository, MercadoPagoService],
  exports: [PagosService],
})
export class PagosModule {}
