import { SALES_AND_UP } from 'src/auth/roles.decorator';
import { RequestType } from 'src/quotations/constants/constants';
import type { FilaDeLista } from '../asistente.repository';
import {
  ESTADOS,
  conDia,
  diaDelEvento,
  enlaceDe,
  entero,
  estadoDe,
  estados,
  fecha,
  fechaEnChile,
  inicioDelDiaEnChile,
  pesos,
  sumarDias,
  texto,
  type Herramienta,
} from './comun';

// «¿Cuántas cotizaciones de matrimonio enviamos en octubre?», «¿qué tiene
// Rudel?». La lista del tablero de Cotizaciones, con sus filtros: es de
// quien vende (SECTION_ROLES.quotations).

const ORDENES = ['fecha_evento', 'numero', 'creada', 'total'] as const;

export const filaComoLaVePersona = (
  q: FilaDeLista,
  rol: Parameters<typeof enlaceDe>[1],
) => ({
  numero: q.quotation_number,
  enlace: enlaceDe(q, rol),
  cliente: q.clients?.name ?? null,
  estado: estadoDe(q.quotation_status),
  tipo:
    q.request_type === RequestType.REQUERIMIENTO
      ? 'requerimiento'
      : 'cotización',
  evento: q.event_type,
  fecha: conDia(diaDelEvento(q.event_date)),
  hasta: conDia(diaDelEvento(q.event_end_date)),
  personas: q.people_count,
  ninos: q.children_count || undefined,
  total: pesos(q.total_amount),
  enviada: q.sent_at ? fechaEnChile(q.sent_at) : undefined,
  creada: fechaEnChile(q.created_at),
});

export const buscarCotizaciones: Herramienta = {
  nombre: 'buscar_cotizaciones',
  descripcion:
    'Busca cotizaciones y requerimientos de la empresa, como el tablero de Cotizaciones. ' +
    'Sirve para contar ("¿cuántas…?") y para listar. Devuelve el total que calza con los ' +
    'filtros y hasta `limite` filas, cada una con su enlace. Fechas en AAAA-MM-DD.',
  esquema: {
    type: 'object',
    properties: {
      numero: { type: 'integer', description: 'El N° de la cotización.' },
      cliente: {
        type: 'string',
        description: 'Parte del nombre del cliente (empresa o persona).',
      },
      estados: {
        type: 'array',
        items: { type: 'string', enum: ESTADOS },
        description:
          'solicitada, enviada, en_negociacion, aceptada (vendida), realizada (el evento ya pasó), rechazada (perdida) o cancelada (anulada). Sin filtro: todas.',
      },
      tipo: {
        type: 'string',
        enum: ['cotizacion', 'requerimiento'],
        description:
          'cotizacion: la formal, con precio. requerimiento: la solicitud que todavía no se cotiza. Sin filtro: las dos.',
      },
      tipo_de_evento: {
        type: 'string',
        description:
          'Parte del tipo de evento: matrimonio, paseo, faena, graduación…',
      },
      evento_desde: { type: 'string', description: 'Fecha del evento desde.' },
      evento_hasta: { type: 'string', description: 'Fecha del evento hasta.' },
      creada_desde: {
        type: 'string',
        description: 'Creada desde (día en Chile).',
      },
      creada_hasta: {
        type: 'string',
        description: 'Creada hasta (día en Chile), incluido.',
      },
      orden: {
        type: 'string',
        enum: [...ORDENES],
        description:
          'fecha_evento (la más próxima primero), numero, creada o total (las nuevas o las más grandes primero).',
      },
      limite: {
        type: 'integer',
        minimum: 1,
        maximum: 50,
        description: 'Cuántas filas traer (20 si no se dice).',
      },
    },
  },
  cargos: SALES_AND_UP,
  async ejecutar(entrada, ctx) {
    const creadaHasta = fecha(entrada.creada_hasta, 'creada_hasta');
    const tipo = entrada.tipo;
    const { filas, total } = await ctx.repositorio.buscarCotizaciones(
      ctx.usuario.company_id,
      {
        numero: entero(entrada.numero, 1, 10_000_000),
        cliente: texto(entrada.cliente, 80),
        estados: estados(entrada.estados),
        tipo:
          tipo === 'cotizacion'
            ? RequestType.COTIZACION
            : tipo === 'requerimiento'
              ? RequestType.REQUERIMIENTO
              : undefined,
        tipoDeEvento: texto(entrada.tipo_de_evento, 60),
        eventoDesde: fecha(entrada.evento_desde, 'evento_desde'),
        eventoHasta: fecha(entrada.evento_hasta, 'evento_hasta'),
        creadaDesde: (() => {
          const d = fecha(entrada.creada_desde, 'creada_desde');
          return d ? inicioDelDiaEnChile(d) : undefined;
        })(),
        // «Hasta el 31», incluido: hasta que empieza el día siguiente.
        creadaHasta: creadaHasta
          ? inicioDelDiaEnChile(sumarDias(creadaHasta, 1))
          : undefined,
        orden: ORDENES.includes(entrada.orden as (typeof ORDENES)[number])
          ? (entrada.orden as (typeof ORDENES)[number])
          : 'fecha_evento',
        limite: entero(entrada.limite, 1, 50) ?? 20,
      },
    );
    return {
      total_que_calzan: total,
      mostradas: filas.length,
      cotizaciones: filas.map((q) => filaComoLaVePersona(q, ctx.usuario.role)),
    };
  },
};
