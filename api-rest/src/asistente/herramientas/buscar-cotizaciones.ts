import { RECEPTION_AND_UP } from 'src/auth/roles.decorator';
import { esDeLosParticulares } from 'src/clients/alcance-de-recepcion';
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
import { esRecepcion, particularesPara } from './recepcion';

// «¿Cuántas cotizaciones de matrimonio enviamos en octubre?», «¿qué tiene
// Rudel?». La lista del tablero de Cotizaciones, con sus filtros: es de
// quien vende (SECTION_ROLES.quotations). Recepción también la usa desde
// el 04-11 (doc 20 §13), para saber en qué va el pedido de un cliente: le
// llega sin el total ni el enlace a la ficha, que su pantalla no abre. Las de
// clientes particulares, completas y con la marca `particular` (doc 21).

const ORDENES = ['fecha_evento', 'numero', 'creada', 'total'] as const;

export const filaComoLaVePersona = (
  q: FilaDeLista,
  rol: Parameters<typeof enlaceDe>[1],
  // Para recepción: si el cliente es particular, la ve completa (doc 21).
  deParticular = false,
) => {
  const recepcion = esRecepcion(rol);
  const conPlata = !recepcion || deParticular;
  return {
    numero: q.quotation_number,
    ...(recepcion && deParticular ? { particular: true as const } : {}),
    ...(conPlata ? { enlace: enlaceDe(q, rol, deParticular) } : {}),
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
    ...(conPlata ? { total: pesos(q.total_amount) } : {}),
    enviada: q.sent_at ? fechaEnChile(q.sent_at) : undefined,
    creada: fechaEnChile(q.created_at),
  };
};

/** La lista como la ve quien pregunta: a recepción, fila por fila, completa
 *  la de un particular y sin plata las demás. */
export const filasComoLasVePersona = async (
  filas: FilaDeLista[],
  ctx: Parameters<typeof particularesPara>[0],
) => {
  const particulares = await particularesPara(ctx);
  return filas.map((q) =>
    filaComoLaVePersona(
      q,
      ctx.usuario.role,
      esDeLosParticulares(particulares, q.clients?.client_type),
    ),
  );
};

export const buscarCotizaciones: Herramienta = {
  nombre: 'buscar_cotizaciones',
  descripcion:
    'Busca cotizaciones y requerimientos de la empresa, como el tablero de Cotizaciones. ' +
    'Sirve para contar ("¿cuántas…?") y para listar. Devuelve el total que calza con los ' +
    'filtros y hasta `limite` filas, cada una con su enlace (para recepción, sin el total ni ' +
    'el enlace, salvo las de clientes particulares, que traen `particular: true`). ' +
    'Fechas en AAAA-MM-DD.',
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
  cargos: RECEPTION_AND_UP,
  permiso: ['requerimientos', 'cotizaciones'],
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
        // Recepción no ordena por plata: «las más grandes primero» también
        // dice cuánto valen.
        orden:
          ORDENES.includes(entrada.orden as (typeof ORDENES)[number]) &&
          !(entrada.orden === 'total' && esRecepcion(ctx.usuario.role))
            ? (entrada.orden as (typeof ORDENES)[number])
            : 'fecha_evento',
        limite: entero(entrada.limite, 1, 50) ?? 20,
      },
    );
    return {
      total_que_calzan: total,
      mostradas: filas.length,
      cotizaciones: await filasComoLasVePersona(filas, ctx),
    };
  },
};
