import { ConflictException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  CreateFurnitureItemDto,
  CreateManagementResourceDto,
  UpdateFurnitureItemDto,
  UpdateManagementResourceDto,
} from './dto/create-catalog-items.dto';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
} from './dto/create-supplier.dto';
import { CreateSupplyDto, UpdateSupplyDto } from './dto/create-supply.dto';
import {
  AddCostItemDto,
  AddEventResourcesDto,
  AddKitchenNoteDto,
  AddRecipeItemDto,
  MarkProvisionedDto,
  SetServiceTimeDto,
  UpdateCostItemDto,
  UpdateEventResourceDto,
  UpdateFixedCostsDto,
  UpdateRecipeItemDto,
  UpsertSupplyProvisionsDto,
} from './dto/event-operations.dto';
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

  // ---------- Compras, eventos, cocina, recetas y costos (mudanza #6) ----------
  // Pasadas directas: la lógica vive en el repositorio (consultas) y las
  // reglas de negocio de estas pantallas viven en el flujo de las
  // pantallas mismas (paridad exacta con el comportamiento anterior).

  findAcceptedEvents(companyId: number) {
    return this.logisticsRepository.findAcceptedEvents(companyId);
  }
  findWonEventsSince(companyId: number, fromISO: string) {
    return this.logisticsRepository.findWonEventsSince(companyId, fromISO);
  }
  markProvisioned(companyId: number, dto: MarkProvisionedDto) {
    return this.logisticsRepository.markProvisioned(companyId, dto);
  }
  clearProvisioned(companyId: number, ids: string[]) {
    return this.logisticsRepository.clearProvisioned(companyId, ids);
  }
  quotationProvisioning(companyId: number, quotationId: string) {
    return this.logisticsRepository.quotationProvisioning(
      companyId,
      quotationId,
    );
  }
  findSupplyProvisions(companyId: number) {
    return this.logisticsRepository.findSupplyProvisions(companyId);
  }
  upsertSupplyProvisions(companyId: number, dto: UpsertSupplyProvisionsDto) {
    return this.logisticsRepository.upsertSupplyProvisions(companyId, dto);
  }
  deleteSupplyProvisions(
    companyId: number,
    quotationIds: string[],
    supplyIds?: number[],
  ) {
    return this.logisticsRepository.deleteSupplyProvisions(
      companyId,
      quotationIds,
      supplyIds,
    );
  }
  findEventResources(companyId: number, quotationId: string) {
    return this.logisticsRepository.findEventResources(companyId, quotationId);
  }
  findAllEventResources(companyId: number) {
    return this.logisticsRepository.findAllEventResources(companyId);
  }
  addEventResources(companyId: number, dto: AddEventResourcesDto) {
    return this.logisticsRepository.addEventResources(companyId, dto);
  }
  updateEventResource(
    companyId: number,
    id: number,
    dto: UpdateEventResourceDto,
  ) {
    return this.logisticsRepository.updateEventResource(companyId, id, dto);
  }
  deleteEventResource(companyId: number, id: number) {
    return this.logisticsRepository.deleteEventResource(companyId, id);
  }
  findServiceTimes(companyId: number, quotationId: string) {
    return this.logisticsRepository.findServiceTimes(companyId, quotationId);
  }
  setServiceTime(companyId: number, dto: SetServiceTimeDto) {
    return this.logisticsRepository.setServiceTime(companyId, dto);
  }
  findKitchenNotes(companyId: number, quotationId: string) {
    return this.logisticsRepository.findKitchenNotes(companyId, quotationId);
  }
  addKitchenNote(companyId: number, dto: AddKitchenNoteDto) {
    return this.logisticsRepository.addKitchenNote(companyId, dto);
  }
  deleteKitchenNote(companyId: number, id: number) {
    return this.logisticsRepository.deleteKitchenNote(companyId, id);
  }
  findDayPrints(companyId: number, quotationId: string) {
    return this.logisticsRepository.findDayPrints(companyId, quotationId);
  }
  markDaysPrinted(companyId: number, quotationId: string, days: number[]) {
    return this.logisticsRepository.markDaysPrinted(
      companyId,
      quotationId,
      days,
    );
  }
  findRecipeItems(companyId: number, serviceType: string, serviceId: number) {
    return this.logisticsRepository.findRecipeItems(
      companyId,
      serviceType,
      serviceId,
    );
  }
  findAllRecipeItems(companyId: number) {
    return this.logisticsRepository.findAllRecipeItems(companyId);
  }
  addRecipeItem(companyId: number, dto: AddRecipeItemDto) {
    return this.logisticsRepository.addRecipeItem(companyId, dto);
  }
  updateRecipeItem(companyId: number, id: number, dto: UpdateRecipeItemDto) {
    return this.logisticsRepository.updateRecipeItem(companyId, id, dto);
  }
  deleteRecipeItem(companyId: number, id: number) {
    return this.logisticsRepository.deleteRecipeItem(companyId, id);
  }
  catalogServiceNames(companyId: number) {
    return this.logisticsRepository.catalogServiceNames(companyId);
  }
  fixedServiceCosts(companyId: number) {
    return this.logisticsRepository.fixedServiceCosts(companyId);
  }
  updateFixedServiceCosts(
    companyId: number,
    id: number,
    dto: UpdateFixedCostsDto,
  ) {
    return this.logisticsRepository.updateFixedServiceCosts(companyId, id, dto);
  }
  findFixedServiceCostItems(companyId: number, fixedServiceId?: number) {
    return this.logisticsRepository.findFixedServiceCostItems(
      companyId,
      fixedServiceId,
    );
  }
  addCostItem(companyId: number, dto: AddCostItemDto) {
    return this.logisticsRepository.addCostItem(companyId, dto);
  }
  updateCostItem(companyId: number, id: number, dto: UpdateCostItemDto) {
    return this.logisticsRepository.updateCostItem(companyId, id, dto);
  }
  deleteCostItem(companyId: number, id: number) {
    return this.logisticsRepository.deleteCostItem(companyId, id);
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

  // Candado de familia (31-07, pedido de Felipe tras pasar naranja y
  // manzana de gramos a unidades a mano): cambiar la familia de un
  // insumo reescribe el significado de sus recetas (100 gr pasarían a
  // leerse como 100 unidades) y dispara costos y compras. El cambio
  // solo pasa cuando ninguna línea de receta hable el idioma viejo.
  private static readonly UNITS_BY_FAMILY: Record<string, string[]> = {
    masa: ['kg', 'gr'],
    volumen: ['L', 'ml'],
    unidad: ['u'],
  };

  async updateSupply(companyId: number, id: number, dto: UpdateSupplyDto) {
    if (dto.unit_family) {
      const actual = await this.logisticsRepository.findSupplyById(
        companyId,
        id,
      );
      if (actual && actual.unit_family !== dto.unit_family) {
        const permitidas =
          LogisticsService.UNITS_BY_FAMILY[dto.unit_family] || [];
        const lineas = await this.logisticsRepository.recipeLinesForSupply(
          companyId,
          id,
        );
        const rebeldes = lineas.filter((l) => !permitidas.includes(l.unit));
        if (rebeldes.length) {
          const servicios = [...new Set(rebeldes.map((l) => l.servicio))].join(
            ', ',
          );
          throw new ConflictException(
            `No se puede cambiar la familia de unidad: este insumo está en ${
              rebeldes.length === 1
                ? 'una receta expresada'
                : `${rebeldes.length} recetas expresadas`
            } en la unidad antigua (${servicios}). Ajusta o quita esas líneas primero.`,
          );
        }
      }
    }
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
