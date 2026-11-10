import { trabajaElTipo } from 'src/auth/permisos';
import { RECEPTION_AND_UP } from 'src/auth/roles.decorator';
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
  type ContextoDeHerramienta,
  type Herramienta,
} from './comun';
import { esRecepcion, loTrabaja, tiposPara } from './recepcion';

// «¿Cuántas cotizaciones de matrimonio enviamos en octubre?», «¿qué tiene
// Rudel?». La lista del tablero de Cotizaciones, con sus filtros: es de
// quien vende (SECTION_ROLES.quotations). Recepción también la usa desde
// el 04-11 (doc 20 §13), para saber en qué va el pedido de un cliente: le
// llega sin el total ni el enlace a la ficha, que su pantalla no abre. Las de
// clientes particulares, completas y con la marca `trabaja` (doc 21). Desde
// el doc 22 §9, lo mismo para cualquier cargo con un tipo de cliente
// apagado.
//
// Desde el 10-11-2026 (doc 20 §18; Felipe: «solamente en las cotizaciones
// ve lo que tiene el switch activado ... ya no es un secreto los precios»),
// BelIA muestra lo mismo que el tablero (`AlcanceDeRecepcion.filtrar`): las
// cotizaciones de los tipos que el cargo trabaja, completas y con su plata,
// y los requerimientos de todos. Las de los tipos que no trabaja ya no
// llegan, ni siquiera sin plata. El calendario sigue con su excepción: la
// agenda de todos, sin plata.

/** Cuántas filas se leen para filtrar por tipo cuando el cargo no trabaja
 *  todos: el filtro va después de la base, como en el tablero. */
export const FILAS_PARA_FILTRAR = 1000;

/** ¿La ve el cargo, como en el tablero? Los requerimientos, de todos; las
 *  cotizaciones, si trabaja el tipo de su cliente. */
export const laVeElCargo = (
  tipos: Awaited<ReturnType<typeof tiposPara>>,
  q: Pick<FilaDeLista, 'request_type'> & {
    clients?: { client_type?: string | null } | null;
  },
): boolean =>
  q.request_type === RequestType.REQUERIMIENTO ||
  trabajaElTipo(tipos, q.clients?.client_type);

const ORDENES = ['fecha_evento', 'numero', 'creada', 'total'] as const;

export const filaComoLaVePersona = (
  q: FilaDeLista,
  rol: Parameters<typeof enlaceDe>[1],
  // Si el cargo trabaja el tipo del cliente (doc 22 §9; `loTrabaja`): null
  // si trabaja todos. Sin saberlo, recepción no.
  trabaja: boolean | null = esRecepcion(rol) ? false : null,
) => {
  const conPlata = trabaja !== false;
  return {
    numero: q.quotation_number,
    ...(trabaja === true ? { trabaja: true as const } : {}),
    ...(conPlata ? { enlace: enlaceDe(q, rol, conPlata) } : {}),
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

/** La lista como la ve quien pregunta: fila por fila, completa la de un
 *  tipo de cliente que su cargo trabaja y sin plata las demás (doc 22 §9;
 *  a recepción, de fábrica, las de particulares). */
export const filasComoLasVePersona = async (
  filas: FilaDeLista[],
  ctx: Pick<ContextoDeHerramienta, 'usuario' | 'alcance'>,
) => {
  const tipos = await tiposPara(ctx);
  return filas.map((q) =>
    filaComoLaVePersona(
      q,
      ctx.usuario.role,
      loTrabaja(tipos, q.clients?.client_type),
    ),
  );
};

export const buscarCotizaciones: Herramienta = {
  nombre: 'buscar_cotizaciones',
  descripcion:
    'Busca cotizaciones y requerimientos de la empresa, como el tablero de Cotizaciones. ' +
    'Sirve para contar ("¿cuántas…?") y para listar. Devuelve el total que calza con los ' +
    'filtros y hasta `limite` filas, cada una con su enlace y su total. Solo las que el cargo ' +
    've en su tablero: las cotizaciones de los tipos de cliente que trabaja (Permisos por cargo) ' +
    'y los requerimientos de todos; las demás no existen para esta persona. ' +
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
    // Quien no trabaja todos los tipos ve solo lo de su tablero: se leen
    // más filas y se filtran acá, como hace el tablero.
    const tipos = await tiposPara(ctx);
    const conRed = tipos !== null;
    const limite = entero(entrada.limite, 1, 50) ?? 20;
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
        limite: conRed ? FILAS_PARA_FILTRAR : limite,
      },
    );
    if (!conRed) {
      return {
        total_que_calzan: total,
        mostradas: filas.length,
        cotizaciones: await filasComoLasVePersona(filas, ctx),
      };
    }
    const visibles = filas.filter((q) => laVeElCargo(tipos, q));
    const mostradas = visibles.slice(0, limite);
    return {
      total_que_calzan: visibles.length,
      ...(total > FILAS_PARA_FILTRAR
        ? {
            aviso: `Se revisaron las ${FILAS_PARA_FILTRAR} primeras; con filtros más precisos la cuenta es exacta.`,
          }
        : {}),
      mostradas: mostradas.length,
      cotizaciones: mostradas.map((q) =>
        filaComoLaVePersona(q, ctx.usuario.role, true),
      ),
    };
  },
};
