import { ForbiddenException } from '@nestjs/common';
import {
  revisarLoQueCotiza,
  textoDeNoLoTrabaja,
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
//
// Desde el doc 22 §9 (05-11-2026), lo del tipo de cliente vale para cada
// cargo con sus interruptores: BelIA cotiza y anota solo en las de los tipos
// que su cargo trabaja (a recepción, de fábrica, los particulares). Lo
// demás de acá sigue siendo solo de recepción.

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
    // Sin ella, lo de fábrica sin interruptores: recepción no cotiza a nadie
    // (solo crea requerimientos) y los demás cargos, a todos.
    private readonly alcance?: AlcanceDeRecepcion,
  ) {}

  /** ¿Su cargo trabaja todos los tipos? Entonces no hay nada que revisar. */
  private async todos(usuario: User): Promise<boolean> {
    if (!this.alcance) return !esRecepcion(usuario.role);
    return (await this.alcance.tiposDelCargo(usuario)) === null;
  }

  private async loTrabaja(
    usuario: User,
    tipo: string | null | undefined,
  ): Promise<boolean> {
    if (!this.alcance) return !esRecepcion(usuario.role);
    return this.alcance.trabaja(usuario, tipo);
  }

  /** El motivo si su cargo no puede; null si puede. */
  async motivo(
    usuario: User,
    q: CotizacionParaCambiar,
    para: 'anotar' | 'cotizar',
  ): Promise<string | null> {
    if (para === 'anotar' && q.request_type === RequestType.REQUERIMIENTO) {
      return null;
    }
    if (!(await this.loTrabaja(usuario, q.clients?.client_type))) {
      return `${textoDeNoLoTrabaja(q.clients?.client_type)} BelIA no la cambia: la ve quien trabaja ese tipo.`;
    }
    if (!esRecepcion(usuario.role)) return null;
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
    if (await this.todos(usuario)) return;
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
    if (await this.todos(usuario)) return null;
    const empresa = usuario.company_id;
    const tipo = cliente.id
      ? (await this.guardadas.clienteDeLaEmpresa(empresa, cliente.id))
          ?.client_type
      : cliente.tipo;
    return (await this.loTrabaja(usuario, tipo))
      ? null
      : `${textoDeNoLoTrabaja(tipo)} A este cliente créale el requerimiento, sin servicios: lo cotiza quien trabaja ese tipo.`;
  }

  /** Una cotización nueva CON servicios: solo a un cliente de un tipo que su
   *  cargo trabaja. Sin servicios es un requerimiento, que se crea para
   *  cualquiera. */
  async alProponerLaNueva(usuario: User, datos: DatosDeLaNueva): Promise<void> {
    if ((datos.cambios?.length ?? 0) === 0) return;
    const m = await this.clienteQueNoCotiza(usuario, {
      id: datos.cliente_id,
      tipo: datos.cliente_nuevo?.tipo,
    });
    if (m) throw new ErrorDeHerramienta(m);
  }

  /** Antes de crearla, de nuevo, con lo guardado en la propuesta: el cliente
   *  (leído otra vez de la base) y, a recepción, sin descuento y sin estados
   *  de operaciones. */
  async alCrearLaNueva(usuario: User, p: Propuesta): Promise<void> {
    const { cliente, dto } = p.despues as {
      cliente: { id?: string | null; nuevo?: { client_type?: string } | null };
      dto: { request_type?: string } & Parameters<typeof revisarLoQueCotiza>[0];
    };
    if (dto?.request_type !== RequestType.COTIZACION) return;
    const m = await this.clienteQueNoCotiza(usuario, {
      id: cliente?.id,
      tipo: cliente?.nuevo?.client_type,
    });
    if (m) throw new ForbiddenException(m);
    if (esRecepcion(usuario.role)) revisarLoQueCotiza(dto);
  }
}
