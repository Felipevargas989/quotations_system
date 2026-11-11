import { BadRequestException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import type { User } from 'src/users/entities/user.entity';
import { textoLimpio } from '../archivo/texto';
import type { DtePedido } from '../facturas/borrador';
import { FacturasService } from '../facturas/facturas.service';
import { FacturasAprobadasRepository } from './facturas-aprobadas.repository';

/** Quién: el nombre del perfil de la sesión, como en la caja (§9.43). */
const nombreDelPerfil = (user: User) =>
  (textoLimpio(user.full_name) || 'Sin nombre').slice(0, 60);

/**
 * LAS FACTURAS APROBADAS QUE ESPERAN (doc 19 §9.48; Felipe, 11-11-2026:
 * *"ya revisé y dejé la facturación hecha (…) la próxima persona, cuando
 * decida facturar, la factura está lista, llegar y pinchar no más"*).
 * «Aprobar» en «Facturar seleccionados» guarda el documento tal como se
 * revisó; quien entre después lo encuentra aprobado. Nada va al SII al
 * aprobar: al facturar, la emisión de siempre lo revisa de nuevo.
 */
@Injectable()
export class FacturasAprobadasService {
  constructor(
    private readonly repo: FacturasAprobadasRepository,
    private readonly facturas: FacturasService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(FacturasAprobadasService.name);
  }

  lista(companyId: number) {
    return this.repo.lista(companyId);
  }

  /** Se guarda solo lo que está listo para emitirse: la misma revisión de
   *  la vista previa, que además comprueba que el evento es de la empresa. */
  async aprobar(
    quotationId: string,
    user: User,
    ocId: number | null,
    pedida: DtePedido,
  ) {
    const companyId = user.company_id;
    const revision = await this.facturas.revisar(
      quotationId,
      companyId,
      pedida,
    );
    if (!revision.ok)
      throw new BadRequestException(
        revision.faltan.length
          ? `Falta ${revision.faltan.map((f) => f.texto).join(', ')}`
          : revision.problemas.join('. ') || 'El documento no está listo',
      );
    return this.repo.guardar({
      company_id: companyId,
      quotation_id: quotationId,
      oc_id: ocId,
      pedida,
      aprobada_por: user.id ?? null,
      aprobada_por_nombre: nombreDelPerfil(user),
    });
  }

  /** «Corregir» una aprobada la deja sin aprobar. */
  async quitar(quotationId: string, user: User, ocId: number | null) {
    await this.repo.quitar(user.company_id, quotationId, ocId);
    return { ok: true };
  }

  /**
   * Emitido (o enviado y por confirmar), deja de esperar: se va la del
   * evento y la de la OC que se facturó. Si esto falla, el documento ya
   * salió igual: se anota y sigue.
   */
  async alEmitir(companyId: number, quotationId: string, ocId: number | null) {
    try {
      await this.repo.quitar(companyId, quotationId, null);
      if (ocId != null) await this.repo.quitar(companyId, quotationId, ocId);
    } catch (error) {
      this.logger.warn(
        `la factura aprobada del evento ${quotationId} no se pudo quitar al emitir: ${mensajeDe(error)}`,
      );
    }
  }
}
