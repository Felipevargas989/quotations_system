import { ConflictException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/create-supplier.dto';
import { CreateSupplyDto, UpdateSupplyDto } from './dto/create-supply.dto';
import {
  CreateFurnitureItemDto,
  CreateManagementResourceDto,
  UpdateFurnitureItemDto,
  UpdateManagementResourceDto,
} from './dto/create-catalog-items.dto';
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

  // ---------- Mobiliario (mudanza #4) ----------

  findAllFurniture(companyId: number) {
    return this.logisticsRepository.findAllFurniture(companyId);
  }

  furnitureUsage(companyId: number) {
    return this.logisticsRepository.furnitureUsage(companyId);
  }

  createFurniture(companyId: number, dto: CreateFurnitureItemDto) {
    return this.logisticsRepository.createFurniture(companyId, dto);
  }

  updateFurniture(companyId: number, id: number, dto: UpdateFurnitureItemDto) {
    return this.logisticsRepository.updateFurniture(companyId, id, dto);
  }

  // En recetas no se elimina (borraría líneas de receta en cascada).
  async deleteFurniture(companyId: number, id: number) {
    const usage = await this.logisticsRepository.furnitureUsage(companyId);
    if (usage[id] && usage[id].recipes > 0) {
      throw new ConflictException(
        'Este mobiliario aparece en recetas: desactívalo en vez de eliminarlo.',
      );
    }
    return this.logisticsRepository.deleteFurniture(companyId, id);
  }

  // ---------- Recursos de gestión (mudanza #5) ----------

  findAllResources(companyId: number) {
    return this.logisticsRepository.findAllResources(companyId);
  }

  resourcesUsage(companyId: number) {
    return this.logisticsRepository.resourcesUsage(companyId);
  }

  createResource(companyId: number, dto: CreateManagementResourceDto) {
    return this.logisticsRepository.createResource(companyId, dto);
  }

  updateResource(
    companyId: number,
    id: number,
    dto: UpdateManagementResourceDto,
  ) {
    return this.logisticsRepository.updateResource(companyId, id, dto);
  }

  // Con líneas de costo o eventos asignados, no se elimina.
  async deleteResource(companyId: number, id: number) {
    const usage = await this.logisticsRepository.resourcesUsage(companyId);
    const refs = usage[id];
    if (refs && (refs.costLines > 0 || refs.events > 0)) {
      throw new ConflictException(
        'Este recurso tiene costos o eventos asociados: no se puede eliminar.',
      );
    }
    return this.logisticsRepository.deleteResource(companyId, id);
  }

  // ---------- Insumos (mudanza #3) ----------

  findAllSupplies(companyId: number) {
    return this.logisticsRepository.findAllSupplies(companyId);
  }

  suppliesUsage(companyId: number, ids: number[]) {
    return this.logisticsRepository.suppliesUsage(companyId, ids);
  }

  createSupply(companyId: number, dto: CreateSupplyDto) {
    return this.logisticsRepository.createSupply(companyId, dto);
  }

  updateSupply(companyId: number, id: number, dto: UpdateSupplyDto) {
    return this.logisticsRepository.updateSupply(companyId, id, dto);
  }

  // Regla de la pantalla, ahora de servidor: un insumo con recetas o
  // compras registradas NO se elimina (borrarlo arrastraría líneas de
  // receta e historial); la alternativa es desactivarlo.
  async deleteSupply(companyId: number, id: number) {
    const usage = await this.logisticsRepository.suppliesUsage(companyId, [id]);
    const refs = usage[id];
    if (refs && (refs.recipes > 0 || refs.provisions > 0)) {
      throw new ConflictException(
        'Este insumo aparece en recetas o compras: desactívalo en vez de eliminarlo.',
      );
    }
    return this.logisticsRepository.deleteSupply(companyId, id);
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
