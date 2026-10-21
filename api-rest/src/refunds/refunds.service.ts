import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { CreateRefundDto } from './dto/create-refund.dto';
import { Refund } from './entities/refund.entity';
import {
  descontarDePendientes,
  faltaPorDevolver,
  masDeLoQueFalta,
  Pendiente,
  PENDIENTE_NO_SE_ELIMINA,
  pendientesDe,
} from './reembolsos-por-partes';
import { RefundsRepository } from './refunds.repository';
import { CreateRefundPayload } from './types';

type CamposDeRegistro = {
  amount: number;
  refund_date: string;
  payment_method: string;
  receipt_url?: string | null;
  notes?: string | null;
};

@Injectable()
export class RefundsService {
  constructor(
    private readonly refundsRepository: RefundsRepository,
    private readonly logger: PinoLogger,
  ) {}

  async create(createRefundDto: CreateRefundDto) {
    this.logger.info(
      `create refund with createRefundDto ${JSON.stringify(createRefundDto)}`,
    );
    try {
      const newRefund: CreateRefundPayload = {
        ...createRefundDto,
        is_paid: false,
      };
      // 20-10-2026: el error de la base ya no se traga (antes la cascada
      // y la anulación seguían como si el reembolso hubiera nacido).
      const { data, error } = await this.refundsRepository.create(newRefund);
      if (error) throw error;
      return data as Refund;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findAll(companyId: Company['id']) {
    this.logger.info(`findAll refunds with companyId ${companyId}`);
    try {
      return await this.refundsRepository.findAll(companyId);
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  // ---------- Mudanza #7 (28-07): Post-Venta por el backend ----------
  findByQuotation(companyId: Company['id'], quotationId: string) {
    return this.refundsRepository.findByQuotation(companyId, quotationId);
  }

  paidMapByCompany(companyId: Company['id']) {
    return this.refundsRepository.paidMapByCompany(companyId);
  }

  // ---------- REEMBOLSOS POR PARTES (20-10-2026, reembolsos-por-partes.ts)
  // Lo PENDIENTE es lo que falta por devolver; cada registro es una fila
  // pagada. Registrar descuenta de lo pendiente, eliminar lo devuelve y
  // editar mueve la diferencia. Nunca más de lo que falta.

  /** Registra un reembolso de la cotización: nace pagado y descuenta. */
  async registrar(
    companyId: Company['id'],
    quotationId: string,
    campos: CamposDeRegistro,
  ) {
    const pendientes = await this.pendientes(companyId, quotationId);
    const falta = faltaPorDevolver(pendientes);
    if (!(campos.amount >= 1) || campos.amount > falta) {
      throw new BadRequestException(masDeLoQueFalta(falta));
    }
    await this.descontar(pendientes, campos.amount);
    const { data, error } = await this.refundsRepository.create({
      quotation_id: quotationId,
      amount: campos.amount,
      is_paid: true,
      refund_date: campos.refund_date,
      payment_method: campos.payment_method,
      receipt_url: campos.receipt_url ?? null,
      notes: campos.notes?.trim() || null,
    });
    if (error) {
      // Lo descontado vuelve: no se pierde plata si falla el registro.
      await this.devolver(quotationId, campos.amount, []);
      throw error;
    }
    return data as Refund;
  }

  /** Edita un registro (fecha, medio, comprobante y monto). Si el monto
   *  cambia, la diferencia sale de lo pendiente o vuelve a él. Sobre una
   *  fila PENDIENTE equivale a registrar (la ruta vieja de «Registrar»). */
  async editarRegistro(
    companyId: Company['id'],
    id: string,
    campos: CamposDeRegistro,
  ) {
    const fila = await this.refundsRepository.findOwned(companyId, id);
    if (!fila) throw new NotFoundException('Reembolso no encontrado');
    if (!fila.is_paid) {
      await this.registrar(companyId, fila.quotation_id, campos);
      return { registered: true };
    }
    const pendientes = await this.pendientes(companyId, fila.quotation_id);
    const falta = faltaPorDevolver(pendientes);
    const antes = Number(fila.amount) || 0;
    const delta = campos.amount - antes;
    if (!(campos.amount >= 1) || delta > falta) {
      throw new BadRequestException(masDeLoQueFalta(falta + antes));
    }
    if (delta > 0) await this.descontar(pendientes, delta);
    if (delta < 0) await this.devolver(fila.quotation_id, -delta, pendientes);
    await this.refundsRepository.registerPaid(companyId, id, campos);
    return { registered: true };
  }

  /** Elimina un registro: su monto vuelve a lo que falta por devolver. */
  async eliminarRegistro(companyId: Company['id'], id: string) {
    const fila = await this.refundsRepository.findOwned(companyId, id);
    if (!fila) throw new NotFoundException('Reembolso no encontrado');
    if (!fila.is_paid) throw new BadRequestException(PENDIENTE_NO_SE_ELIMINA);
    const pendientes = await this.pendientes(companyId, fila.quotation_id);
    // Primero vuelve a lo pendiente y después se borra: si el borrado
    // falla, se deshace la vuelta y no queda plata contada dos veces.
    const deshacer = await this.devolver(
      fila.quotation_id,
      Number(fila.amount) || 0,
      pendientes,
    );
    const { error } = await this.refundsRepository.remove(id);
    if (error) {
      await deshacer();
      throw error;
    }
    return { removed: true };
  }

  private async pendientes(companyId: Company['id'], quotationId: string) {
    return pendientesDe(
      await this.refundsRepository.findByQuotation(companyId, quotationId),
    );
  }

  private async descontar(pendientes: readonly Pendiente[], monto: number) {
    const { achicar, borrar } = descontarDePendientes(pendientes, monto);
    for (const p of achicar) {
      const { error } = await this.refundsRepository.updateAmount(
        p.id,
        p.amount,
      );
      if (error) throw error;
    }
    for (const id of borrar) {
      const { error } = await this.refundsRepository.remove(id);
      if (error) throw error;
    }
  }

  /** Suma `monto` a lo pendiente (al más nuevo, o en uno nuevo) y entrega
   *  cómo deshacerlo. */
  private async devolver(
    quotationId: string,
    monto: number,
    pendientes: readonly Pendiente[],
  ): Promise<() => Promise<void>> {
    const ultimo = pendientes[pendientes.length - 1];
    if (ultimo) {
      const { error } = await this.refundsRepository.updateAmount(
        ultimo.id,
        ultimo.amount + monto,
      );
      if (error) throw error;
      return async () => {
        await this.refundsRepository.updateAmount(ultimo.id, ultimo.amount);
      };
    }
    const { data, error } = await this.refundsRepository.create({
      quotation_id: quotationId,
      amount: monto,
      is_paid: false,
    });
    if (error) throw error;
    return async () => {
      const creado = data as Refund | null;
      if (creado?.id) await this.refundsRepository.remove(String(creado.id));
    };
  }

  // Compensación (tarea #42): los usa QuotationsService cuando el total de
  // un evento aceptado SUBE — la deuda nueva consume primero los reembolsos
  // pendientes, para que nunca convivan "te debo" y "me debes".
  async findPendingByQuotation(quotationId: string) {
    const { data, error } =
      await this.refundsRepository.findPendingByQuotation(quotationId);
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  }

  async updateAmount(id: string, amount: number) {
    const { error } = await this.refundsRepository.updateAmount(id, amount);
    if (error) throw error;
  }

  async remove(id: string) {
    const { error } = await this.refundsRepository.remove(id);
    if (error) throw error;
  }

  // findOne(id: number) {
  //   return `This action returns a #${id} refund`;
  // }

  // update(id: number, updateRefundDto: UpdateRefundDto) {
  //   return `This action updates a #${id} refund`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} refund`;
  // }
}
