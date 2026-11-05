import { RECEPTION_AND_UP } from 'src/auth/roles.decorator';
import {
  porPersonaDeMenu,
  type Catalogo,
} from 'src/quotations/generar/catalogo';
import { ErrorDeHerramienta, pesos, texto, type Herramienta } from './comun';

// «¿Cuánto vale la cena nivel 1?», «¿en qué menús va la leche asada?». El
// catálogo como lo usa el cotizador, el mismo que lee «Crear con IA»
// (`GenerarRepository.catalogo`): servicios por persona, menús guardados,
// fijos y paquetes, con el precio de hoy. Leerlo es de quien cotiza: desde
// el doc 21 también recepción, que cotiza a los particulares (lo ve en su
// cotizador). No es plata de un cliente: no pasa por su red.

const TIPOS = ['todo', 'servicios', 'menus', 'fijos', 'paquetes'] as const;
type Tipo = (typeof TIPOS)[number];

const MAX = 40;
const MAX_TEXTOS = 15;
const MAX_POR_TEXTO = 8;

/** Sin mayúsculas ni tildes: «Leche asada» calza con «leche ásada». */
export const normal = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Exportada para probarla sin base. */
export const buscarEn = (
  catalogo: Catalogo,
  buscado: string,
  tipo: Tipo,
  max = MAX,
) => {
  const q = normal(buscado);
  const calza = (s: string) => normal(s).includes(q);

  // De qué categoría (y sección) es cada servicio suelto.
  const dondeVa = new Map<number, { categoria: string; seccion?: string }>();
  for (const cat of catalogo.categorias) {
    for (const id of [...cat.sueltos, ...cat.seccionFija]) {
      if (!dondeVa.has(id)) dondeVa.set(id, { categoria: cat.nombre });
    }
    for (const s of cat.secciones) {
      for (const id of s.servicios) {
        dondeVa.set(id, { categoria: cat.nombre, seccion: s.nombre });
      }
    }
  }

  const hallazgos: unknown[] = [];
  const quiere = (t: Tipo) => tipo === 'todo' || tipo === t;

  if (quiere('servicios')) {
    for (const s of catalogo.servicios.values()) {
      if (!calza(s.nombre)) continue;
      hallazgos.push({
        tipo: 'servicio por persona',
        // El id, para proponer cambios (fase 2): la IA nunca escribe un
        // precio, elige por id (03-11: sin él, BelIA no pudo agregar la
        // leche asada a la 473 del laboratorio).
        id: s.id,
        nombre: s.nombre,
        ...dondeVa.get(s.id),
        precio_por_persona: pesos(s.precio),
      });
    }
  }
  if (quiere('menus')) {
    for (const m of catalogo.menus) {
      const enSusItems = m.items.filter((i) => calza(i.nombre));
      if (!calza(m.nombre) && enSusItems.length === 0) continue;
      hallazgos.push({
        tipo: 'menú guardado',
        id: m.id,
        nombre: m.nombre,
        categoria: m.categoria,
        nivel: m.nivel,
        // Con la sección fija que el menú no traiga, como la casilla que
        // arma el cotizador.
        precio_por_persona: pesos(porPersonaDeMenu(catalogo, m)),
        servicios: m.items.map(
          (i) =>
            `${i.nombre}${i.cantidad > 1 ? ` ×${i.cantidad}` : ''} (id ${i.id})`,
        ),
      });
    }
  }
  if (quiere('fijos')) {
    for (const f of catalogo.fijos.values()) {
      if (!calza(f.nombre)) continue;
      hallazgos.push({
        tipo: 'fijo',
        id: f.id,
        nombre: f.nombre,
        precio: pesos(f.precio),
      });
    }
  }
  if (quiere('paquetes')) {
    for (const p of catalogo.paquetes) {
      if (!calza(p.nombre)) continue;
      const nombreDe = (id: number) =>
        catalogo.servicios.get(id)?.nombre ?? `#${id}`;
      hallazgos.push({
        tipo: 'paquete',
        id: p.id,
        nombre: p.nombre,
        grupo: p.grupo,
        menus: p.menus.map((id) => {
          const m = catalogo.menus.find((x) => x.id === id);
          return m ? `${m.categoria} → menú ${id}` : `menú ${id}`;
        }),
        sueltos: p.sueltos.map(
          (x) =>
            `${nombreDe(x.id)}${x.cantidad > 1 ? ` ×${x.cantidad}` : ''} (id ${x.id})`,
        ),
        fijos: p.fijos.map(
          (x) =>
            `${catalogo.fijos.get(x.id)?.nombre ?? `#${x.id}`} (id ${x.id})`,
        ),
      });
    }
  }
  return {
    encontrados: hallazgos.length,
    mostrados: Math.min(max, hallazgos.length),
    resultados: hallazgos.slice(0, max),
  };
};

export const buscarEnCatalogo: Herramienta = {
  nombre: 'buscar_en_catalogo',
  descripcion:
    'Busca en el catálogo de hoy por nombre (sin importar tildes): servicios por persona con ' +
    'su categoría y precio, menús guardados con lo que traen y su valor por persona (también ' +
    'si el texto está en uno de sus platos), fijos con su precio y paquetes. Cada cosa trae su ' +
    'id: es el que va en una propuesta de cambio. Para armar un pedido o una minuta, manda ' +
    'TODOS los productos juntos en `textos`: es una sola búsqueda.',
  esquema: {
    type: 'object',
    properties: {
      texto: {
        type: 'string',
        description: 'Una sola cosa: «leche asada», «cena nivel 1»…',
      },
      textos: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 15,
        description:
          'Varias cosas de una vez (hasta 15): «once», «alojamiento», «almuerzo»… Trae hasta 8 resultados de cada una.',
      },
      tipo: {
        type: 'string',
        enum: [...TIPOS],
        description: 'Para acotar. Si no se dice: todo.',
      },
    },
  },
  cargos: RECEPTION_AND_UP,
  plataLibre: true,
  async ejecutar(entrada, ctx) {
    // Varias de una vez (Felipe, 03-11: una pregunta buscó diez veces, una
    // por producto, y costó el triple).
    const pedidos = (
      Array.isArray(entrada.textos) ? entrada.textos : [entrada.texto]
    )
      .map((t) => texto(t, 80))
      .filter((t): t is string => Boolean(t && t.length >= 2))
      .slice(0, MAX_TEXTOS);
    if (pedidos.length === 0) {
      throw new ErrorDeHerramienta(
        'Falta qué buscar (dos letras por lo menos).',
      );
    }
    const tipo = TIPOS.includes(entrada.tipo as Tipo)
      ? (entrada.tipo as Tipo)
      : 'todo';
    const catalogo = await ctx.catalogo.catalogo(ctx.usuario.company_id);
    if (pedidos.length === 1) return buscarEn(catalogo, pedidos[0], tipo);
    return {
      busquedas: pedidos.map((t) => ({
        texto: t,
        ...buscarEn(catalogo, t, tipo, MAX_POR_TEXTO),
      })),
    };
  },
};
