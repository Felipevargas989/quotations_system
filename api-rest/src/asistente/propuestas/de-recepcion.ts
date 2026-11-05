import { ForbiddenException } from '@nestjs/common';
import {
  revisarLoQueCotiza,
  type AlcanceDeRecepcion,
} from 'src/clients/alcance-de-recepcion';
import {
  QuotationStatus,
  RequestType,
} from 'src/quotations/constants/constants';
import type { User } from 'src/users/entities/user.entity';
import { ErrorDeHerramienta } from '../herramientas/comun';
import { esRecepcion } from '../herramientas/recepcion';
import type { DatosDeLaNueva } from './cotizacion-nueva.service';
import type { Propuesta, PropuestasRepository } from './propuestas.repository';
import type { CotizacionParaCambiar } from './reglas';

// LO QUE RECEPCIÓN TRABAJA CON BELIA (doc 21; Felipe, 04-11-2026: "darle
// también la facultad a Belia que tiene que ir de la línea con los permisos
// del rol"). Lo mismo que en su pantalla: anota en sus requerimientos y en
// las cotizaciones de particulares, y cotiza (los servicios, el seguimiento,
// una cotización nueva con servicios) solo a particulares; nunca en una
// aceptada, realizada o anulada. Sin descuento: su tope es 0 %
// (`topeDeDescuento`). Al guardar, el motor lo vuelve a revisar
// (`QuotationsService.update`).

const DE_OPERACIONES = new Set<string>([
  QuotationStatus.ACEPTADA,
  QuotationStatus.REALIZADA,
  QuotationStatus.CANCELADA,
]);

export class LoQuePuedeRecepcion {
  constructor(
    private readonly guardadas: Pick<
      PropuestasRepository,
      'clienteDeLaEmpresa' | 'cotizacionParaCambiar'
    >,
    // Sin ella, recepción no cotiza a nadie: solo crea requerimientos.
    private readonly alcance?: AlcanceDeRecepcion,
  ) {}

  private async esParticular(
    empresa: number,
    tipo: string | null | undefined,
  ): Promise<boolean> {
    return this.alcance && tipo
      ? this.alcance.esParticular(empresa, tipo)
      : false;
  }

  /** El motivo si recepción no puede; null si puede o si no es recepción. */
  async motivo(
    usuario: User,
    q: CotizacionParaCambiar,
    para: 'anotar' | 'cotizar',
  ): Promise<string | null> {
    if (!esRecepcion(usuario.role)) return null;
    if (para === 'anotar' && q.request_type === RequestType.REQUERIMIENTO) {
      return null;
    }
    if (
      !(await this.esParticular(usuario.company_id, q.clients?.client_type))
    ) {
      return 'Con el cargo de recepción, BelIA trabaja solo las cotizaciones de clientes particulares: esta la ve quien vende.';
    }
    if (para === 'cotizar' && DE_OPERACIONES.has(q.quotation_status)) {
      return 'Una cotización aceptada, realizada o anulada es de operaciones: con el cargo de recepción no se cambia.';
    }
    return null;
  }

  /** Al proponer: si no puede, el error que la IA le explica. */
  async alProponer(
    usuario: User,
    q: CotizacionParaCambiar,
    para: 'anotar' | 'cotizar',
  ): Promise<void> {
    const m = await this.motivo(usuario, q, para);
    if (m) throw new ErrorDeHerramienta(m);
  }

  /** Al aplicar, de nuevo: si no puede, no se guarda. */
  async alAplicar(
    usuario: User,
    q: CotizacionParaCambiar,
    para: 'anotar' | 'cotizar',
  ): Promise<void> {
    const m = await this.motivo(usuario, q, para);
    if (m) throw new ForbiddenException(m);
  }

  /** El seguimiento lo arma otra pieza: acá se lee la cotización solo para
   *  revisar. */
  async alProponerSeguimiento(
    usuario: User,
    por: { numero: number } | { id: string },
  ): Promise<void> {
    if (!esRecepcion(usuario.role)) return;
    const q = await this.guardadas.cotizacionParaCambiar(
      usuario.company_id,
      por,
    );
    if (q) await this.alProponer(usuario, q, 'cotizar');
  }

  private async clienteQueNoCotiza(
    usuario: User,
    cliente: { id?: string | null; tipo?: string | null },
  ): Promise<string | null> {
    if (!esRecepcion(usuario.role)) return null;
    const empresa = usuario.company_id;
    const tipo = cliente.id
      ? (await this.guardadas.clienteDeLaEmpresa(empresa, cliente.id))
          ?.client_type
      : cliente.tipo;
    return (await this.esParticular(empresa, tipo))
      ? null
      : 'Con el cargo de recepción, BelIA cotiza con servicios solo a clientes particulares: a este cliente créale el requerimiento, sin servicios, y lo cotiza quien vende.';
  }

  /** Una cotización nueva CON servicios: solo a un cliente particular. Sin
   *  servicios es un requerimiento, que recepción crea para cualquiera. */
  async alProponerLaNueva(usuario: User, datos: DatosDeLaNueva): Promise<void> {
    if ((datos.cambios?.length ?? 0) === 0) return;
    const m = await this.clienteQueNoCotiza(usuario, {
      id: datos.cliente_id,
      tipo: datos.cliente_nuevo?.tipo,
    });
    if (m) throw new ErrorDeHerramienta(m);
  }

  /** Antes de crearla, de nuevo, con lo guardado en la propuesta: el cliente
   *  (leído otra vez de la base), sin descuento y sin estados de operaciones. */
  async alCrearLaNueva(usuario: User, p: Propuesta): Promise<void> {
    if (!esRecepcion(usuario.role)) return;
    const { cliente, dto } = p.despues as {
      cliente: { id?: string | null; nuevo?: { client_type?: string } | null };
      dto: { request_type?: string } & Parameters<typeof revisarLoQueCotiza>[0];
    };
    if (dto.request_type !== RequestType.COTIZACION) return;
    const m = await this.clienteQueNoCotiza(usuario, {
      id: cliente.id,
      tipo: cliente.nuevo?.client_type,
    });
    if (m) throw new ForbiddenException(m);
    revisarLoQueCotiza(dto);
  }
}
