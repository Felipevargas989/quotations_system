import { Injectable } from '@nestjs/common';
import { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import { porQueNoEntraAPedido } from 'src/quotations/seguimiento/elegibles';
import { SeguimientoConIAService } from 'src/quotations/seguimiento/seguimiento.service';
import type { User } from 'src/users/entities/user.entity';
import { enlaceDe, ErrorDeHerramienta } from '../herramientas/comun';
import type { ResultadoDeAplicar, TarjetaDePropuesta } from './comun';
import { PropuestasRepository } from './propuestas.repository';
import { huellaDe, type CotizacionParaCambiar } from './reglas';

// «PREPÁRAME EL SEGUIMIENTO DE LA 600» (doc 20 §17, mejora 4; Felipe,
// 04-11-2026: «vamos con todas»).
//
// BelIA no escribe el correo: arma la tarjeta y, con el «Sí, dejar el
// borrador» de la persona, corre lo mismo que el botón «✉ Generar
// seguimiento» (`SeguimientoConIAService.generar`, doc 18): las mismas
// reglas de cuándo entra, el borrador dentro del hilo del cliente con el
// aviso ámbar, nunca se envía, y la nota «BelIA · A pedido de …» la escribe
// ese mismo servicio. Por eso la tarjeta no se deshace: el borrador queda en
// Outlook y lo revisa la persona.
//
// Desde el 10-11-2026 (doc 20 §18, sprint 2; Felipe: «si la chica esta
// quiere hacer un seguimiento a un correo de un cliente, pueda verlo
// dependiendo si el cliente lo puede ver»): pedido desde el chat, entra
// cualquier enviada o en negociación que el cargo ve (Permisos por cargo),
// aunque su próximo contacto no haya vencido (`porQueNoEntraAPedido`).

@Injectable()
export class SeguimientoDesdeElChat {
  constructor(
    private readonly guardadas: PropuestasRepository,
    private readonly bitacora: QuotationFollowupsService,
    private readonly seguimiento: SeguimientoConIAService,
  ) {}

  /** La tarjeta, si la cotización entra al seguimiento por correo. Si no,
   *  el porqué vuelve como ErrorDeHerramienta y la IA se lo explica. */
  async proponer(
    usuario: User,
    por: { numero: number } | { id: string },
    // «Respóndele a este cliente» (doc 20 §18, sprint 3): lo que la persona
    // quiere decirle. Con ella es una respuesta, de cualquier estado.
    instruccion?: string | null,
  ): Promise<TarjetaDePropuesta> {
    const pedido = instruccion?.trim().slice(0, 1500) || null;
    const empresa = usuario.company_id;
    const q = await this.guardadas.cotizacionParaCambiar(empresa, por);
    if (!q) {
      throw new ErrorDeHerramienta(
        'numero' in por
          ? `No hay ninguna cotización N° ${por.numero} en esta empresa.`
          : 'No encontré la cotización abierta.',
      );
    }
    const no = pedido ? null : porQueNoEntraAPedido(q.quotation_status);
    if (no) {
      throw new ErrorDeHerramienta(
        `La N° ${q.quotation_number} no entra al seguimiento por correo: ${no}`,
      );
    }
    await this.guardadas.descartarPendientes(empresa, q.id, usuario.id);
    const fila = await this.guardadas.crearPropuesta({
      company_id: empresa,
      quotation_id: q.id,
      usuario_id: usuario.id,
      usuario_nombre: usuario.full_name?.trim() || null,
      tipo: 'seguimiento',
      resumen: pedido
        ? `El borrador de la respuesta al cliente, en su hilo: ${pedido.slice(0, 120)}`
        : 'El borrador del correo de seguimiento, en el hilo del cliente',
      antes: {},
      despues: pedido ? { instruccion: pedido } : {},
      huella_antes: huellaDe(q),
    });
    return {
      id: fila.id,
      tipo: 'seguimiento',
      numero: q.quotation_number,
      cliente: q.clients?.name ?? null,
      cotizacion_id: q.id,
      enlace: enlaceDe(q, usuario.role, true),
      resumen: fila.resumen,
      lineas: [],
      avisos: [
        pedido
          ? 'Lo escribe la IA en cerca de un minuto: responde el último correo del cliente con lo que pediste y las reglas de la casa. Nunca se envía: lo revisas y lo envías tú desde Outlook.'
          : 'Lo escribe la IA en cerca de un minuto, con las reglas de «✉ Generar seguimiento». Nunca se envía: lo revisas y lo envías tú desde Outlook.',
      ],
      se_puede_deshacer: false,
      vence_at: fila.vence_at,
    };
  }

  /** El «Sí, dejar el borrador»: el seguimiento con IA, con la sesión de
   *  quien lo pidió. */
  async dejar(
    usuario: User,
    q: CotizacionParaCambiar,
    despues?: unknown,
  ): Promise<ResultadoDeAplicar> {
    const instruccion =
      typeof (despues as { instruccion?: unknown } | null)?.instruccion ===
      'string'
        ? (despues as { instruccion: string }).instruccion
        : null;
    const r = await this.seguimiento.generar(q.id, usuario, {
      aPedido: true,
      ...(instruccion ? { instruccion } : {}),
    });
    return {
      estado: 'aplicada',
      numero: q.quotation_number,
      enlace: enlaceDe(q, usuario.role, true),
      aviso:
        r.accion === 'borrador'
          ? `El borrador quedó en el hilo del cliente${r.buzon ? ` (${r.buzon})` : ''}: revísalo y envíalo desde Outlook.`
          : `No dejé borrador: ${r.motivo ?? 'no correspondía.'}`,
    };
  }
}
