import { RECEPTION_AND_UP } from 'src/auth/roles.decorator';
import { QuotationStatus } from 'src/quotations/constants/constants';
import type { UserRole } from 'src/users/entities/user.entity';
import type {
  CotizacionDeCliente,
  FilaDeCliente,
} from '../asistente.repository';
import { normal } from './buscar-en-catalogo';
import {
  ErrorDeHerramienta,
  conDia,
  diaDelEvento,
  enlaceDe,
  estadoDe,
  pesos,
  texto,
  type Herramienta,
} from './comun';
import { esRecepcion, loTrabaja, tiposPara } from './recepcion';

// «¿Qué ha cotizado Ecofor?», «¿cuál es el teléfono de Rudel?». La lista de
// Clientes con su historia corta: lo cotizado, lo ganado y lo perdido. Es
// de quien vende (SECTION_ROLES.clients). Recepción también busca clientes
// para levantar un requerimiento (mapa 23) y, desde el 04-11 (doc 20 §13),
// para saber en qué va su pedido: le llega sin el total ni el enlace. Un
// cliente particular, completo y con la marca `trabaja` (doc 21). Desde el
// doc 22 §9, lo mismo para cualquier cargo con un tipo de cliente apagado.
//
// Busca como el buscador de la casa (utils/searchMatch de la app, Felipe
// 21-07-2026): sin tildes ni mayúsculas y por palabras en cualquier orden.
// Y varios clientes de una vez (04-11-2026: una pregunta buscó 24 clientes,
// uno por uno, y fue la más cara del día).

const GANADAS = new Set([QuotationStatus.ACEPTADA, QuotationStatus.REALIZADA]);

const MAX = 10;
const MAX_TEXTOS = 15;
const MAX_POR_TEXTO = 5;

/** true si TODAS las palabras buscadas están, sin tildes y en cualquier
 *  orden, en el nombre o el contacto (el criterio de `matchesSearch`).
 *  Exportada para probarla sin base. */
export const calzaCliente = (buscado: string, c: FilaDeCliente): boolean => {
  const palabras = normal(buscado).split(/\s+/).filter(Boolean);
  const donde = normal([c.name, c.contact_person].filter(Boolean).join(' '));
  return palabras.length > 0 && palabras.every((p) => donde.includes(p));
};

/** Un cliente con su historia corta, como lo ve quien pregunta: lo
 *  cotizado, lo ganado, lo perdido y sus últimas cotizaciones (sin el total
 *  ni el enlace si su cargo no trabaja el tipo del cliente). La usa también
 *  la ficha del cliente abierto (`conversacion/cliente-abierto.ts`). */
export const fichaDeCliente = (
  c: FilaDeCliente,
  cotizaciones: CotizacionDeCliente[],
  rol: UserRole,
  ultimas = 6,
  // Si el cargo trabaja el tipo del cliente (doc 22 §9; `loTrabaja`): null
  // si trabaja todos. Sin saberlo, recepción no.
  trabaja: boolean | null = esRecepcion(rol) ? false : null,
) => {
  const sinPlata = trabaja === false;
  const suyas = cotizaciones.filter((q) => q.client_id === c.id);
  return {
    ...(trabaja === true ? { trabaja: true as const } : {}),
    // El id, para crear un evento a este cliente (fase 2).
    id: c.id,
    nombre: c.name,
    tipo: c.client_type,
    contacto: c.contact_person,
    telefono: c.phone,
    correo: c.email,
    cotizaciones: suyas.length,
    ganadas: suyas.filter((q) => GANADAS.has(q.quotation_status)).length,
    perdidas: suyas.filter(
      (q) => q.quotation_status === QuotationStatus.RECHAZADA,
    ).length,
    ultimas: suyas.slice(0, ultimas).map((q) => ({
      numero: q.quotation_number,
      ...(sinPlata ? {} : { enlace: enlaceDe(q, rol, !sinPlata) }),
      estado: estadoDe(q.quotation_status),
      evento: q.event_type,
      fecha: conDia(diaDelEvento(q.event_date)),
      ...(sinPlata ? {} : { total: pesos(q.total_amount) }),
    })),
  };
};

export const buscarClientes: Herramienta = {
  nombre: 'buscar_clientes',
  descripcion:
    'Busca clientes por su nombre o su contacto (sin importar tildes ni el orden de las palabras): ' +
    'tipo, contacto, teléfono y correo, cuántas cotizaciones tienen (ganadas y perdidas) y las ' +
    'últimas seis con su enlace. Para varios clientes, manda TODOS los nombres juntos en ' +
    '`textos`: es una sola búsqueda.',
  esquema: {
    type: 'object',
    properties: {
      texto: {
        type: 'string',
        description: 'Un solo cliente: parte de su nombre.',
      },
      textos: {
        type: 'array',
        items: { type: 'string' },
        maxItems: MAX_TEXTOS,
        description: `Varios clientes de una vez (hasta ${MAX_TEXTOS}): trae hasta ${MAX_POR_TEXTO} de cada uno.`,
      },
    },
  },
  cargos: RECEPTION_AND_UP,
  permiso: ['requerimientos', 'cotizaciones', 'clientes'],
  async ejecutar(entrada, ctx) {
    const pedidos = (
      Array.isArray(entrada.textos) ? entrada.textos : [entrada.texto]
    )
      .map((t) => texto(t, 80))
      .filter((t): t is string => Boolean(t && t.length >= 2))
      .slice(0, MAX_TEXTOS);
    if (pedidos.length === 0) {
      throw new ErrorDeHerramienta(
        'Falta el nombre (dos letras por lo menos).',
      );
    }
    const empresa = ctx.usuario.company_id;
    const todos = await ctx.repositorio.clientesDeLaEmpresa(empresa);
    const max = pedidos.length === 1 ? MAX : MAX_POR_TEXTO;
    const hallados = pedidos.map((t) => ({
      texto: t,
      clientes: todos.filter((c) => calzaCliente(t, c)).slice(0, max),
    }));
    const ids = [
      ...new Set(hallados.flatMap((h) => h.clientes.map((c) => c.id))),
    ];
    const cotizaciones = await ctx.repositorio.cotizacionesDeClientes(
      empresa,
      ids,
    );
    const tipos = await tiposPara(ctx);
    const ficha = (c: FilaDeCliente) =>
      fichaDeCliente(
        c,
        cotizaciones,
        ctx.usuario.role,
        undefined,
        loTrabaja(tipos, c.client_type),
      );
    if (pedidos.length === 1) {
      return {
        encontrados: hallados[0].clientes.length,
        clientes: hallados[0].clientes.map(ficha),
      };
    }
    return {
      busquedas: hallados.map((h) => ({
        texto: h.texto,
        encontrados: h.clientes.length,
        clientes: h.clientes.map(ficha),
      })),
    };
  },
};
