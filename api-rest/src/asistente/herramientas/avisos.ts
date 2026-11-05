import { tieneDerecho } from 'src/auth/derechos';
import { OPERATIONS_AND_UP, RECEPTION_AND_UP } from 'src/auth/roles.decorator';
import { RequestType } from 'src/quotations/constants/constants';
import {
  conDia,
  diaDelEvento,
  enlaceDe,
  fechaEnChile,
  inicioDelDiaEnChile,
  pesos,
  type Herramienta,
} from './comun';
import { clientesQueRevisar } from './mal-clasificados';
import { esRecepcion } from './recepcion';
import { pendientesDe } from './seguimientos-pendientes';

// «¿Qué tengo que revisar hoy?»: lo que hace que BelIA llame la atención
// (doc 20 §8b), en detalle. Cuatro cosas, cada una con el cargo de su
// pantalla:
// - los compromisos que vencen hoy y los requerimientos que llegaron hoy
//   (el tablero, de quien vende);
// - los topes de calendario (el tablero; `ChoquesDeFechaService`, la misma
//   lista que pinta el borde rojo);
// - los comprobantes que mandaron los clientes por el portal y nadie revisó
//   (Post-Venta → Pagos: operaciones para arriba con `post_venta`).
// A recepción (doc 20 §13, 04-11) le tocan solo los requerimientos que
// llegaron hoy, sin enlace: los seguimientos y los topes son de quien vende.
// Desde el doc 21 (§6), a quien vende también los clientes que parecen mal
// clasificados (`mal-clasificados.ts`).

const MAX = 20;

export const avisosDeHoy: Herramienta = {
  nombre: 'avisos_de_hoy',
  descripcion:
    'Lo importante de hoy, lo que hace que BelIA avise: los compromisos de seguimiento que ' +
    'vencen hoy, los requerimientos que llegaron hoy, las cotizaciones con tope de calendario ' +
    '(se topan con un evento aceptado) y, para operaciones y administración, los comprobantes ' +
    'del portal que nadie ha revisado y los clientes que parecen mal clasificados (con lo ' +
    'que conviene cambiarles: se ofrece con proponer_cambio_de_cliente). Para «¿qué tengo que ' +
    'revisar hoy?». A recepción, solo los requerimientos que llegaron hoy.',
  esquema: { type: 'object', properties: {} },
  cargos: RECEPTION_AND_UP,
  permiso: ['requerimientos', 'cotizaciones'],
  async ejecutar(_entrada, ctx) {
    const empresa = ctx.usuario.company_id;
    const rol = ctx.usuario.role;
    if (esRecepcion(rol)) {
      const { filas } = await ctx.repositorio.buscarCotizaciones(empresa, {
        tipo: RequestType.REQUERIMIENTO,
        creadaDesde: inicioDelDiaEnChile(ctx.hoy),
        orden: 'creada',
        limite: MAX,
      });
      return {
        requerimientos_de_hoy: filas.map((q) => ({
          numero: q.quotation_number,
          cliente: q.clients?.name ?? null,
          tipo: q.event_type ?? undefined,
          evento: conDia(diaDelEvento(q.event_date)),
        })),
        nota: 'Los seguimientos y los topes de calendario los ve quien vende.',
      };
    }
    const veComprobantes =
      OPERATIONS_AND_UP.includes(rol) &&
      tieneDerecho(ctx.usuario.derechos, 'post_venta');
    const [
      { deHoy },
      requerimientos,
      choques,
      comprobantes,
      porAprobar,
      malClasificados,
    ] = await Promise.all([
      pendientesDe(ctx, empresa),
      ctx.repositorio.buscarCotizaciones(empresa, {
        tipo: RequestType.REQUERIMIENTO,
        creadaDesde: inicioDelDiaEnChile(ctx.hoy),
        orden: 'creada',
        limite: MAX,
      }),
      ctx.choques.listar(ctx.usuario),
      veComprobantes
        ? ctx.repositorio.comprobantesPorRevisar(empresa)
        : Promise.resolve([]),
      // Las lecciones que esperan a administración (doc 20 §17).
      ctx.propuestas.leccionesPorAprobar(ctx.usuario).catch(() => []),
      // Los clientes mal clasificados (doc 21 §6): si falla, lo demás sirve.
      clientesQueRevisar(ctx).catch(() => []),
    ]);
    const topes = new Map<string, (typeof choques)[number][]>();
    for (const c of choques) {
      topes.set(c.quotation_id, [...(topes.get(c.quotation_id) ?? []), c]);
    }
    return {
      compromisos_que_vencen_hoy: deHoy.slice(0, MAX).map((q) => ({
        numero: q.quotation_number,
        enlace: enlaceDe(q, rol),
        cliente: q.clients?.name ?? null,
        evento: conDia(diaDelEvento(q.event_date as unknown as string)),
      })),
      requerimientos_de_hoy: requerimientos.filas.map((q) => ({
        numero: q.quotation_number,
        enlace: enlaceDe(q, rol),
        cliente: q.clients?.name ?? null,
        tipo: q.event_type ?? undefined,
        evento: conDia(diaDelEvento(q.event_date)),
      })),
      topes_de_calendario: [...topes.values()].slice(0, MAX).map((lista) => ({
        numero: lista[0].quotation_number,
        enlace: `/negocio/${lista[0].quotation_id}`,
        se_topa_con: lista.map(
          (c) =>
            `N° ${c.aceptada.numero}${c.aceptada.cliente ? ` · ${c.aceptada.cliente}` : ''} (${conDia(c.aceptada.desde)}${c.aceptada.hasta !== c.aceptada.desde ? ` a ${conDia(c.aceptada.hasta)}` : ''}${c.aceptada.exclusiva ? ', con exclusividad' : ''})`,
        ),
      })),
      comprobantes_por_revisar: veComprobantes
        ? comprobantes.map((r) => ({
            numero: r.quotations?.quotation_number ?? null,
            enlace: r.quotations ? enlaceDe(r.quotations, rol) : undefined,
            cliente: r.quotations?.clients?.name ?? null,
            cuota: r.payments?.payment_number ?? undefined,
            monto_declarado: pesos(r.declared_amount),
            llego: fechaEnChile(r.created_at),
          }))
        : undefined,
      nota: veComprobantes
        ? undefined
        : 'Los comprobantes del portal los revisan operaciones y administración.',
      lecciones_por_aprobar:
        porAprobar.length > 0 ? porAprobar.slice(0, MAX) : undefined,
      clientes_que_revisar:
        malClasificados.length > 0
          ? {
              total: malClasificados.length,
              primeros: malClasificados.slice(0, 10),
            }
          : undefined,
    };
  },
};
