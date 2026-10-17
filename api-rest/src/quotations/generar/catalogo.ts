// EL CATÁLOGO COMO LO LEE LA IA (doc 16, sección 6).
//
// La IA ve cada producto con su id, su nivel y su precio de hoy: el precio
// es una variable para elegir ("cena económica, mediana o cara"), no un
// tope (Felipe, 17-10). Lo que nunca hace es escribir un precio: elige por
// id, y el precio lo pone Eventia desde este mismo catálogo.

export type ItemDeMenu = {
  id: number;
  nombre: string;
  precio: number;
  cantidad: number;
};

export type MenuDelCatalogo = {
  id: number;
  nombre: string;
  categoria: string;
  /** El grupo del menú en su categoría ("Nivel 1", "Básicos", "Otros"). */
  nivel: string;
  ordenNivel: number;
  items: ItemDeMenu[];
};

export type Servicio = { id: number; nombre: string; precio: number };

export type CategoriaDelCatalogo = {
  id: number;
  nombre: string;
  orden: number;
  /** Servicios sueltos que el cotizador ofrece en esta categoría. */
  sueltos: number[];
  /** La sección fija: entra sola en toda caja de la categoría. */
  seccionFija: number[];
  /** Las demás secciones, en el orden del cotizador (Entradas,
   *  Principales, Guarniciones, Postres…), con sus servicios. La IA las
   *  necesita para saber qué plato es qué (Felipe, 17-10: "dos principales
   *  sin postre y sin guarnición… ¿por qué pasó esto?"). */
  secciones: Array<{ nombre: string; servicios: number[] }>;
};

export type Paquete = {
  id: number;
  nombre: string;
  grupo: string;
  ordenGrupo: number;
  menus: number[];
  sueltos: Array<{ id: number; cantidad: number }>;
  fijos: Array<{ id: number; cantidad: number }>;
};

export type Catalogo = {
  categorias: CategoriaDelCatalogo[];
  menus: MenuDelCatalogo[];
  /** Servicios variables activos de la empresa, por id. */
  servicios: Map<number, Servicio>;
  /** Servicios fijos activos de tipo «fijo», por id. */
  fijos: Map<number, Servicio>;
  paquetes: Paquete[];
};

export const pesos = (n: number): string =>
  `$${Math.round(n).toLocaleString('es-CL')}`;

const categoriaDe = (c: Catalogo, nombre: string) =>
  c.categorias.find((x) => x.nombre === nombre);

/** La sección de un servicio dentro de su categoría ("Principales"), o
 *  null si el cotizador no lo ordena en ninguna. */
export const seccionDe = (
  cat: CategoriaDelCatalogo,
  servicioId: number,
): string | null =>
  cat.secciones.find((s) => s.servicios.includes(servicioId))?.nombre ?? null;

/** Una lista de servicios agrupada por sección, en el orden del cotizador:
 *  "Entradas: Consomé; Principales: Lomo vetado; Postres: Tiramisú". */
const porSeccion = <T extends { id: number }>(
  cat: CategoriaDelCatalogo,
  cosas: T[],
  texto: (x: T) => string,
  separador: string,
): string[] => {
  const grupos = new Map<string, string[]>();
  for (const s of cat.secciones) grupos.set(s.nombre, []);
  for (const x of cosas) {
    const seccion = seccionDe(cat, x.id) ?? 'Otros';
    if (!grupos.has(seccion)) grupos.set(seccion, []);
    grupos.get(seccion)!.push(texto(x));
  }
  return [...grupos.entries()]
    .filter(([, lista]) => lista.length > 0)
    .map(([seccion, lista]) => `${seccion}: ${lista.join(separador)}`);
};

/** Lo que cuesta por persona una caja con este menú: sus ítems más los de
 *  la sección fija que el menú no traiga (igual que el cotizador). */
export const porPersonaDeMenu = (c: Catalogo, m: MenuDelCatalogo): number => {
  const propios = m.items.reduce((s, i) => s + i.precio * (i.cantidad || 1), 0);
  const faltantes = (categoriaDe(c, m.categoria)?.seccionFija ?? [])
    .filter((id) => !m.items.some((i) => i.id === id))
    .reduce((s, id) => s + (c.servicios.get(id)?.precio ?? 0), 0);
  return propios + faltantes;
};

/** Precio por persona de un paquete: sus menús y sus sueltos (sin fijos),
 *  la misma suma que muestra el selector de paquetes. */
export const porPersonaDePaquete = (c: Catalogo, p: Paquete): number =>
  p.menus.reduce((s, id) => {
    const m = c.menus.find((x) => x.id === id);
    return s + (m ? porPersonaDeMenu(c, m) : 0);
  }, 0) +
  p.sueltos.reduce(
    (s, x) => s + (c.servicios.get(x.id)?.precio ?? 0) * (x.cantidad || 1),
    0,
  );

/**
 * El catálogo en texto para la IA. `ofrecible` deja fuera lo que la casa
 * no ofrece (Valle del Sol: Sernatur va por contrato).
 */
