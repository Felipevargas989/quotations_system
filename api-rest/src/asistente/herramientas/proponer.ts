import { RECEPTION_AND_UP } from 'src/auth/roles.decorator';
import type { CambioDeCabecera } from '../propuestas/cabecera';
import { CANALES, type Canal } from '../propuestas/comun';
import type { DatosDeLaNueva } from '../propuestas/cotizacion-nueva.service';
import {
  ACCIONES,
  MAX_CAMBIOS,
  type Accion,
  type Cambio,
} from '../propuestas/editar-foto';
import {
  ErrorDeHerramienta,
  entero,
  fecha,
  texto,
  type ContextoDeHerramienta,
  type Herramienta,
} from './comun';
import { tiposPara } from './recepcion';

// FASE 2: PROPONER, NUNCA ESCRIBIR (doc 20 §3, regla 3). Estas herramientas
// no cambian nada: arman una PROPUESTA con el antes y el después, el total y
// los avisos, la guardan y la persona la ve en una tarjeta. Se aplica recién
// con su «Sí, aplicar» (POST /asistente/propuestas/:id/aplicar), que vuelve
// a revisar todo. Las abre quien vende; las reglas de cada estado (las
// aceptadas, solo administración y operaciones; lo realizado, congelado; los
// días servidos, cerrados) las revisa `PropuestasService` con código.

const ids = (v: unknown): number[] | undefined =>
  Array.isArray(v)
    ? v
        .map((x) => entero(x, 1, 100_000_000))
        .filter((x): x is number => x !== undefined)
    : undefined;

/** El código de un servicio, venga como texto o como número. */
const codigo = (v: unknown): string | undefined => {
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  const t = String(v).trim().slice(0, 40);
  return t || undefined;
};

/** Lee los cambios que manda la IA, sin creerle: lo que no es del tipo
 *  esperado queda afuera y las reglas del armado avisan qué falta. */
export const leerCambios = (v: unknown): Cambio[] => {
  if (!Array.isArray(v) || v.length === 0) {
    throw new ErrorDeHerramienta(
      '`cambios` tiene que ser una lista con al menos un cambio.',
    );
  }
  if (v.length > MAX_CAMBIOS) {
    throw new ErrorDeHerramienta(
      `Son ${v.length} cambios: el tope es ${MAX_CAMBIOS} por propuesta. Pártela en dos.`,
    );
  }
  return v.map((x, i) => {
    const c = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    if (!ACCIONES.includes(c.accion as Accion)) {
      throw new ErrorDeHerramienta(
        `cambio ${i + 1}: la acción «${String(c.accion)}» no existe (son ${ACCIONES.join(', ')}).`,
      );
    }
    return {
      accion: c.accion as Accion,
      dia: entero(c.dia, 0, 400),
      categoria: texto(c.categoria, 120),
      audiencia:
        c.audiencia === 'ninos'
          ? 'ninos'
          : c.audiencia === 'adultos'
            ? 'adultos'
            : undefined,
      personas: entero(c.personas, 0, 100_000),
      menu_id: entero(c.menu_id, 0, 100_000_000),
      quitar: ids(c.quitar),
      servicios: Array.isArray(c.servicios)
        ? c.servicios.map((s) => {
            const o = (s && typeof s === 'object' ? s : {}) as Record<
              string,
              unknown
            >;
            return {
              id: entero(o.id, 0, 100_000_000) ?? 0,
              cantidad: entero(o.cantidad, 0, 1_000) ?? 0,
            };
          })
        : undefined,
      ids: Array.isArray(c.ids)
        ? c.ids
            .map((y) => String(y).trim())
            .filter(Boolean)
            .slice(0, 60)
        : undefined,
      id: entero(c.id, 1, 100_000_000),
      cantidad: entero(c.cantidad, 0, 10_000),
      cual: entero(c.cual, 1, 100_000),
      que_tiene: codigo(c.que_tiene),
    };
  });
};

/** Las personas del evento y el descuento (04-11-2026, `cabecera.ts`),
 *  leídos sin creerle a la IA. undefined = la propuesta no los cambia. */
