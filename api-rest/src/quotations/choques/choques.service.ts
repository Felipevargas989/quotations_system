import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import type { User } from 'src/users/entities/user.entity';
import { fechaEnChile } from '../seguimiento/elegibles';
import {
  type ChoqueDeFecha,
  choquesDe,
  type CotizacionDelChoque,
  type DecisionDelChoque,
  ESTADOS_VIVOS_DEL_CHOQUE,
  notaDelChoque,
  rangoDe,
  textoDelRango,
  tieneExclusividad,
} from './choques';
import { ChoquesRepository, type FilaDelChoque } from './choques.repository';

// LOS CHOQUES DE FECHA (Felipe, 18-10-2026; mapa 02 §5.6): cuando una
// cotización se acepta, las vivas que caen en sus fechas llevan un aviso
// rojo hasta que alguien decide, una por una:
//   - «Sí, puede seguir»: el aviso se va y queda anotado en la bitácora;
//   - «Hay que gestionar»: una llamada comprometida para hoy en la bitácora
//     («mover la fecha o descartar»).
// Si cualquiera de las dos cambia de fecha, o la aceptada se cae, el aviso
// se va o vuelve solo: el choque se calcula cada vez.

const aCotizacion = (f: FilaDelChoque): CotizacionDelChoque => ({
  id: f.id,
  quotation_number: f.quotation_number,
  event_date: f.event_date,
  event_end_date: f.event_end_date,
  cliente: f.clients?.name ?? null,
});

const aAceptada = (f: FilaDelChoque): CotizacionDelChoque => ({
  ...aCotizacion(f),
  exclusiva: tieneExclusividad(f.items),
});

@Injectable()
export class ChoquesDeFechaService {
  constructor(
    private readonly repositorio: ChoquesRepository,
    private readonly bitacora: QuotationFollowupsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ChoquesDeFechaService.name);
  }

  /** Los choques que esperan revisión en la empresa. */
  async listar(user: User): Promise<ChoqueDeFecha[]> {
    const companyId = user.company_id;
    const hoy = fechaEnChile();
    const [vivas, aceptadas, decisiones] = await Promise.all([
      this.repositorio.cotizaciones(companyId, ESTADOS_VIVOS_DEL_CHOQUE, hoy),
      this.repositorio.cotizaciones(companyId, ['aceptada'], hoy, true),
      this.repositorio.decisiones(companyId),
    ]);
    return choquesDe({
      vivas: vivas.map(aCotizacion),
      aceptadas: aceptadas.map(aAceptada),
      decisiones,
      hoy,
    });
  }

  /** La decisión de la persona para un par: la línea en la bitácora de la
   *  viva y la decisión guardada con las fechas de ahora. */
  async decidir(
    user: User,
    quotationId: string,
    aceptadaId: string,
    decision: DecisionDelChoque,
  ): Promise<{ decision: DecisionDelChoque; nota: string }> {
    const companyId = user.company_id;
    const hoy = fechaEnChile();
    const [viva, aceptada] = await Promise.all([
      this.repositorio.una(companyId, quotationId),
      this.repositorio.una(companyId, aceptadaId),
    ]);
    if (!viva || !aceptada) {
      throw new NotFoundException('Cotización no encontrada.');
    }
    if (
      !ESTADOS_VIVOS_DEL_CHOQUE.includes(viva.quotation_status) ||
      aceptada.quotation_status !== 'aceptada'
    ) {
      throw new ConflictException(
        'Ya no hay choque que revisar: una de las dos cambió de estado.',
      );
    }
    const [choque] = choquesDe({
      vivas: [aCotizacion(viva)],
      aceptadas: [aAceptada(aceptada)],
      decisiones: [],
      hoy,
    });
    const rangoViva = rangoDe(viva);
    const rangoAceptada = rangoDe(aceptada);
    if (!choque || !rangoViva || !rangoAceptada) {
      throw new ConflictException(
        'Ya no chocan: alguna de las dos cambió de fecha.',
      );
    }

    const nota = notaDelChoque(choque.aceptada, decision);
    const linea = (await this.bitacora.create(
      user,
      decision === 'puede_seguir'
        ? { quotation_id: viva.id, tipo: 'otro', note: nota }
        : {
            quotation_id: viva.id,
            tipo: 'llamada',
            note: nota,
            next_contact_date: hoy,
          },
    )) as { id?: number } | null;
    await this.repositorio.guardar({
      company_id: companyId,
      quotation_id: viva.id,
      aceptada_id: aceptada.id,
      decision,
      fechas_viva: textoDelRango(rangoViva),
      fechas_aceptada: textoDelRango(rangoAceptada),
      followup_id: linea?.id ?? null,
      decidido_por: user.id ?? null,
    });
    this.logger.info(
      `choque N° ${viva.quotation_number} con N° ${aceptada.quotation_number}: ${decision}`,
    );
    return { decision, nota };
  }
}
