// LAS REGLAS DE LOS CAMBIOS DE BELIA (doc 20 §4 y §5), PURAS.
//
// Quién puede cambiar qué, qué días ya no se tocan, la plata que resulta y
// cómo quedarían las cuotas. Nada se calcula a mano: la plata la hace
// `computeMoney` (la misma cuenta del cotizador y del motor) y las cuotas,
// las funciones de «el plan mantiene su forma» (doc 14), las mismas que
// corre `QuotationsService.update` al guardar.

import { createHash } from 'crypto';
import { tieneDerecho } from 'src/auth/derechos';
import { OPERATIONS_AND_UP } from 'src/auth/roles.decorator';
import {
  diaDe,
  repartirAlza,
  repartirRebaja,
  type CambioDelPlan,
  type CuotaDelPlan,
} from 'src/payments/cuotas-que-se-llenan';
import {
  QuotationStatus,
  RequestType,
} from 'src/quotations/constants/constants';
import { computeMoney } from 'src/quotations/utils/money';
import type { User } from 'src/users/entities/user.entity';
import type { Abono, Cuota, Reembolso } from '../asistente.repository';
import { conDia, diaDelEvento, diasEntre, pesos } from '../herramientas/comun';
import type { FotoGuardada } from './editar-foto';

/** Lo que se lee de una cotización para cambiarla. */
export type CotizacionParaCambiar = {
  id: string;
  quotation_number: number;
  quotation_status: QuotationStatus;
  request_type: RequestType;
  event_date: string | null;
  event_end_date: string | null;
  people_count: number | null;
  children_count: number | null;
  items: FotoGuardada | null;
  subtotal_amount: number | string | null;
  discount_percentage: number | string | null;
  discount_amount: number | string | null;
  tip_percentage: number | string | null;
  tip_amount: number | string | null;
  total_amount: number | string | null;
  value_per_person: number | string | null;
  fixed_value: number | string | null;
  clients: { name: string | null; client_type: string | null } | null;
};

const n = (v: unknown): number => Number(v) || 0;

/** La huella de lo que una propuesta da por sabido. Si cambia entre que
 *  BelIA propone y la persona aplica, alguien tocó la cotización: no se
 *  aplica (doc 20 §3, regla 3). */
export const huellaDe = (q: CotizacionParaCambiar): string =>
  createHash('sha256')
    .update(
      JSON.stringify([
        q.quotation_status,
        q.request_type,
        q.event_date,
        q.event_end_date,
        q.people_count,
        q.children_count,
        q.discount_percentage,
        q.discount_amount,
        q.tip_percentage,
        q.tip_amount,
        q.total_amount,
        q.items ?? null,
      ]),
    )
    .digest('hex')
    .slice(0, 32);

const ESTADO: Partial<Record<QuotationStatus, string>> = {
  [QuotationStatus.REALIZADA]:
    'ya se realizó: está congelada y nadie la cambia',
  [QuotationStatus.CANCELADA]: 'está anulada',
  [QuotationStatus.RECHAZADA]:
    'está rechazada: si el cliente volvió, primero hay que reabrirla en el tablero',
};

/** Si esta persona puede cambiar los servicios de esta cotización. null =
 *  sí; si no, por qué (en palabras para la persona). */
export const porQueNo = (
  q: CotizacionParaCambiar,
  usuario: Pick<User, 'role' | 'derechos'>,
): string | null => {
  const n0 = `La N° ${q.quotation_number}`;
  if (q.request_type !== RequestType.COTIZACION) {
    return `${n0} es un requerimiento: primero hay que armar la cotización (con «✨ Crear con IA» o en el cotizador).`;
  }
  const estado = ESTADO[q.quotation_status];
  if (estado) return `${n0} ${estado}.`;
  if (q.quotation_status === QuotationStatus.ACEPTADA) {
    // Las vendidas, como Post-Venta → Servicios (doc 20 §5).
    if (!OPERATIONS_AND_UP.includes(usuario.role)) {
      return `${n0} está aceptada: la cambian administración y operaciones, como en Post-Venta → Servicios. Pídeselo a ellos.`;
    }
    if (!tieneDerecho(usuario.derechos, 'post_venta')) {
      return `${n0} está aceptada y el plan de tu empresa no trae Post-Venta.`;
    }
  }
  return null;
};

/** Cuántos días del evento ya no se tocan: en uno aceptado que ya empezó,
 *  los servidos y el de hoy (hora de Chile). Regla nueva, solo de BelIA
 *  (doc 20 §5). 0 = ninguno. */
export const diasCerrados = (q: CotizacionParaCambiar, hoy: string): number => {
  if (q.quotation_status !== QuotationStatus.ACEPTADA) return 0;
  const desde = diaDelEvento(q.event_date);
  if (!desde || hoy < desde) return 0;
  return diasEntre(desde, hoy) + 1;
};