export const leerCabecera = (
  entrada: Record<string, unknown>,
): CambioDeCabecera | undefined => {
  const cabecera: CambioDeCabecera = {};
  const p = entrada.personas_del_evento;
  if (p && typeof p === 'object') {
    const o = p as Record<string, unknown>;
    const total = entero(o.total, 1, 100_000);
    if (total === undefined) {
      throw new ErrorDeHerramienta(
        '`personas_del_evento.total`: cuántas personas son en total, niños incluidos.',
      );
    }
    cabecera.personas = { total, ninos: entero(o.ninos, 0, 100_000) };
  }
  const d = entrada.descuento;
  if (d && typeof d === 'object') {
    const o = d as Record<string, unknown>;
    const pct =
      typeof o.porcentaje === 'number' && Number.isFinite(o.porcentaje)
        ? Math.round(o.porcentaje * 100) / 100
        : undefined;
    const monto = entero(o.monto, 0, 10_000_000_000);
    if ((pct === undefined) === (monto === undefined)) {
      throw new ErrorDeHerramienta(
        '`descuento`: uno de los dos, `porcentaje` (10 = 10 %) o `monto` en pesos. 0 lo saca.',
      );
    }
    cabecera.descuento = pct !== undefined ? { porcentaje: pct } : { monto };
  }
  const f = texto(entrada.fecha_del_evento, 10);
  if (f) cabecera.fecha = { inicio: f };
  return cabecera.personas || cabecera.descuento || cabecera.fecha
    ? cabecera
    : undefined;
};

/** La cotización: la del N°, o la que la persona tiene abierta. */
const cual = (
  entrada: Record<string, unknown>,
  ctx: ContextoDeHerramienta,
): { numero: number } | { id: string } => {
  const numero = entero(entrada.numero, 1, 10_000_000);
  if (numero) return { numero };
  if (ctx.cotizacionAbierta) return { id: ctx.cotizacionAbierta };
  throw new ErrorDeHerramienta(
    'Falta el N°: la persona no tiene ninguna cotización abierta.',
  );
};

/** Una propuesta nueva de la misma cotización reemplaza a la anterior.
 *  Las lecciones (doc 20 §17) no son de una cotización: ni reemplazan ni
 *  se reemplazan. */
export const mostrar = (
  ctx: ContextoDeHerramienta,
  tarjeta: ContextoDeHerramienta['tarjetas'][number],
) => {
  const esLeccion = (t: { tipo: string }) => t.tipo.startsWith('leccion');
  const k = esLeccion(tarjeta)
    ? -1
    : ctx.tarjetas.findIndex(
        (t) => !esLeccion(t) && t.cotizacion_id === tarjeta.cotizacion_id,
      );
  if (k >= 0) ctx.tarjetas.splice(k, 1);
  ctx.tarjetas.push(tarjeta);
};

const CUANDO_TERMINA =
  'La persona ve una tarjeta con el antes, el después y el botón «Sí, aplicar». Todavía NO está aplicado: no digas que ya se hizo. Cuéntale en una o dos líneas qué propones y pídele que lo revise en la tarjeta.';

