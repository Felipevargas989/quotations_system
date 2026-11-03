import { SALES_AND_UP } from 'src/auth/roles.decorator';
import type { Catalogo } from 'src/quotations/generar/catalogo';
import { ErrorDeHerramienta, pesos, texto, type Herramienta } from './comun';

// «¿Cuánto vale la cena nivel 1?», «¿en qué menús va la leche asada?». El
// catálogo como lo usa el cotizador, el mismo que lee «Crear con IA»
// (`GenerarRepository.catalogo`): servicios por persona, menús guardados,
// fijos y paquetes, con el precio de hoy. Leerlo es de quien cotiza (mapa
// 23: "Catálogo, leer" es de vendedor para arriba).

const TIPOS = ['todo', 'servicios', 'menus', 'fijos', 'paquetes'] as const;
type Tipo = (typeof TIPOS)[number];

const MAX = 40;

/** Sin mayúsculas ni tildes: «Leche asada» calza con «leche ásada». */
export const normal = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Exportada para probarla sin base. */
export const buscarEn = (catalogo: Catalogo, buscado: string, tipo: Tipo) => {
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
        nombre: m.nombre,
        categoria: m.categoria,
        nivel: m.nivel,
        precio_por_persona: pesos(
          m.items.reduce((s, i) => s + i.precio * (i.cantidad || 1), 0),
        ),
        servicios: m.items.map((i) =>
          i.cantidad > 1 ? `${i.nombre} (×${i.cantidad})` : i.nombre,
        ),
      });
    }
  }
  if (quiere('fijos')) {
    for (const f of catalogo.fijos.values()) {
      if (!calza(f.nombre)) continue;
      hallazgos.push({
        tipo: 'fijo',
        nombre: f.nombre,
        precio: pesos(f.precio),
      });
    }
  }
  if (quiere('paquetes')) {
    for (const p of catalogo.paquetes) {
      if (!calza(p.nombre)) continue;
      hallazgos.push({ tipo: 'paquete', nombre: p.nombre, grupo: p.grupo });
    }
  }
  return {
    encontrados: hallazgos.length,
    mostrados: Math.min(MAX, hallazgos.length),
    resultados: hallazgos.slice(0, MAX),
  };
};

export const buscarEnCatalogo: Herramienta = {
  nombre: 'buscar_en_catalogo',
  descripcion:
    'Busca en el catálogo de hoy por nombre (sin importar tildes): servicios por persona con ' +
    'su categoría y precio, menús guardados con lo que traen y su valor por persona (también ' +
    'si el texto está en uno de sus platos), fijos con su precio y paquetes.',
  esquema: {
    type: 'object',
    properties: {
      texto: {
        type: 'string',
        description: 'Lo que se busca: «leche asada», «cena nivel 1»…',
      },
      tipo: {
        type: 'string',
        enum: [...TIPOS],
        description: 'Para acotar. Si no se dice: todo.',
      },
    },
    required: ['texto'],
  },
  cargos: SALES_AND_UP,
  async ejecutar(entrada, ctx) {
    const buscado = texto(entrada.texto, 80);
    if (!buscado || buscado.length < 2) {
      throw new ErrorDeHerramienta(
        'Falta qué buscar (dos letras por lo menos).',
      );
    }
    const tipo = TIPOS.includes(entrada.tipo as Tipo)
      ? (entrada.tipo as Tipo)
      : 'todo';
    const catalogo = await ctx.catalogo.catalogo(ctx.usuario.company_id);
    return buscarEn(catalogo, buscado, tipo);
  },
};
