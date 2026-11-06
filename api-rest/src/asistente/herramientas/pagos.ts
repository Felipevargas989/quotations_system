import { trabajaElTipo } from 'src/auth/permisos';
import { OPERATIONS_AND_UP } from 'src/auth/roles.decorator';
import { textoDeNoLoTrabaja } from 'src/clients/alcance-de-recepcion';
import { QuotationStatus } from 'src/quotations/constants/constants';
import type { Abono, Cuota, Reembolso } from '../asistente.repository';
import {
  ErrorDeHerramienta,
  conDia,
  diaDelEvento,
  enlaceDe,
  entero,
  estadoDe,
  fecha,
  pesos,
  sumarDias,
  type Herramienta,
} from './comun';
import { loTrabaja, tiposPara } from './recepcion';

// «¿Cuánto falta por pagar de la 500?», «¿quién me debe esta semana?». La
// pestaña Pagos de Post-Venta y la cobranza: es de operaciones para arriba
// (SECTION_ROLES.payments) con el derecho del plan `post_venta`. Solo
// lectura: registrar, editar o borrar plata nunca es de BelIA (doc 20 §4).

const n = (v: unknown): number => Number(v) || 0;

/** Lo pagado de cada cuota, según sus abonos. */
const pagadoPorCuota = (abonos: Abono[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const a of abonos) {
    if (!a.payment_id) continue;
    m.set(a.payment_id, (m.get(a.payment_id) ?? 0) + n(a.amount));
  }
  return m;
};

/** La plata de un evento como la muestra la pestaña Pagos: saldo =
 *  total − (pagado − reembolsado) (mapa 04). Exportada para probarla. */
export const resumenDePlata = (
  total: number,
  estado: QuotationStatus,
  cuotas: Cuota[],
  abonos: Abono[],
  reembolsos: Reembolso[],
  hoy: string,
) => {
  const pagado = abonos.reduce((s, a) => s + n(a.amount), 0);
  const reembolsado = reembolsos
    .filter((r) => r.is_paid)
    .reduce((s, r) => s + n(r.amount), 0);
  const porReembolsar = reembolsos
    .filter((r) => !r.is_paid)
    .reduce((s, r) => s + n(r.amount), 0);
  const anulado = estado === QuotationStatus.CANCELADA;
  const deCuota = pagadoPorCuota(abonos);
  return {
    total: pesos(total),
    pagado: pesos(pagado),
    reembolsado: reembolsado > 0 ? pesos(reembolsado) : undefined,
    por_reembolsar: porReembolsar > 0 ? pesos(porReembolsar) : undefined,
    saldo: anulado ? pesos(0) : pesos(total - (pagado - reembolsado)),
    nota: anulado ? 'Evento anulado: no hay nada por cobrar.' : undefined,
    sin_plan: cuotas.length === 0 && !anulado ? true : undefined,
    cuotas: cuotas.map((c) => {
      const abonado = deCuota.get(c.id) ?? 0;
      const falta = Math.max(0, n(c.amount) - abonado);
      const vencida =
        c.status !== 'pagado' && falta > 0 && !!c.due_date && c.due_date < hoy;
      return {
        cuota: c.payment_number,
        monto: pesos(c.amount),
        vence: conDia(c.due_date),
        estado:
          c.status === 'pagado' || falta === 0
            ? 'pagada'
            : vencida
              ? 'vencida'
              : abonado > 0
                ? 'pendiente, con abono'
                : 'pendiente',
        falta: falta > 0 ? pesos(falta) : undefined,
      };
    }),
    ultimos_abonos: abonos.slice(0, 8).map((a) => ({
      fecha: conDia(a.transaction_date),
      monto: pesos(a.amount),
      medio: a.payment_method ?? undefined,
    })),
  };
};