export const proponerCambioDeServicios: Herramienta = {
  nombre: 'proponer_cambio_de_servicios',
  descripcion:
    'Propone cambiar los servicios de una cotización: agregar o quitar servicios del catálogo de ' +
    'una casilla (un día, una categoría, adultos o niños), cambiar sus personas, poner una casilla ' +
    'entera (un menú guardado adaptado, como «Crear con IA»: así se arma una minuta día por día), ' +
    'sacar una casilla, o poner y sacar fijos. También las personas del evento (adultos y niños, ' +
    'solo si no está aceptada: las casillas que tenían el total lo siguen, como en el cotizador), ' +
    'la fecha del evento (solo si no está aceptada: se mueve entero y la tarjeta avisa si choca con ' +
    'un evento aceptado) y el descuento que la persona pida, con el tope de su cargo. NO cambia ' +
    'nada: arma la propuesta y la persona la ' +
    'aprueba con «Sí, aplicar». Eventia pone los nombres y los precios del catálogo; tú solo ids y ' +
    'cantidades. Antes, mira la ficha (ver_cotizacion trae el id de cada servicio) y busca en el ' +
    'catálogo. Todos los cambios de una vez, en una sola propuesta. Sin `numero`, la cotización ' +
    'abierta.',
  esquema: {
    type: 'object',
    properties: {
      numero: { type: 'integer', description: 'El N° de la cotización.' },
      resumen: {
        type: 'string',
        description:
          'Una línea para la persona y la bitácora: «Leche asada en vez de leche nevada los días 1 y 13».',
      },
      personas_del_evento: {
        type: 'object',
        description:
          'Las personas del evento, solo si cambian: `total` (niños incluidos) y `ninos`. Solo en una cotización no aceptada.',
        properties: {
          total: { type: 'integer' },
          ninos: { type: 'integer' },
        },
        required: ['total'],
      },
      fecha_del_evento: {
        type: 'string',
        description:
          'La fecha nueva del primer día, AAAA-MM-DD, solo si cambia y la cotización no está aceptada. El evento entero se mueve: el último día corre lo mismo. Nunca una fecha pasada.',
      },
      descuento: {
        type: 'object',
        description:
          'Solo si la persona lo pide (nunca lo ofrezcas tú): `porcentaje` (10 = 10 %) o `monto` en pesos; 0 lo saca. Tope: administración 40 %, ventas y operaciones 15 %.',
        properties: {
          porcentaje: { type: 'number' },
          monto: { type: 'integer' },
        },
      },
      cambios: {
        type: 'array',
        description: `Los cambios de servicios, en orden (hasta ${MAX_CAMBIOS}). Puede ir vacío si solo cambian las personas del evento, la fecha o el descuento.`,
        items: {
          type: 'object',
          properties: {
            accion: {
              type: 'string',
              enum: [...ACCIONES],
              description:
                'poner_casilla: crea la casilla o la reemplaza entera (menu_id + quitar + servicios, como «Crear con IA»). agregar: suma servicios a una casilla que ya existe (si ya está, queda con esa cantidad). quitar: saca servicios de una casilla por su id (`ids`). personas: cambia las personas de una casilla. quitar_casilla: la saca. poner_fijo: agrega un fijo o le cambia la cantidad. quitar_fijo: lo saca.',
            },
            dia: {
              type: 'integer',
              description:
                'El día del evento (desde 1). En los fijos, 0 = todo el evento.',
            },
            categoria: {
              type: 'string',
              description:
                'La categoría EXACTA de la casilla (Cena, Almuerzo…).',
            },
            audiencia: { type: 'string', enum: ['adultos', 'ninos'] },
            personas: {
              type: 'integer',
              description:
                'Cuántas personas tiene la casilla (poner_casilla, personas).',
            },
            menu_id: {
              type: 'integer',
              description:
                'poner_casilla: el menú guardado que es la base; 0 si va entera con sueltos.',
            },
            quitar: {
              type: 'array',
              items: { type: 'integer' },
              description:
                'poner_casilla: los platos del menú guardado que se sacan.',
            },
            servicios: {
              type: 'array',
              description:
                'poner_casilla y agregar: sueltos de la categoría, con la cantidad POR PERSONA (casi siempre 1).',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  cantidad: { type: 'integer' },
                },
                required: ['id', 'cantidad'],
              },
            },
            ids: {
              type: 'array',
              items: { type: 'string' },
              description:
                'quitar: los ids de los servicios que se sacan, como los trae la ficha.',
            },
            id: {
              type: 'integer',
              description: 'poner_fijo y quitar_fijo: el id del fijo.',
            },
            cantidad: {
              type: 'integer',
              description: 'poner_fijo: cuántos (1 o más).',
            },
            que_tiene: {
              type: 'string',
              description:
                'Solo si ese día hay dos casillas iguales: el id de un servicio que tiene HOY la que se cambia (la ficha trae los ids).',
            },
            cual: {
              type: 'integer',
              description:
                'Otra forma de distinguir dos casillas iguales: las personas que tiene HOY la que se cambia.',
            },
          },
          required: ['accion'],
        },
      },
    },
    required: ['resumen'],
  },
  // Recepción también, en las cotizaciones de clientes particulares (doc
  // 21): lo revisa PropuestasService.
  cargos: RECEPTION_AND_UP,
  dentroDe: ['requerimientos', 'cotizaciones'],
  async ejecutar(entrada, ctx) {
    const resumen = texto(entrada.resumen, 200);
    if (!resumen) {
      throw new ErrorDeHerramienta(
        'Falta el `resumen`: una línea para la persona.',
      );
    }
    const cabecera = leerCabecera(entrada);
    const hayServicios =
      Array.isArray(entrada.cambios) && entrada.cambios.length > 0;
    if (!hayServicios && !cabecera) {
      throw new ErrorDeHerramienta(
        'Falta qué cambiar: `cambios` de servicios, `personas_del_evento`, `fecha_del_evento` o `descuento`.',
      );
    }
    const tarjeta = await ctx.propuestas.proponerServicios(
      ctx.usuario,
      cual(entrada, ctx),
      hayServicios ? leerCambios(entrada.cambios) : [],
      resumen,
      ctx.hoy,
      cabecera,
    );
    mostrar(ctx, tarjeta);
    return {
      // Si su cargo no trabaja todos los tipos, solo le llega si es de uno
      // que trabaja (doc 22 §9; a recepción, de fábrica, un particular):
      // lo revisó `alProponer`.
      ...((await tiposPara(ctx)) ? { trabaja: true as const } : {}),
      propuesta: 'lista',
      numero: tarjeta.numero,
      total: tarjeta.total,
      cuotas: tarjeta.cuotas
        ? 'cambian según «el plan mantiene su forma»: la tarjeta las muestra'
        : undefined,
      cuota_nueva: tarjeta.cuota_nueva,
      reembolso_nuevo: tarjeta.reembolso_nuevo,
      avisos: tarjeta.avisos.length ? tarjeta.avisos : undefined,
      importante: CUANDO_TERMINA,
    };
  },
};

