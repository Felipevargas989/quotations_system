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
  ESTADOS_VIVOS_DEL_CHOQUE,
  notaDelChoque,
  rangoDe,
  textoDelRango,
  tieneExclusividad,
} from './choques';
import { ChoquesRepository, type FilaDelChoque } from './choques.repository';

// LOS CHOQUES DE FECHA (Felipe, 18-10-2026; mapa 02 §5.6): cuando una
// cotización se acepta, las vivas que caen en sus fechas llevan el «Tope de
// calendario» (borde rojo) hasta que deja de existir: se cambia la fecha o
// se cierra la cotización (se va solo), o alguien aprieta «Sí, puede
// seguir», que queda anotado en la bitácora. Si cualquiera de las dos cambia
// de fecha, el tope se va o vuelve solo: se calcula cada vez.

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

  /** Los topes de calendario de la empresa. */
  async listar(user: User): Promise<ChoqueDeFecha[]> {
    return this.calcular(user.company_id);
  }

  /** Las cotizaciones vivas de la empresa con tope de calendario. Mientras
   *  dure, los seguimientos automáticos se pausan: los correos al cliente
   *  del día 7 y 14 y el seguimiento con IA (Felipe, 18-10: "no tiene
   *  sentido generar un seguimiento insistiéndole a la gente con una fecha
   *  que quizás no le podamos respetar"). */
  async cotizacionesConTope(companyId: number): Promise<Set<string>> {
    const choques = await this.calcular(companyId);
    return new Set(choques.map((c) => c.quotation_id));
  }

  private async calcular(companyId: number): Promise<ChoqueDeFecha[]> {
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

  /** «Sí, puede seguir» para un par: la línea en la bitácora de la viva
   *  y la decisión guardada con las fechas de ahora. */
  async seguir(
    user: User,
    quotationId: string,
    aceptadaId: string,
  ): Promise<{ nota: string }> {
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
        'Ya no hay tope que revisar: una de las dos cambió de estado.',
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

    const nota = notaDelChoque(choque.aceptada);
    const linea = (await this.bitacora.create(user, {
      quotation_id: viva.id,
      tipo: 'otro',
      note: nota,
    })) as { id?: number } | null;
    await this.repositorio.guardar({
      company_id: companyId,
      quotation_id: viva.id,
      aceptada_id: aceptada.id,
      decision: 'puede_seguir',
      fechas_viva: textoDelRango(rangoViva),
      fechas_aceptada: textoDelRango(rangoAceptada),
      followup_id: linea?.id ?? null,
      decidido_por: user.id ?? null,
    });
    this.logger.info(
      `tope N° ${viva.quotation_number} con N° ${aceptada.quotation_number}: puede seguir`,
    );
    return { nota };
  }
}
