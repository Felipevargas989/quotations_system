import { Module } from '@nestjs/common';
import { LeerOrdenDeCompraService } from './ordenes-de-compra/leer-orden-de-compra.service';
import { OrdenesDeCompraController } from './ordenes-de-compra/ordenes-de-compra.controller';
import { OrdenesDeCompraRepository } from './ordenes-de-compra/ordenes-de-compra.repository';
import { OrdenesDeCompraService } from './ordenes-de-compra/ordenes-de-compra.service';

/**
 * LA FACTURACIÓN ELECTRÓNICA (doc 19). Por ahora, las órdenes de compra de
 * cada evento (paso 2a) y su lectura con BelIA (paso 2b). Los armadores del archivo (`archivo/`) y
 * facturacion.cl simulado (`facturacion-cl/`) entran con la emisión
 * (paso 2c). Es el módulo propio `facturacion`: solo Valle del Sol.
 */
@Module({
  controllers: [OrdenesDeCompraController],
  providers: [
    OrdenesDeCompraService,
    OrdenesDeCompraRepository,
    LeerOrdenDeCompraService,
  ],
  exports: [OrdenesDeCompraService],
})
export class FacturacionModule {}