export const pagosDelEvento: Herramienta = {
  nombre: 'pagos_del_evento',
  descripcion:
    'La plata de un evento vendido, como la pestaña Pagos de Post-Venta: total, pagado, ' +
    'saldo, cada cuota con su vencimiento y lo que le falta, y los últimos abonos. Sin ' +
    '`numero`, la cotización que la persona tiene abierta.',
  esquema: {
    type: 'object',
    properties: {
      numero: { type: 'integer', description: 'El N° de la cotización.' },
    },
  },
  cargos: OPERATIONS_AND_UP,
  permiso: ['postventa'],
  derecho: 'post_venta',
  async ejecutar(entrada, ctx) {
    const numero = entero(entrada.numero, 1, 10_000_000);
    const empresa = ctx.usuario.company_id;
    const q = numero
      ? await ctx.repositorio.cotizacionPorNumero(empresa, numero)
      : ctx.cotizacionAbierta
        ? await ctx.repositorio.cotizacionVista(empresa, ctx.cotizacionAbierta)
        : null;
    if (!q) {
      throw new ErrorDeHerramienta(
        numero
          ? `No hay ninguna cotización N° ${numero} en esta empresa.`
          : 'Falta el N°: la persona no tiene ninguna cotización abierta.',
      );
    }
    // Con un tipo de cliente apagado (doc 22 §9, tanda 2), la plata de sus
    // eventos no se ve; la de los demás va completa, con la marca.
    const trabaja = loTrabaja(await tiposPara(ctx), q.clients?.client_type);
    if (trabaja === false) {
      throw new ErrorDeHerramienta(textoDeNoLoTrabaja(q.clients?.client_type));
    }
    const { cuotas, abonos, reembolsos } = await ctx.repositorio.plataDe(q.id);
    return {
      ...(trabaja ? { trabaja: true as const } : {}),
      numero: q.quotation_number,
      enlace: enlaceDe(q, ctx.usuario.role),
      cliente: q.clients?.name ?? null,
      estado: estadoDe(q.quotation_status),
      evento: conDia(diaDelEvento(q.event_date)),
      ...resumenDePlata(
        n(q.total_amount),
        q.quotation_status,
        cuotas,
        abonos,
        reembolsos,
        ctx.hoy,
      ),
    };
  },
};

export const cobranza: Herramienta = {
  nombre: 'cobranza',
  descripcion:
    'Las cuotas sin pagar de los eventos vendidos: las vencidas y las que vencen hasta una ' +
    'fecha (7 días si no se dice), con lo que le falta a cada una y el total. Para «¿quién ' +
    'me debe?» o «¿qué cobro esta semana?».',
  esquema: {
    type: 'object',
    properties: {
      hasta: {
        type: 'string',
        description:
          'Vencen hasta este día (AAAA-MM-DD). Las ya vencidas van siempre.',
      },
    },
  },
  cargos: OPERATIONS_AND_UP,
  permiso: ['postventa'],
  derecho: 'post_venta',
  async ejecutar(entrada, ctx) {
    const hasta = fecha(entrada.hasta, 'hasta') ?? sumarDias(ctx.hoy, 7);
    const { cuotas, abonos } = await ctx.repositorio.cuotasPorCobrar(
      ctx.usuario.company_id,
      hasta,
    );
    const deCuota = pagadoPorCuota(abonos);
    // Solo los eventos de los tipos de cliente que su cargo trabaja (doc
    // 22 §9, tanda 2).
    const tipos = await tiposPara(ctx);
    const filas = cuotas
      .filter((c) => trabajaElTipo(tipos, c.quotations.clients?.client_type))
      .map((c) => ({
        c,
        falta: Math.max(0, n(c.amount) - (deCuota.get(c.id) ?? 0)),
      }))
      .filter((x) => x.falta > 0);
    const vencidas = filas.filter(
      (x) => !!x.c.due_date && x.c.due_date < ctx.hoy,
    );
    return {
      ...(tipos ? { trabaja: true as const } : {}),
      hasta: conDia(hasta),
      total_por_cobrar: pesos(filas.reduce((s, x) => s + x.falta, 0)),
      vencido: pesos(vencidas.reduce((s, x) => s + x.falta, 0)),
      cuotas: filas.slice(0, 40).map(({ c, falta }) => ({
        numero: c.quotations.quotation_number,
        enlace: enlaceDe(c.quotations, ctx.usuario.role),
        cliente: c.quotations.clients?.name ?? null,
        evento: conDia(diaDelEvento(c.quotations.event_date)),
        cuota: c.payment_number,
        vence: conDia(c.due_date),
        vencida: !!c.due_date && c.due_date < ctx.hoy ? true : undefined,
        falta: pesos(falta),
      })),
      mostradas: Math.min(40, filas.length),
      en_total: filas.length,
    };
  },
};
