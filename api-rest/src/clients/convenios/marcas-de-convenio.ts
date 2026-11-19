import { Injectable } from '@nestjs/common';
import { ConveniosRepository } from './convenios.repository';

/**
 * EL EDIFICIO DE COLOR (doc 24 §7, Felipe 19-11-2026: «A, el edificio»).
 * Lo que necesita la marca de un cliente con convenio: verde si está
 * firmado, ámbar si se envió y no se ha firmado. Sin convenio vigente, el
 * cliente no trae la llave `convenio` y todo queda como antes.
 */
export interface MarcaDeConvenio {
  estado: 'enviado' | 'firmado';
  enviado_at: string | null;
  firmado_at: string | null;
  vence_at: string | null;
}

/**
 * Las marcas de TODA la empresa en una pasada (nunca una consulta por
 * cliente), para la lista de clientes, el cotizador, el negocio y
 * Post-Venta. Empresa sin plantilla de convenio: no hay marcas.
 */
@Injectable()
export class MarcasDeConvenio {
  constructor(private readonly repo: ConveniosRepository) {}

  async deLaEmpresa(companyId: number): Promise<Map<string, MarcaDeConvenio>> {
    const [hayPlantilla, vigentes] = await Promise.all([
      this.repo.tienePlantilla(companyId),
      this.repo.vigentesDeLaEmpresa(companyId),
    ]);
    const marcas = new Map<string, MarcaDeConvenio>();
    if (!hayPlantilla) return marcas;
    for (const c of vigentes) {
      marcas.set(c.client_id, {
        estado: c.estado,
        enviado_at: c.enviado_at,
        firmado_at: c.firmado_at,
        vence_at: c.vence_at,
      });
    }
    return marcas;
  }

  /** `GET /clients`: la marca en cada cliente que tiene convenio. */
  async enClientes<T extends { id: string }>(
    companyId: number,
    clientes: T[],
  ): Promise<T[]> {
    const marcas = await this.deLaEmpresa(companyId);
    if (marcas.size === 0) return clientes;
    return clientes.map((c) => {
      const marca = marcas.get(c.id);
      return marca ? { ...c, convenio: marca } : c;
    });
  }

  /** `GET /quotations`: la marca dentro del cliente de cada fila. */
  async enCotizaciones<T>(companyId: number, filas: T[]): Promise<T[]> {
    const marcas = await this.deLaEmpresa(companyId);
    if (marcas.size === 0) return filas;
    return filas.map((f) => {
      const fila = f as { client_id?: string | null; clients?: unknown };
      const marca = fila.client_id ? marcas.get(fila.client_id) : undefined;
      if (!marca || !fila.clients || typeof fila.clients !== 'object') {
        return f;
      }
      return {
        ...f,
        clients: { ...fila.clients, convenio: marca },
      } as T;
    });
  }
}
