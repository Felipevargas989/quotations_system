import { BadRequestException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import {
  claveDe,
  type Grupo,
  grupoDe,
  mensajeDelCandado,
  type Sello,
} from './utils/candado-de-nomina';

/**
 * EL CANDADO A LO PAGADO (doc 10 §15): la pieza que lo cumple. La llaman
 * TODAS las escrituras de jornadas de PeopleRepository (agregar, cambiar
 * y borrar, de a una o en lote), así que ninguna puerta ni recálculo
 * pasa por al lado. De a una, rechaza con el mensaje; en lote (la
 * proyección de la planta, traer gente a una ficha, los invitados del
 * día), deja fuera en silencio lo que cae en un grupo sellado: un
 * recálculo nunca toca lo pagado.
 *
 * Todo filtra por company_id. Fuera quedan, a propósito, los sellos y la
 * foto de la nómina (`sellarConFoto`) y borrar propinas (`clearTips`, que
 * tiene su propio candado en PropinaRepartidaService).
 */
@Injectable()
export class CandadoDeNominaRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CandadoDeNominaRepository.name);
  }

  /** clave del grupo → la nómina que lo selló, para los grupos dados. */
  async sellos(
    companyId: number,
    grupos: readonly Grupo[],
  ): Promise<Map<string, Sello>> {
    const eventos = [
      ...new Set(grupos.map((g) => g.quotation_id).filter((q) => !!q)),
    ] as string[];
    const dias = [
      ...new Set(
        grupos.filter((g) => !g.quotation_id).map((g) => g.day as string),
      ),
    ];
    const sellados: {
      quotation_id: string | null;
      day: string | null;
      p: number;
    }[] = [];
    const base = () =>
      this.supabase.client
        .from('event_staff')
        .select('quotation_id, day, payroll_id, tip_payroll_id')
        .eq('company_id', companyId)
        .or('payroll_id.not.is.null,tip_payroll_id.not.is.null');
    const leer = async (de: 'eventos' | 'dias') => {
      const { data, error } = await (de === 'eventos'
        ? base().in('quotation_id', eventos)
        : base().is('quotation_id', null).in('day', dias));
      if (error) throw error;
      for (const f of (data ?? []) as {
        quotation_id: string | null;
        day: string | null;
        payroll_id: number | null;
        tip_payroll_id: number | null;
      }[]) {
        sellados.push({
          quotation_id: f.quotation_id,
          day: f.day,
          p: (f.payroll_id ?? f.tip_payroll_id) as number,
        });
      }
    };
    await Promise.all([
      eventos.length ? leer('eventos') : Promise.resolve(),
      dias.length ? leer('dias') : Promise.resolve(),
    ]);
    if (sellados.length === 0) return new Map();

    const ids = [...new Set(sellados.map((s) => s.p))];
    const { data, error } = await this.supabase.client
      .from('payrolls')
      .select('id, label')
      .eq('company_id', companyId)
      .in('id', ids);
    if (error) throw error;
    const etiqueta = new Map(
      ((data ?? []) as { id: number; label: string | null }[]).map((n) => [
        n.id,
        n.label,
      ]),
    );
    const out = new Map<string, Sello>();
    for (const s of sellados) {
      const g = grupoDe(s);
      if (!g) continue;
      const k = claveDe(g);
      if (!out.has(k)) {
        out.set(k, { payroll_id: s.p, label: etiqueta.get(s.p) ?? null });
      }
    }
    return out;
  }

  /** Rechaza si alguno de los grupos ya se pagó, con el mensaje. */
  async exigirAbiertos(companyId: number, grupos: readonly (Grupo | null)[]) {
    const validos = grupos.filter((g): g is Grupo => !!g);
    if (validos.length === 0) return;
    const sellos = await this.sellos(companyId, validos);
    for (const g of validos) {
      const s = sellos.get(claveDe(g));
      if (s) throw new BadRequestException(mensajeDelCandado(g, s));
    }
  }

  /** Rechaza si alguna de esas filas está en un grupo ya pagado. Si el
   *  cambio la mueve a otro día o evento, revisa también el destino. */
  async exigirFilasAbiertas(
    companyId: number,
    ids: readonly number[],
    destino?: { quotation_id?: string | null; day?: string | null },
  ) {
    const filas = await this.filas(companyId, ids);
    const grupos = filas.map((f) => grupoDe(f));
    if (
      destino &&
      (destino.day !== undefined || destino.quotation_id !== undefined)
    ) {
      for (const f of filas) {
        grupos.push(
          grupoDe({
            quotation_id:
              destino.quotation_id !== undefined
                ? destino.quotation_id
                : f.quotation_id,
            day: destino.day !== undefined ? destino.day : f.day,
          }),
        );
      }
    }
    await this.exigirAbiertos(companyId, grupos);
  }

  /** El día de staff de una jornada de evento: el invitado del evento
   *  entra al día, así que el que no puede estar pagado es el día. */
  async exigirDiaDeLaJornadaAbierto(companyId: number, jornadaId: number) {
    const [f] = await this.filas(companyId, [jornadaId]);
    if (f?.day)
      await this.exigirAbiertos(companyId, [{ day: f.day.slice(0, 10) }]);
  }

  /** Las filas por crear que NO caen en un grupo pagado (en lote). */
  async soloAbiertas<
    T extends { quotation_id?: unknown; day?: unknown; company_id?: unknown },
  >(filas: readonly T[]): Promise<T[]> {
    if (filas.length === 0) return [];
    const companyId = Number(filas[0].company_id);
    const grupoDeFila = (f: T) =>
      grupoDe({
        quotation_id: (f.quotation_id as string | null) ?? null,
        day: (f.day as string | null) ?? null,
      });
    const sellos = await this.sellos(
      companyId,
      filas.map(grupoDeFila).filter((g): g is Grupo => !!g),
    );
    if (sellos.size === 0) return [...filas];
    const quedan = filas.filter((f) => {
      const g = grupoDeFila(f);
      return !g || !sellos.has(claveDe(g));
    });
    this.logger.warn(
      `candado: ${filas.length - quedan.length} filas nuevas no entran a un día o evento ya pagado`,
    );
    return quedan;
  }

  /** Los ids por borrar que NO están en un grupo pagado (en lote). */
  async idsAbiertos(companyId: number, ids: readonly number[]) {
    if (ids.length === 0) return [];
    const filas = await this.filas(companyId, ids);
    const sellos = await this.sellos(
      companyId,
      filas.map((f) => grupoDe(f)).filter((g): g is Grupo => !!g),
    );
    if (sellos.size === 0) return [...ids];
    const cerrados = new Set(
      filas
        .filter((f) => {
          const g = grupoDe(f);
          return g && sellos.has(claveDe(g));
        })
        .map((f) => f.id),
    );
    this.logger.warn(
      `candado: ${cerrados.size} filas de un día o evento ya pagado no se borran`,
    );
    return ids.filter((id) => !cerrados.has(id));
  }

  private async filas(companyId: number, ids: readonly number[]) {
    if (ids.length === 0) return [];
    const { data, error } = await this.supabase.client
      .from('event_staff')
      .select('id, quotation_id, day')
      .eq('company_id', companyId)
      .in('id', [...ids]);
    if (error) throw error;
    return (data ?? []) as {
      id: number;
      quotation_id: string | null;
      day: string | null;
    }[];
  }
}
