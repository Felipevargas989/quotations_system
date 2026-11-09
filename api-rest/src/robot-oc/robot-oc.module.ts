import { Module } from '@nestjs/common';
import { FacturacionModule } from 'src/facturacion/facturacion.module';
import { RobotOcController } from './robot-oc.controller';
import { RobotOcRepository } from './robot-oc.repository';
import { RobotOcService } from './robot-oc.service';

/** El robot de órdenes de compra de la rutina de correo (doc 23). */
@Module({
  imports: [FacturacionModule],
  controllers: [RobotOcController],
  providers: [RobotOcService, RobotOcRepository],
})
export class RobotOcModule {}