export function catalogoComoTexto(
  c: Catalogo,
  ofrecible: (categoria: string) => boolean = () => true,
): string {
  const categorias = [...c.categorias]
    .filter((x) => ofrecible(x.nombre))
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
  const nombreDe = (id: number) => c.servicios.get(id)?.nombre ?? `#${id}`;
  const lineas: string[] = [];

  lineas.push(
    'CATEGORÍAS (cada caja usa uno de estos nombres, exacto):',
    categorias.map((x) => x.nombre).join(', '),
    '',
    'SECCIÓN FIJA (entra sola en toda caja de esa categoría: no la agregues tú):',
  );
  for (const cat of categorias) {
    if (cat.seccionFija.length === 0) continue;
    lineas.push(`- ${cat.nombre}: ${cat.seccionFija.map(nombreDe).join(', ')}`);
  }

  lineas.push(
    '',
    'MENÚS GUARDADOS, por categoría y nivel: la base de cada comida (id «nombre» $ por persona: platos por sección, cada uno con su id para adaptarlo):',
  );
  for (const cat of categorias) {
    const menus = c.menus.filter((m) => m.categoria === cat.nombre);
    if (menus.length === 0) continue;
    lineas.push(`[${cat.nombre}]`);
    const niveles = [...new Set(menus.map((m) => m.nivel))].sort(
      (a, b) =>
        (menus.find((m) => m.nivel === a)?.ordenNivel ?? 0) -
        (menus.find((m) => m.nivel === b)?.ordenNivel ?? 0),
    );
    for (const nivel of niveles) {
      lineas.push(`  ${nivel}:`);
      for (const m of menus
        .filter((x) => x.nivel === nivel)
        .sort(
          (a, b) =>
            porPersonaDeMenu(c, a) - porPersonaDeMenu(c, b) || a.id - b.id,
        )) {
        const platos = porSeccion(
          cat,
          m.items.filter((i) => !cat.seccionFija.includes(i.id)),
          (i) =>
            `${i.id} ${i.nombre}${i.cantidad > 1 ? ` x${i.cantidad}` : ''}`,
          ', ',
        ).join('; ');
        lineas.push(
          `    ${m.id} «${m.nombre}» ${pesos(porPersonaDeMenu(c, m))}: ${platos}`,
        );
      }
    }
  }

  lineas.push(
    '',
    'PAQUETES DE EVENTO, por grupo: la base del evento. Para usar uno, pon sus menús, sueltos y fijos en tus cajas, cada uno en su día (en los de noches, los menús vienen día por día); si no encaja del todo, adáptalo.',
  );
  const grupos = [...new Set(c.paquetes.map((p) => p.grupo))].sort(
    (a, b) =>
      (c.paquetes.find((p) => p.grupo === a)?.ordenGrupo ?? 0) -
      (c.paquetes.find((p) => p.grupo === b)?.ordenGrupo ?? 0),
  );
  for (const grupo of grupos) {
    lineas.push(`[${grupo}]`);
    for (const p of c.paquetes.filter((x) => x.grupo === grupo)) {
      const partes = [
        ...p.menus.map((id) => {
          const m = c.menus.find((x) => x.id === id);
          return m ? `${m.categoria} → menú ${id}` : `menú ${id}`;
        }),
        ...p.sueltos.map(
          (s) =>
            `suelto ${s.id} ${nombreDe(s.id)}${s.cantidad > 1 ? ` x${s.cantidad}` : ''}`,
        ),
        ...p.fijos.map((f) =>
          `fijo ${f.id} ${c.fijos.get(f.id)?.nombre ?? ''}${f.cantidad > 1 ? ` x${f.cantidad}` : ''}`.trim(),
        ),
      ];
      lineas.push(
        `  ${p.id} «${p.nombre}» ${pesos(porPersonaDePaquete(c, p))} por persona: ${partes.join('; ')}`,
      );
    }
  }

  lineas.push(
    '',
    'SERVICIOS SUELTOS, por categoría y sección (id «nombre» $): solo valen en su categoría.',
  );
  for (const cat of categorias) {
    const sueltos = cat.sueltos
      .filter((id) => !cat.seccionFija.includes(id))
      .map((id) => c.servicios.get(id))
      .filter((s): s is Servicio => Boolean(s));
    if (sueltos.length === 0) continue;
    lineas.push(`[${cat.nombre}]`);
    for (const linea of porSeccion(
      cat,
      sueltos,
      (s) => `${s.id} «${s.nombre}» ${pesos(s.precio)}`,
      ' · ',
    )) {
      lineas.push(`  ${linea}`);
    }
  }

  lineas.push('', 'SERVICIOS FIJOS (id «nombre» $):');
  lineas.push(
    [...c.fijos.values()]
      .map((f) => `${f.id} «${f.nombre}» ${pesos(f.precio)}`)
      .join(' · '),
  );

  return lineas.join('\n');
}