export const diasDelEvento = (q: CotizacionParaCambiar): number => {
  const desde = diaDelEvento(q.event_date);
  const hasta = diaDelEvento(q.event_end_date);
  return desde && hasta ? Math.max(1, diasEntre(desde, hasta) + 1) : 1;
};

/** Si los cambios tocan un día cerrado. null = no tocan ninguno. */
export const choqueConLoServido = (
  q: CotizacionParaCambiar,
  diasTocados: number[],
  hoy: string,
): string | null => {
  const cerrados = diasCerrados(q, hoy);
  if (cerrados <= 0) return null;
  if (cerrados >= diasDelEvento(q)) {
    return `La N° ${q.quotation_number} ya está en su último día o terminó: BelIA no cambia lo que se está sirviendo.`;
  }
  const tocados = diasTocados.filter((d) => d === 0 || d <= cerrados);
  if (tocados.length === 0) return null;
  return `El evento ya empezó: los días 1 a ${cerrados} (hasta hoy) no se tocan${tocados.includes(0) ? ', y un fijo de todo el evento tampoco' : ''}. Los días que vienen, sí.`;
};

/** La plata con la foto nueva y lo que se guarda: la misma cuenta y los
 *  mismos campos que guarda Post-Venta → Servicios. El descuento y la
 *  propina no se tocan (doc 20 §11: los descuentos, hasta que Felipe
 *  decida, no). */
export const parcheDe = (q: CotizacionParaCambiar, foto: FotoGuardada) => {
  const pct = n(q.discount_percentage);
  const propina = q.tip_percentage == null ? null : n(q.tip_percentage);
  const t = computeMoney({
    items: foto as Parameters<typeof computeMoney>[0]['items'],
    people_count: q.people_count,
    children_count: q.children_count,
    discount_percentage: pct,
    discount_amount: pct > 0 ? 0 : n(q.discount_amount),
    tip_percentage: propina,
  });
  return {
    total: t.totalAmount,
    parche: {
      items: foto,
      value_per_person: t.valuePerPerson,
      fixed_value: t.fixedTotal,
      subtotal_amount: t.subtotalAmount,
      discount_percentage: pct,
      // Con descuento por %, la columna del monto va en 0 (verifyMoney).
      discount_amount: pct > 0 ? 0 : t.discountAmount,
      tip_percentage: propina,
      tip_amount: t.tipAmount,
      total_amount: t.totalAmount,
    },
  };
};

export type Parche = ReturnType<typeof parcheDe>['parche'];

/** Cómo quedarían las cuotas de una aceptada si el total cambia en
 *  `diferencia`: lo mismo que hará `QuotationsService.update` (primero se
 *  compensan los reembolsos pendientes, después el plan mantiene su forma). */
export const cuotasDespues = (
  cuotas: Cuota[],
  abonos: Abono[],
  reembolsos: Reembolso[],
  diferencia: number,
  hoy: string,
) => {
  const plan: (CuotaDelPlan & { status: string })[] = cuotas.map((c) => ({
    id: c.id,
    payment_number: c.payment_number,
    amount: c.amount,
    due_date: c.due_date,
    status: c.status,
    // Pagada por fuera: marcada pagada, con fecha y sin ningún pago
    // registrado (PaymentsService.leerPlan). La regla no la toca.
    pagadaPorFuera:
      c.status === 'pagado' &&
      Boolean(c.paid_date) &&
      !abonos.some((a) => a.payment_id === c.id),
  }));
  const pagado = abonos.reduce((s, a) => s + n(a.amount), 0);
  let cambio: CambioDelPlan = {
    cambios: [],
    borrar: [],
    reembolso: 0,
    cuotaNueva: 0,
  };
  let compensado = 0;
  if (diferencia < 0) {
    cambio = repartirRebaja(plan, pagado, -diferencia);
  } else if (diferencia > 0) {
    const pendientes = reembolsos
      .filter((r) => !r.is_paid)
      .reduce((s, r) => s + n(r.amount), 0);
    compensado = Math.min(pendientes, diferencia);
    if (diferencia - compensado > 0) {
      cambio = repartirAlza(plan, pagado, diferencia - compensado, hoy);
    }
  }
  return {
    cuotas: [...plan]
      .sort((a, b) => a.payment_number - b.payment_number)
      .map((c) => {
        const nuevo = cambio.borrar.includes(c.id)
          ? 0
          : (cambio.cambios.find((x) => x.id === c.id)?.amount ?? n(c.amount));
        return {
          cuota: c.payment_number,
          vence: conDia(diaDe(c.due_date)),
          antes: pesos(c.amount),
          despues: pesos(nuevo),
        };
      }),
    cuota_nueva: cambio.cuotaNueva > 0 ? pesos(cambio.cuotaNueva) : undefined,
    reembolso_nuevo: cambio.reembolso > 0 ? pesos(cambio.reembolso) : undefined,
    reembolso_compensado: compensado > 0 ? pesos(compensado) : undefined,
  };
};
