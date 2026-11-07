import { Module } from '@nestjs/common';
import { ClientsModule } from 'src/clients/clients.module';
import { QuotationFollowupsModule } from 'src/quotation-followups/quotation-followups.module';
import { BoletasController } from './boletas/boletas.controller';
import { BoletasRepository } from './boletas/boletas.repository';
import { BoletasService } from './boletas/boletas.service';
import { ConexionConFacturacionCl } from './facturas/conexion';
import { DocumentosTributariosRepository } from './facturas/documentos-tributarios.repository';
import { FacturaSinEventoController } from './facturas/factura-sin-evento.controller';
import { FacturasController } from './facturas/facturas.controller';
import { FacturasService } from './facturas/facturas.service';
import { PorFacturarController } from './facturas/por-facturar.controller';
import { PorFacturarService } from './facturas/por-facturar.service';
import { NotasController } from './notas/notas.controller';
import { NotasService } from './notas/notas.service';
import { LeerOrdenDeCompraService } from './ordenes-de-compra/leer-orden-de-compra.service';
import { OrdenesDeCompraController } from './ordenes-de-compra/ordenes-de-compra.controller';
import { OrdenesDeCompraRepository } from './ordenes-de-compra/ordenes-de-compra.repository';
import { OrdenesDeCompraService } from './ordenes-de-compra/ordenes-de-compra.service';

/**
 * LA FACTURACIÓN ELECTRÓNICA (doc 19). Las órdenes de compra de cada evento
 * (paso 2a), su lectura con BelIA (paso 2b) y la factura del evento (paso
 * 2c): el borrador, la vista previa y la emisión contra facturacion.cl
 * SIMULADO (`facturas/conexion.ts`; la conexión de verdad es el paso 5), y
 * las boletas de recepción (paso 3, `boletas/`), y la lista de Facturación
 * con la cadena de anulaciones y las notas de crédito y de débito (paso 4,
 * `notas/`). Es el módulo propio `facturacion`: solo Valle del Sol.
 */
@Module({
  imports: [ClientsModule, QuotationFollowupsModule],
  controllers: [
    OrdenesDeCompraController,
    FacturasController,
    BoletasController,
    NotasController,
    PorFacturarController,
    FacturaSinEventoController,
  ],
  providers: [
    OrdenesDeCompraService,
    OrdenesDeCompraRepository,
    LeerOrdenDeCompraService,
    FacturasService,
    PorFacturarService,
    DocumentosTributariosRepository,
    ConexionConFacturacionCl,
    BoletasService,
    BoletasRepository,
    NotasService,
  ],
  exports: [OrdenesDeCompraService],
})
export class FacturacionModule {}
