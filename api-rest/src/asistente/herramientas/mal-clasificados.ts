import { SALES_AND_UP } from 'src/auth/roles.decorator';
import { esDeLosParticulares } from 'src/clients/alcance-de-recepcion';
import type { FilaDeCliente } from '../asistente.repository';
import { normal } from './buscar-en-catalogo';
import {
  ErrorDeHerramienta,
  texto,
  type ContextoDeHerramienta,
  type Herramienta,
} from './comun';

// LOS CLIENTES MAL CLASIFICADOS (doc 21 §6; Felipe, 04-11-2026: "Belia
// también podría como ir levantando esas cosas y como ir avisando, y esto
// está mal clasificado, revisa bien").
//
// Un cliente de un tipo particular con nombre de institución: lo que pasaba
// con los seis de ese día ("el club de amigas debe ser o un gremio o adulto
// mayor, el club deportivo es un gremio, Fundación INDAE ... es una empresa
// privada, y los colegios son universidades o colegios"). Y el paseo de
// curso: "no es el colegio que está cotizando, sino que son particulares
// para sus hijos". Con nombre de colegio y correo personal, el cliente es
// el apoderado (Liceo Yungay → Patricia Bravo, 04-11).
//
// BelIA solo avisa y propone; el cambio lo aprueba la persona en la
// tarjeta (`proponer_cambio_de_cliente`). Recepción no cambia tipos.

type Categoria = {
  /** Lo que es, para el motivo: «un colegio o una universidad». */
  que: string;
  /** Palabras del nombre (sin tildes ni mayúsculas, palabra entera). */
  frases: readonly string[];
  /** El tipo de la empresa que le calza (su nombre, sin tildes). */
  tipo: RegExp;
  colegio?: true;
};

// En orden: la primera que calza manda («club adulto mayor» es adulto
// mayor antes que gremio).
const CATEGORIAS: readonly Categoria[] = [
  {
    que: 'un club de adulto mayor',
    frases: [
      'adulto mayor',
      'adultos mayores',
      'tercera edad',
      'personas mayores',
      'jubilados',
      'jubiladas',
    ],
    tipo: /adulto mayor|tercera edad/,
  },
  {
    que: 'un colegio o una universidad',
    frases: [
      'colegio',
      'liceo',
      'escuela',
      'jardin infantil',
      'sala cuna',
      'universidad',
      'instituto',
      'preuniversitario',
    ],
    tipo: /colegio|universidad|educacion/,
    colegio: true,
  },
  {
    que: 'una institución pública',
    frases: [
      'municipalidad',
      'municipio',
      'gobernacion',
      'delegacion presidencial',
      'seremi',
      'ministerio',
      'servicio de salud',
      'hospital',
      'cesfam',
      'consultorio',
      'carabineros',
      'ejercito',
      'armada',
      'fuerza aerea',
      'pdi',
      'gendarmeria',
      'poder judicial',
      'juzgado',
      'fiscalia',
      'junji',
      'daem',
      'departamento de educacion',
      'bomberos',
    ],
    tipo: /public|estado|gobierno/,
  },
  {
    que: 'una iglesia',
    frases: ['iglesia', 'parroquia', 'congregacion', 'capilla', 'pastoral'],
    tipo: /iglesia|religios/,
  },
  {
    que: 'un gremio o una agrupación',
    frases: [
      'club',
      'agrupacion',
      'asociacion',
      'sindicato',
      'junta de vecinos',
      'gremio',
      'cooperativa',
      'comite',
      'federacion',
      'centro de padres',
      'union comunal',
    ],
    // Sin «club»: el tipo «Club Adulto Mayor» también lo dice.
    tipo: /gremio|agrupacion|asociacion/,
  },
  {
    que: 'una empresa',
    frases: [
      'spa',
      'sa',
      'ltda',
      'limitada',
      'eirl',
      'empresa',
      'empresas',
      'fundacion',
      'corporacion',
      'constructora',
      'inversiones',
      'comercial',
      'transportes',
      'ingenieria',
      'consultora',
      'holding',
      'sociedad',
      'industrial',
      'minera',
      'forestal',
      'agricola',
      'clinica',
      'laboratorio',
    ],
    tipo: /^empresas?$|privad/,
  },
  {
    que: 'una agencia de turismo',
    frases: ['turismo', 'tour', 'tours', 'viajes'],
    tipo: /tour|turismo|viaje/,
  },
];

const CORREO_PERSONAL =
  /@(gmail|hotmail|outlook|live|yahoo|icloud|me|msn)\.[a-z.]+$/i;

/** Las palabras del nombre, separadas por un espacio y con uno a cada
 *  lado: «S.A.» queda « sa », «Club Deportivo» « club deportivo ». */
const palabrasDe = (nombre: string): string =>
  ` ${normal(nombre)
    .replace(/\./g, '')
    .split(/[^a-z0-9ñ]+/)
    .filter(Boolean)
    .join(' ')} `;

export type AvisoDeClasificacion = {
  id: string;
  nombre: string;
  tipo: string | null;
  motivo: string;
  /** Lo que BelIA propone: el tipo que le calza o, si es un apoderado, el
   *  nombre de la persona. Vacío si la empresa no tiene un tipo que calce. */
  sugerencia: { tipo?: string; nombre?: string };
  /** El apoderado: si en verdad cotiza el colegio, este es su tipo. */
  o_bien?: { tipo: string };
};

