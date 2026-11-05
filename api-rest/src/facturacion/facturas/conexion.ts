import { Injectable } from '@nestjs/common';
import type { FacturacionCl } from '../facturacion-cl/facturacion-cl';
import { FacturacionClSimulado } from '../facturacion-cl/simulado';
import { DocumentosTributariosRepository } from './documentos-tributarios.repository';

/**
 * LA CONEXIÓN CON FACTURACION.CL DE CADA EMPRESA (doc 19 §5.3 y §9.9)
 *
 * En los pasos 1 a 4 es SIEMPRE la simulada: responde como el manual y no
 * emite nada. Sigue la numeración de la base (el último folio de cada tipo
 * en el ambiente 'simulado'), así que un reinicio del motor no repite
 * folios. La de verdad, por SOAP y con las credenciales que carga Felipe en
 * Railway, entra en el paso 5. Una por empresa: los folios y las
 * credenciales son de cada una.
 */
@Injectable()
export class ConexionConFacturacionCl {
  private readonly porEmpresa = new Map<number, FacturacionCl>();

  constructor(private readonly repo: DocumentosTributariosRepository) {}

  de(companyId: number): FacturacionCl {
    let conexion = this.porEmpresa.get(companyId);
    if (!conexion) {
      conexion = new FacturacionClSimulado({
        ultimoFolio: (tipo) =>
          this.repo.ultimoFolio(companyId, 'simulado', tipo),
      });
      this.porEmpresa.set(companyId, conexion);
    }
    return conexion;
  }
}
