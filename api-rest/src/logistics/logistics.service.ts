import { ConflictException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/create-supplier.dto';
import { LogisticsRepository } from './logistics.repository';

// Mudanza #2 de "una sola puerta" (28-07): módulo Logística en el
// backend. Parte con PROVEEDORES; las demás pestañas (insumos, compras,
// recursos) se mudan acá una por una en próximas sesiones.
@Injectable()
export class LogisticsService {
  constructor(
    private readonly logisticsRepository: LogisticsRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LogisticsService.name);
  }

  findAllSuppliers(companyId: number) {
    return this.logisticsRepository.findAllSuppliers(companyId);
  }

  suppliersUsage(companyId: number) {
    return this.logisticsRepository.suppliersUsage(companyId);
  }

  createSupplier(companyId: number, dto: CreateSupplierDto) {
    return this.logisticsRepository.createSupplier(companyId, dto);
  }

  updateSupplier(companyId: number, id: number, dto: UpdateSupplierDto) {
    return this.logisticsRepository.updateSupplier(companyId, id, dto);
  }

  // Misma regla que la pantalla: con insumos o recursos apuntándole,
  // el proveedor NO se elimina (las compras se generan a su nombre).
  // Acá la regla queda en el servidor, no solo en el botón.
  async deleteSupplier(companyId: number, id: number) {
    const usage = await this.logisticsRepository.suppliersUsage(companyId);
    const refs = usage[id];
    if (refs && (refs.supplies > 0 || refs.resources > 0)) {
      throw new ConflictException(
        'Este proveedor tiene insumos o recursos asociados: no se puede eliminar.',
      );
    }
    return this.logisticsRepository.deleteSupplier(companyId, id);
  }
}
