import { RECEPTION_AND_UP } from 'src/auth/roles.decorator';
import { QuotationStatus } from 'src/quotations/constants/constants';
import { filasComoLasVePersona } from './buscar-cotizaciones';
import {
  ESTADOS,
  ErrorDeHerramienta,
  conDia,
  diaDelEvento,
  diasEntre,
  estados,
  fecha,
  sumarDias,
  type Herramienta,
} from './comun';

// «¿Qué eventos tenemos la semana que viene?», «¿está libre el 14-11?». El
// Calendario: los eventos que tocan un rango de fechas y los días con más
// de uno. Lo ven todos, recepción incluida (SECTION_ROLES.calendar), con
// el derecho del plan (`calendario`, Gestiona y Cobra para arriba). A
// recepción le llega sin el total ni el enlace a la ficha (doc 20 §13), salvo
// los eventos de clientes particulares (doc 21).

/** Lo que se ve en el Calendario si no se pide otra cosa: lo vivo y lo
 *  vendido, sin lo perdido ni lo anulado. */
const LO_DEL_CALENDARIO = [
  QuotationStatus.SOLICITADA,
  QuotationStatus.ENVIADA,
  QuotationStatus.EN_NEGOCIACION,
  QuotationStatus.ACEPTADA,
  QuotationStatus.REALIZADA,
];

const VENDIDO = new Set([QuotationStatus.ACEPTADA, QuotationStatus.REALIZADA]);

const MAX_DIAS = 120;

export const calendario: Herramienta = {
  nombre: 'calendario',
  descripcion:
    'Los eventos que caen en un rango de fechas (máximo 120 días), con los de varios días ' +
    'incluidos, y los días donde hay más de un evento vendido o en juego. Fechas en AAAA-MM-DD.',
  esquema: {
    type: 'object',
    properties: {
      desde: { type: 'string', description: 'Primer día del rango.' },
      hasta: { type: 'string', description: 'Último día del rango, incluido.' },
      estados: {
        type: 'array',
        items: { type: 'string', enum: ESTADOS },
        description:
          'Si no se dice: solicitada, enviada, en_negociacion, aceptada y realizada.',
      },
    },
    required: ['desde', 'hasta'],
  },
  cargos: RECEPTION_AND_UP,
  permiso: ['calendario'],
  derecho: 'calendario',
  async ejecutar(entrada, ctx) {
    const desde = fecha(entrada.desde, 'desde');
    const hasta = fecha(entrada.hasta, 'hasta');
    if (!desde || !hasta) {
      throw new ErrorDeHerramienta('Faltan las fechas desde y hasta.');
    }
    if (hasta < desde) {
      throw new ErrorDeHerramienta('hasta no puede ser antes que desde.');
    }
    if (diasEntre(desde, hasta) > MAX_DIAS) {
      throw new ErrorDeHerramienta(
        `El rango es de ${MAX_DIAS} días como máximo: pide el calendario por partes.`,
      );
    }
    const filas = await ctx.repositorio.calendario(
      ctx.usuario.company_id,
      desde,
      hasta,
      estados(entrada.estados) ?? LO_DEL_CALENDARIO,
    );

    // Los días con más de un evento, dentro del rango pedido.
    const porDia = new Map<
      string,
      { vendidos: number[]; en_juego: number[] }
    >();
    for (const q of filas) {
      const inicio = diaDelEvento(q.event_date);
      if (!inicio) continue;
      const fin = diaDelEvento(q.event_end_date) ?? inicio;
      for (
        let d = inicio < desde ? desde : inicio;
        d <= fin && d <= hasta;
        d = sumarDias(d, 1)
      ) {
        if (!porDia.has(d)) porDia.set(d, { vendidos: [], en_juego: [] });
        const dia = porDia.get(d)!;
        (VENDIDO.has(q.quotation_status) ? dia.vendidos : dia.en_juego).push(
          q.quotation_number,
        );
      }
    }
    const conVarios = [...porDia.entries()]
      .filter(([, d]) => d.vendidos.length + d.en_juego.length > 1)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([d, v]) => ({
        dia: conDia(d),
        vendidos: v.vendidos,
        en_juego: v.en_juego,
      }));

    return {
      rango: { desde: conDia(desde), hasta: conDia(hasta) },
      eventos: await filasComoLasVePersona(filas, ctx),
      dias_con_mas_de_un_evento: conVarios,
    };
  },
};
