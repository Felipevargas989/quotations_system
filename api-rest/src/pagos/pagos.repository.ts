import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';

// LA ÚNICA CAPA DE PAGOS QUE TOCA LA BASE (regla de las 4 capas).
// Ojo con el filtro de empresa: acá varias operaciones van SIN
// company_id a propósito — las dispara un aviso del proveedor, no una
// sesión, y la empresa la dice el external_reference ya verificado.

export type EmpresaParaCobro = {
  id: number;
  name: string;
  plan: string | null;
  estado_plan: string | null;
  pagado_hasta: string | null;
};

@Injectable()
export class PagosRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PagosRepository.name);
  }

  async empresa(companyId: number): Promise<EmpresaParaCobro | null> {
    this.logger.info(`empresa ${companyId} para el cobro`);
    const { data } = await this.supabase.client
      .from('companies')
      .select('id, name, plan, estado_plan, pagado_hasta')
      .eq('id', companyId)
      .maybeSingle();
    return (data as EmpresaParaCobro | null) ?? null;
  }

  async actualizarEmpresa(
    companyId: number,
    campos: Record<string, unknown>,
  ): Promise<void> {
    this.logger.info(
      `actualizar empresa ${companyId} por cobro: ${Object.keys(campos).join(', ')}`,
    );
    const { error } = await this.supabase.client
      .from('companies')
      .update(campos)
      .eq('id', companyId);
    if (error) {
      throw new Error(
        `no pude actualizar la empresa ${companyId}: ${error.message}`,
      );
    }
  }

  /** ¿Este aviso ya se procesó? (idempotencia de la migración 114). */
  async avisoYaProcesado(avisoId: string): Promise<boolean> {
    const { data } = await this.supabase.client
      .from('avisos_de_pago')
      .select('id')
      .eq('proveedor', 'mercadopago')
      .eq('aviso_id', avisoId)
      .maybeSingle();
    return Boolean(data);
  }

  /** Anota el aviso procesado. Un choque con el único (otro reenvío ganó
   *  la carrera) no es error: las acciones del aviso son repetibles. */
  async anotarAviso(registro: {
    aviso_id: string;
    tipo: string;
    company_id: number | null;
    cuerpo: unknown;
  }): Promise<void> {
    const { error } = await this.supabase.client.from('avisos_de_pago').insert({
      proveedor: 'mercadopago',
      aviso_id: registro.aviso_id,
      tipo: registro.tipo,
      company_id: registro.company_id,
      cuerpo: registro.cuerpo ?? null,
    });
    if (error && !`${error.code}`.startsWith('23')) {
      this.logger.error(
        `no pude anotar el aviso ${registro.aviso_id}: ${error.message}`,
      );
    }
  }
}
