import { Module } from '@nestjs/common';
import { ClientsModule } from 'src/clients/clients.module';
import { EmailModule } from 'src/email/email.module';
import { QuotationFollowupsModule } from 'src/quotation-followups/quotation-followups.module';
import { FacturasAprobadasController } from './aprobadas/facturas-aprobadas.controller';
import { FacturasAprobadasRepository } from './aprobadas/facturas-aprobadas.repository';
import { FacturasAprobadasService } from './aprobadas/facturas-aprobadas.service';
import { BoletasController } from './boletas/boletas.controller';
import { BoletasRepository } from './boletas/boletas.repository';
import { BoletasService } from './boletas/boletas.service';
import { CajaController } from './caja/caja.controller';
import { CajaRepository } from './caja/caja.repository';
import { CajaService } from './caja/caja.service';
import { FacturasTraidasController } from './facturas-traidas/facturas-traidas.controller';
import { FacturasTraidasRepository } from './facturas-traidas/facturas-traidas.repository';
import { FacturasTraidasService } from './facturas-traidas/facturas-traidas.service';
import { ConexionConFacturacionCl } from './facturas/conexion';
import { DocumentosTributariosRepository } from './facturas/documentos-tributarios.repository';
import { FacturaSinEventoController } from './facturas/factura-sin-evento.controller';
import { FacturasController } from './facturas/facturas.controller';
import { FacturasService } from './facturas/facturas.service';
import { PorFacturarController } from './facturas/por-facturar.controller';
import { PorFacturarService } from './facturas/por-facturar.service';
import { NominaSiiController } from './nomina-sii/nomina-sii.controller';
import { NominaSiiRepository } from './nomina-sii/nomina-sii.repository';
import { NominaSiiService } from './nomina-sii/nomina-sii.service';
import { NotasController } from './notas/notas.controller';
import { NotasService } from './notas/notas.service';
import { LeerOrdenDeCompraService } from './ordenes-de-compra/leer-orden-de-compra.service';
import { OrdenesDeCompraController } from './ordenes-de-compra/ordenes-de-compra.controller';
import { OrdenesDeCompraRepository } from './ordenes-de-compra/ordenes-de-compra.repository';
import { OrdenesDeCompraService } from './ordenes-de-compra/ordenes-de-compra.service';
import { RecibidosController } from './recibidos/recibidos.controller';
import { RecibidosRepository } from './recibidos/recibidos.repository';
import { RecibidosService } from './recibidos/recibidos.service';
import { SolicitudesController } from './solicitudes/solicitudes.controller';
import { SolicitudesRepository } from './solicitudes/solicitudes.repository';
import { SolicitudesService } from './solicitudes/solicitudes.service';

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
  // El correo: el resumen del cierre de la caja (doc 19 §9.43).
  imports: [ClientsModule, QuotationFollowupsModule, EmailModule],
  controllers: [
    OrdenesDeCompraController,
    FacturasController,
    BoletasController,
    NotasController,
    FacturasTraidasController,
    PorFacturarController,
    FacturaSinEventoController,
    NominaSiiController,
    RecibidosController,
    CajaController,
    // Las solicitudes de recepción (doc 19 §9.45).
    SolicitudesController,
    // Las facturas aprobadas que esperan (doc 19 §9.48).
    FacturasAprobadasController,
  ],
  providers: [
    CajaService,
    CajaRepository,
    SolicitudesService,
    SolicitudesRepository,
    FacturasAprobadasService,
    FacturasAprobadasRepository,
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
    FacturasTraidasService,
    FacturasTraidasRepository,
    NominaSiiService,
    NominaSiiRepository,
    RecibidosService,
    RecibidosRepository,
  ],
  exports: [OrdenesDeCompraService],
})
export class FacturacionModule {}
