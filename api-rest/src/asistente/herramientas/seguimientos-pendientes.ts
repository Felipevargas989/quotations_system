import { SALES_AND_UP } from 'src/auth/roles.decorator';
import {
  QuotationStatus,
  RequestType,
} from 'src/quotations/constants/constants';
import {
  conDia,
  diaDelEvento,
  diasEntre,
  enlaceDe,
  entero,
  estadoDe,
  fechaEnChile,
  pesos,
  type ContextoDeHerramienta,
  type Herramienta,
} from './comun';

// «¿Cuántas cotizaciones me falta gestionar?». El filtro «Requieren
// seguimiento» del tablero de Cotizaciones, con la MISMA regla
// (`semaforoDe` y `requiereSeguimiento` en QuotationsPage.tsx): una
// cotización viva requiere seguimiento si su compromiso venció, o si no
// tiene compromiso y lleva 3 días o más sin gestión. El compromiso es el
// de `QuotationFollowupsService.mapByCompany`, el mismo que lee el tablero.

const VIVAS = [
  QuotationStatus.SOLICITADA,
  QuotationStatus.ENVIADA,
  QuotationStatus.EN_NEGOCIACION,
];

export type InfoDeBitacora = {
  last_at?: string | null;
  next_contact_date?: string | null;
};

export type Semaforo =
  | { requiere: false }
  | { requiere: true; urgencia: number; motivo: string };

/** La regla del tablero, sin pantalla. `hoy` es AAAA-MM-DD en Chile. */
export const semaforo = (
  q: { sent_at?: string | null; created_at: string },
  info: InfoDeBitacora | undefined,
  hoy: string,
): Semaforo => {
  const proximo = info?.next_contact_date?.slice(0, 10) || null;
  if (proximo && proximo >= hoy) return { requiere: false };
  if (proximo) {
    const d = diasEntre(proximo, hoy);
    return {
      requiere: true,
      urgencia: 1000 + d,
      motivo: `compromiso vencido hace ${d} día${d === 1 ? '' : 's'} (era el ${conDia(proximo)})`,
    };
  }
  // Sin compromiso: los días desde la última gestión (nota, envío o, como
  // piso, la creación).
  const ultima = [info?.last_at, q.sent_at, q.created_at]
    .filter((x): x is string => Boolean(x))
    .sort()
    .pop()!;
  const d = diasEntre(fechaEnChile(ultima), hoy);
  if (d < 3) return { requiere: false };
  return {
    requiere: true,
    urgencia: 100 + d,
    motivo: `sin gestión hace ${d} días`,
  };
};

/** Las vivas que requieren seguimiento, de la más urgente a la menos, y
 *  cuántos compromisos vencen hoy. La usan la herramienta y los ánimos de
 *  BelIA (`AsistenteService.estado`), así las dos cuentan igual. */
export const pendientesDe = async (
  ctx: Pick<ContextoDeHerramienta, 'cotizaciones' | 'bitacora' | 'hoy'>,
  empresa: number,
) => {
  const [vivas, bitacora] = await Promise.all([
    ctx.cotizaciones.findAll({
      company_id: empresa,
      request_type: RequestType.COTIZACION,
      statuses: VIVAS,
    }),
    ctx.bitacora.mapByCompany(empresa) as Promise<
      Record<string, InfoDeBitacora>
    >,
  ]);
  const deHoy = vivas.filter(
    (q) => bitacora[q.id]?.next_contact_date?.slice(0, 10) === ctx.hoy,
  );
  const pendientes = vivas
    .map((q) => ({
      q,
      s: semaforo(
        {
          // La lista sí trae sent_at (COLUMNAS_LISTA), aunque el tipo no
          // lo declare.
          sent_at: (q as { sent_at?: string | null }).sent_at ?? null,
          created_at: String(q.created_at),
        },
        bitacora[q.id],
        ctx.hoy,
      ),
    }))
    .filter(
      (
        x,
      ): x is {
        q: (typeof vivas)[number];
        s: Extract<Semaforo, { requiere: true }>;
      } => x.s.requiere,
    )
    .sort((a, b) => b.s.urgencia - a.s.urgencia);
  return { pendientes, vencenHoy: deHoy.length, deHoy };
};

export const seguimientosPendientes: Herramienta = {
  nombre: 'seguimientos_pendientes',
  descripcion:
    'Las cotizaciones que requieren seguimiento, con la misma regla del filtro «Requieren ' +
    'seguimiento» del tablero: compromiso vencido, o 3 días o más sin gestión. Devuelve el ' +
    'total, cuántas son por cada motivo y las más urgentes primero.',
  esquema: {
    type: 'object',
    properties: {
      limite: {
        type: 'integer',
        minimum: 1,
        maximum: 60,
        description: 'Cuántas mostrar (20 si no se dice).',
      },
    },
  },
  cargos: SALES_AND_UP,
  async ejecutar(entrada, ctx) {
    const { pendientes } = await pendientesDe(ctx, ctx.usuario.company_id);
    const limite = entero(entrada.limite, 1, 60) ?? 20;
    return {
      total: pendientes.length,
      con_compromiso_vencido: pendientes.filter((p) => p.s.urgencia >= 1000)
        .length,
      sin_gestion: pendientes.filter((p) => p.s.urgencia < 1000).length,
      mostradas: Math.min(limite, pendientes.length),
      cotizaciones: pendientes.slice(0, limite).map(({ q, s }) => ({
        numero: q.quotation_number,
        enlace: enlaceDe(q, ctx.usuario.role),
        cliente: q.clients?.name ?? null,
        estado: estadoDe(q.quotation_status),
        evento: q.event_type,
        fecha: conDia(diaDelEvento(q.event_date as unknown as string)),
        total: pesos(q.total_amount),
        motivo: s.motivo,
      })),
    };
  },
};