export const proponerNota: Herramienta = {
  nombre: 'proponer_nota',
  descripcion:
    'Propone una nota en la bitácora (Seguimiento) de una cotización: lo que la persona hizo o ' +
    'acordó, por qué canal y, si quedó, el próximo contacto. NO la escribe: la persona la aprueba. ' +
    'Queda a nombre de BelIA, «a pedido de» quien la pidió. Sin `numero`, la cotización abierta.',
  esquema: {
    type: 'object',
    properties: {
      numero: { type: 'integer', description: 'El N° de la cotización.' },
      nota: {
        type: 'string',
        description: 'El texto de la nota, en una o dos líneas.',
      },
      canal: { type: 'string', enum: [...CANALES] },
      proximo_contacto: {
        type: 'string',
        description: 'AAAA-MM-DD, solo si quedó un compromiso.',
      },
    },
    required: ['nota'],
  },
  // Recepción también: en sus requerimientos y en las cotizaciones de
  // particulares (doc 21).
  cargos: RECEPTION_AND_UP,
  dentroDe: ['requerimientos', 'cotizaciones'],
  async ejecutar(entrada, ctx) {
    const nota = texto(entrada.nota, 1_000);
    if (!nota) throw new ErrorDeHerramienta('Falta el texto de la nota.');
    const canal: Canal = CANALES.includes(entrada.canal as Canal)
      ? (entrada.canal as Canal)
      : 'otro';
    const proximo = fecha(entrada.proximo_contacto, 'proximo_contacto') ?? null;
    if (proximo && proximo < ctx.hoy) {
      throw new ErrorDeHerramienta(
        'El próximo contacto no puede ser una fecha que ya pasó.',
      );
    }
    const tarjeta = await ctx.propuestas.proponerNota(
      ctx.usuario,
      cual(entrada, ctx),
      nota,
      canal,
      proximo,
    );
    mostrar(ctx, tarjeta);
    return {
      propuesta: 'lista',
      numero: tarjeta.numero,
      importante:
        'La persona ve la nota en una tarjeta con el botón «Sí, anotar». Todavía NO está anotada: no digas que ya se hizo. Dile en una línea qué vas a anotar y que lo apruebe en la tarjeta.',
    };
  },
};

/** «Prepárame el seguimiento de la 600» (doc 20 §17, mejora 4): el
 *  borrador del correo en el hilo del cliente, como «✉ Generar
 *  seguimiento». No escribe nada: la persona lo aprueba en la tarjeta. */