/** ¿Parece mal clasificado? Solo los de un tipo particular con nombre de
 *  institución; los demás tipos no se revisan. Exportada para probarla. */
export const revisarClasificacion = (
  c: FilaDeCliente,
  particulares: ReadonlySet<string>,
  tiposDeLaEmpresa: readonly string[],
): AvisoDeClasificacion | null => {
  if (!esDeLosParticulares(particulares, c.client_type)) return null;
  const palabras = palabrasDe(c.name);
  const cat = CATEGORIAS.find((k) =>
    k.frases.some((f) => palabras.includes(` ${f} `)),
  );
  if (!cat) return null;
  const tipo = tiposDeLaEmpresa.find(
    (t) => cat.tipo.test(normal(t)) && !esDeLosParticulares(particulares, t),
  );
  const contacto = c.contact_person?.trim();
  const apoderado =
    cat.colegio &&
    c.email &&
    CORREO_PERSONAL.test(c.email.trim()) &&
    contacto &&
    normal(contacto) !== normal(c.name);
  const base = { id: c.id, nombre: c.name, tipo: c.client_type };
  if (apoderado) {
    return {
      ...base,
      motivo: `Está en «${c.client_type}» con nombre de colegio y correo personal: si es un apoderado que cotiza un paseo de curso, el cliente es la persona (${contacto}), no el colegio.`,
      sugerencia: { nombre: contacto },
      ...(tipo ? { o_bien: { tipo } } : {}),
    };
  }
  return {
    ...base,
    motivo: `Está en «${c.client_type}», pero el nombre es de ${cat.que}${tipo ? '' : ': revisa su tipo'}.`,
    sugerencia: tipo ? { tipo } : {},
  };
};

/** Los clientes que conviene revisar, de quien vende para arriba: los lee
 *  con la empresa de la sesión. Sin la pieza de los particulares, ninguno. */
export const clientesQueRevisar = async (
  ctx: Pick<ContextoDeHerramienta, 'usuario' | 'repositorio' | 'alcance'>,
): Promise<AvisoDeClasificacion[]> => {
  if (!ctx.alcance) return [];
  const empresa = ctx.usuario.company_id;
  const [clientes, tipos, particulares] = await Promise.all([
    ctx.repositorio.clientesDeLaEmpresa(empresa),
    ctx.repositorio.tiposDeCliente(empresa),
    ctx.alcance.particulares(empresa),
  ]);
  return clientes
    .map((c) => revisarClasificacion(c, particulares, tipos))
    .filter((a): a is AvisoDeClasificacion => a !== null);
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La tarjeta para corregir un cliente: su tipo o su nombre. No cambia
 *  nada: la persona lo aprueba con «Sí, cambiar». */
export const proponerCambioDeCliente: Herramienta = {
  nombre: 'proponer_cambio_de_cliente',
  descripcion:
    'Propone corregir un cliente mal clasificado: su tipo (uno de los tipos de cliente de la ' +
    'empresa, con su nombre exacto) o su nombre (el apoderado que cotiza un paseo de curso: el ' +
    'cliente es la persona, no el colegio). NO cambia nada: la persona lo aprueba en la ' +
    'tarjeta. El id sale de buscar_clientes, de avisos_de_hoy o del cliente abierto.',
  esquema: {
    type: 'object',
    properties: {
      cliente_id: { type: 'string', description: 'El id del cliente.' },
      tipo: {
        type: 'string',
        description: 'El tipo nuevo, como se llama en la empresa.',
      },
      nombre: { type: 'string', description: 'El nombre nuevo.' },
      motivo: {
        type: 'string',
        description:
          'Por qué, en una línea: lo que se ve en el nombre, el correo o sus cotizaciones.',
      },
    },
    required: ['cliente_id', 'motivo'],
  },
  // Cambiar un cliente es de quien vende (PATCH /clients/:id, mapa 23).
  // Recepción no cambia tipos (doc 21 §6).
  cargos: SALES_AND_UP,
  dentroDe: ['clientes'],
  async ejecutar(entrada, ctx) {
    const id = texto(entrada.cliente_id, 40);
    if (!id || !UUID.test(id)) {
      throw new ErrorDeHerramienta(
        'El cliente_id no es un id de Eventia: búscalo con buscar_clientes.',
      );
    }
    const tipo = texto(entrada.tipo, 80);
    const nombre = texto(entrada.nombre, 160);
    const motivo = texto(entrada.motivo, 300);
    if (!tipo && !nombre) {
      throw new ErrorDeHerramienta(
        'Falta qué cambiar: el `tipo` o el `nombre`.',
      );
    }
    if (!motivo)
      throw new ErrorDeHerramienta('Falta el `motivo`, en una línea.');
    const tarjeta = await ctx.propuestas.proponerCambioDeCliente(ctx.usuario, {
      cliente_id: id,
      tipo,
      nombre,
      motivo,
    });
    ctx.tarjetas.push(tarjeta);
    return {
      propuesta: 'lista',
      cliente: tarjeta.cliente,
      avisos: tarjeta.avisos.length ? tarjeta.avisos : undefined,
      importante:
        'La persona ve la tarjeta con «Sí, cambiar». Todavía NO está cambiado: no digas que ya se hizo. Dile en una línea qué cambia y que lo apruebe en la tarjeta.',
    };
  },
};