export const proponerSeguimiento: Herramienta = {
  nombre: 'proponer_seguimiento',
  descripcion:
    'Propone dejar el borrador del correo de seguimiento de una cotización dentro del hilo del ' +
    'cliente en Outlook: lo mismo que el botón «✉ Generar seguimiento». La IA de Eventia lo escribe ' +
    'con las reglas de la casa y nunca se envía: la persona lo revisa y lo envía. Entra cualquier ' +
    'enviada o en negociación que la persona ve, cuando la persona lo pide, aunque su próximo ' +
    'contacto no haya vencido; si no entra, explícale por qué. Antes, mira con ultimo_correo dónde ' +
    'está el último correo y cuéntaselo. NO hace nada: la persona lo aprueba en la tarjeta. Sin ' +
    '`numero`, la cotización abierta.',
  esquema: {
    type: 'object',
    properties: {
      numero: { type: 'integer', description: 'El N° de la cotización.' },
    },
  },
  // Recepción también, en las cotizaciones de particulares (doc 21).
  cargos: RECEPTION_AND_UP,
  dentroDe: ['cotizaciones'],
  derecho: 'seguimiento_con_ia',
  async ejecutar(entrada, ctx) {
    const tarjeta = await ctx.propuestas.proponerSeguimiento(
      ctx.usuario,
      cual(entrada, ctx),
    );
    mostrar(ctx, tarjeta);
    return {
      propuesta: 'lista',
      numero: tarjeta.numero,
      importante:
        'La persona ve una tarjeta con «Sí, dejar el borrador». Todavía NO está escrito: no digas que ya se hizo ni inventes lo que dirá el correo. Dile en una línea que lo apruebe en la tarjeta.',
    };
  },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** «Crear evento» (doc 20 §8b, la lámina de Felipe): una cotización nueva,
 *  como propuesta. No crea nada: la persona aprueba con «Sí, crear». */
export const proponerCotizacionNueva: Herramienta = {
  nombre: 'proponer_cotizacion_nueva',
  descripcion:
    'Propone crear un evento nuevo: una cotización con sus servicios del catálogo (casillas con ' +
    'poner_casilla y fijos con poner_fijo, igual que en proponer_cambio_de_servicios) o, sin ' +
    'servicios, un requerimiento para armarla después. El cliente es uno que ya existe (su id, ' +
    'de buscar_clientes; búscalo SIEMPRE primero) o uno nuevo con sus datos. NO crea nada: la ' +
    'persona lo aprueba con «Sí, crear». Si falta un dato (tipo de evento, fecha, personas, ' +
    'cliente), pregúntalo antes de proponer. Recepción solo crea requerimientos: sin `cambios`.',
  esquema: {
    type: 'object',
    properties: {
      resumen: {
        type: 'string',
        description:
          'Una línea: «Almuerzo de fin de año de Ecofor, 80 personas, vie 12-12».',
      },
      cliente_id: {
        type: 'string',
        description: 'El id de un cliente que ya existe (de buscar_clientes).',
      },
      cliente_nuevo: {
        type: 'object',
        description:
          'Solo si no existe. Eventia revisa que no se parezca a otro antes de crearlo.',
        properties: {
          nombre: { type: 'string' },
          tipo: {
            type: 'string',
            description:
              'El tipo de cliente de la empresa (Empresas, Particulares…).',
          },
          correo: { type: 'string' },
          telefono: { type: 'string' },
          contacto: {
            type: 'string',
            description: 'La persona de contacto, si es otra.',
          },
          es_otro_cliente: {
            type: 'boolean',
            description:
              'Solo si Eventia avisó de un cliente parecido y la persona dijo que es otro.',
          },
        },
        required: ['nombre', 'tipo'],
      },
      tipo_de_evento: {
        type: 'string',
        description: 'Uno de los tipos de evento de la empresa.',
      },
      fecha: { type: 'string', description: 'El primer día, AAAA-MM-DD.' },
      ultimo_dia: {
        type: 'string',
        description: 'AAAA-MM-DD, solo si dura más de un día.',
      },
      personas: {
        type: 'integer',
        description: 'El total, adultos y niños.',
      },
      ninos: { type: 'integer', description: 'Los niños dentro del total.' },
      contacto: {
        type: 'string',
        description: 'Quién pide el evento por el cliente (opcional).',
      },
      pedido: {
        type: 'string',
        description:
          'Lo que pidió el cliente, en pocas líneas: va al comentario interno, nunca a las observaciones.',
      },
      cambios: {
        type: 'array',
        description: `Las casillas y los fijos (hasta ${MAX_CAMBIOS}), con el mismo formato de proponer_cambio_de_servicios. Vacío = requerimiento.`,
        items: { type: 'object' },
      },
    },
    required: ['resumen', 'tipo_de_evento', 'fecha', 'personas'],
  },
  // Recepción también (doc 20 §13): requerimientos para cualquier cliente y,
  // desde el doc 21, cotizaciones con servicios para los particulares. Lo
  // revisa PropuestasService, y otra vez al crear.
  cargos: RECEPTION_AND_UP,
  dentroDe: ['requerimientos', 'cotizaciones'],
  async ejecutar(entrada, ctx) {
    const resumen = texto(entrada.resumen, 200);
    if (!resumen) {
      throw new ErrorDeHerramienta(
        'Falta el `resumen`: una línea para la persona.',
      );
    }
    const fechaDelEvento = fecha(entrada.fecha, 'fecha');
    if (!fechaDelEvento)
      throw new ErrorDeHerramienta('Falta la fecha del evento.');
    const tipoDeEvento = texto(entrada.tipo_de_evento, 80);
    if (!tipoDeEvento) throw new ErrorDeHerramienta('Falta el tipo de evento.');
    const clienteId = texto(entrada.cliente_id, 40);
    if (clienteId && !UUID.test(clienteId)) {
      throw new ErrorDeHerramienta(
        'El cliente_id no es un id de Eventia: búscalo con buscar_clientes.',
      );
    }
    const n =
      entrada.cliente_nuevo && typeof entrada.cliente_nuevo === 'object'
        ? (entrada.cliente_nuevo as Record<string, unknown>)
        : null;
    const datos: DatosDeLaNueva = {
      resumen,
      tipo_de_evento: tipoDeEvento,
      fecha: fechaDelEvento,
      ultimo_dia: fecha(entrada.ultimo_dia, 'ultimo_dia'),
      personas: entero(entrada.personas, 0, 100_000) ?? 0,
      ninos: entero(entrada.ninos, 0, 100_000) ?? 0,
      contacto: texto(entrada.contacto, 120),
      pedido: texto(entrada.pedido, 2_000),
      ...(clienteId
        ? { cliente_id: clienteId }
        : n
          ? {
              cliente_nuevo: {
                nombre: texto(n.nombre, 160) ?? '',
                tipo: texto(n.tipo, 80) ?? '',
                correo: texto(n.correo, 160),
                telefono: texto(n.telefono, 40),
                contacto: texto(n.contacto, 120),
                es_otro_cliente: n.es_otro_cliente === true,
              },
            }
          : {}),
      cambios:
        Array.isArray(entrada.cambios) && entrada.cambios.length > 0
          ? leerCambios(entrada.cambios)
          : [],
    };
    const tarjeta = await ctx.propuestas.proponerCotizacionNueva(
      ctx.usuario,
      datos,
      ctx.hoy,
    );
    ctx.tarjetas.push(tarjeta);
    return {
      // Con plata solo si es una cotización, y si su cargo no trabaja todos
      // los tipos, solo le llega la de uno que trabaja (doc 22 §9).
      ...((await tiposPara(ctx)) && tarjeta.total
        ? { trabaja: true as const }
        : {}),
      propuesta: 'lista',
      es: tarjeta.nueva?.es,
      cliente: tarjeta.cliente,
      total: tarjeta.total?.despues,
      avisos: tarjeta.avisos.length ? tarjeta.avisos : undefined,
      importante:
        'La persona ve la tarjeta con «Sí, crear». Todavía NO está creada: no digas que ya se hizo. Cuéntale en una o dos líneas qué vas a crear y pídele que lo revise en la tarjeta.',
    };
  },
};
