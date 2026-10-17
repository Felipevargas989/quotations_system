// DE LO QUE ELIGIÓ LA IA A LA FOTO DEL COTIZADOR (doc 16, sección 6).
//
// La IA devuelve ids; acá se revisa cada uno contra el catálogo DE ESTA
// EMPRESA y se arma la misma foto que guarda el cotizador
// (`buildItemsSnapshot`): nombre y precio salen del catálogo, nunca de la
// IA. Si algo no calza (un menú de otra categoría, un servicio que no se
// ofrece en esa comida, un día fuera del evento), no se arma nada: vuelve
// la lista de errores para que la IA corrija.

import type { Catalogo } from './catalogo';
import { diasEntre, esFechaValida, MAX_DIAS } from './fechas';
import { avisosDeForma } from './forma-de-comida';
import type { PlanDeLaIA } from './tipos';

export type EventoParaArmar = {
  /** AAAA-MM-DD */
  fecha: string;
  /** El total, adultos y niños (people_count). */
  personas: number;
  /** Los niños dentro del total (children_count). */
  ninos: number;
  /** Solo los tour operadores llevan el 15% (doc 16, regla 6). */
  esTourOperador: boolean;
};

type ItemDeFoto = {
  codigo: string;
  nombre: string;
  precio: number;
  categoria: string;
  quantity: number;
};

export type CajaDeFoto = {
  category: string;
  category_id: number;
  day: number;
  audience: 'adultos' | 'ninos';
  people: number;
  items: ItemDeFoto[];
};

export type FijoDeFoto = {
  codigo: string;
  nombre: string;
  day: number;
  precio: number;
  categoria: string;
  quantity: number;
  tipo_calculo: 'fijo';
  min_precio: number;
  max_precio: number;
  precio_por_persona: number;
};

export type FotoDeServicios = {
  variable_services: CajaDeFoto[];
  fixed_services: FijoDeFoto[];
};

export type ResultadoDelArmado =
  | {
      ok: true;
      items: FotoDeServicios;
      /** null = evento de un día. */
      ultimoDia: string | null;
      descuentoPorcentaje: number;
      dias: number;
      /** La forma de las comidas (forma-de-comida.ts): no impiden guardar;
       *  la IA los recibe una vez y lo que quede va a la nota. */
      avisos: string[];
    }
  | { ok: false; errores: string[] };

const entero = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v);

/** La cantidad de un suelto es POR PERSONA (la caja ya se multiplica por
 *  sus personas). En el catálogo nunca pasa de 6 (medido el 17-10); 10 es
 *  el tope. La primera prueba del laboratorio (17-10) puso 80 platos por
 *  persona: la cotización de 80 personas sumó $450 millones. */
export const MAX_POR_PERSONA = 10;

export function armarFoto(
  plan: PlanDeLaIA,
  catalogo: Catalogo,
  evento: EventoParaArmar,
  ofrecible: (categoria: string) => boolean = () => true,
): ResultadoDelArmado {
  const errores: string[] = [];

  // El rango del evento.
  const fin = (plan.ultimo_dia ?? '').trim();
  let dias = 1;
  let ultimoDia: string | null = null;
  if (fin) {
    if (!esFechaValida(fin)) {
      errores.push(`ultimo_dia «${fin}» no es una fecha AAAA-MM-DD.`);
    } else {
      const extra = diasEntre(evento.fecha, fin);
      if (extra < 0) {
        errores.push(
          `ultimo_dia ${fin} es anterior al primer día (${evento.fecha}).`,
        );
      } else if (extra + 1 > MAX_DIAS) {
        errores.push(`el evento no puede durar más de ${MAX_DIAS} días.`);
      } else if (extra > 0) {
        dias = extra + 1;
        ultimoDia = fin;
      }
    }
  }

  const adultos = Math.max(0, evento.personas - evento.ninos);
  const cajas: CajaDeFoto[] = [];
  const avisos: string[] = [];
  if (!plan.cajas?.length) errores.push('la cotización no trae ninguna caja.');

  (plan.cajas ?? []).forEach((caja, i) => {
    const donde = `caja ${i + 1} (día ${caja.dia}, ${caja.categoria})`;
    const cat = catalogo.categorias.find((c) => c.nombre === caja.categoria);
    if (!cat) {
      errores.push(`${donde}: la categoría «${caja.categoria}» no existe.`);
      return;
    }
    if (!ofrecible(cat.nombre)) {
      errores.push(`${donde}: la categoría «${cat.nombre}» no se ofrece.`);
      return;
    }
    if (!entero(caja.dia) || caja.dia < 1 || caja.dia > dias) {
      errores.push(`${donde}: el día debe ir de 1 a ${dias}.`);
    }
    const tope = caja.audiencia === 'ninos' ? evento.ninos : adultos;
    if (caja.audiencia === 'ninos' && evento.ninos === 0) {
      errores.push(`${donde}: el evento no tiene niños.`);
    } else if (
      !entero(caja.personas) ||
      caja.personas < 1 ||
      caja.personas > tope
    ) {
      errores.push(
        `${donde}: las personas deben ir de 1 a ${tope} (${caja.audiencia === 'ninos' ? 'niños' : 'adultos'} del evento).`,
      );
    }

    const items: ItemDeFoto[] = [];
    const agregar = (id: number, cantidad: number) => {
      if (items.some((x) => x.codigo === String(id))) return;
      const s = catalogo.servicios.get(id);
      if (!s) return;
      items.push({
        codigo: String(id),
        nombre: s.nombre,
        precio: s.precio,
        categoria: cat.nombre,
        quantity: cantidad,
      });
    };

    if (caja.menu_id > 0) {
      const menu = catalogo.menus.find((m) => m.id === caja.menu_id);
      if (!menu) {
        errores.push(`${donde}: el menú ${caja.menu_id} no existe.`);
        return;
      }
      if (menu.categoria !== cat.nombre) {
        errores.push(
          `${donde}: el menú ${menu.id} es de «${menu.categoria}», no de «${cat.nombre}».`,
        );
        return;
      }
      for (const it of menu.items) {
        if (!catalogo.servicios.has(it.id)) {
          errores.push(
            `${donde}: el menú ${menu.id} trae «${it.nombre}», que ya no está activo; elige otro menú.`,
          );
          return;
        }
        agregar(it.id, it.cantidad || 1);
      }
    } else if (!caja.servicios?.length) {
      errores.push(`${donde}: sin menú_id ni servicios.`);
      return;
    }

    for (const s of caja.servicios ?? []) {
      if (!cat.sueltos.includes(s.id) && !cat.seccionFija.includes(s.id)) {
        errores.push(
          `${donde}: el servicio ${s.id} no se ofrece en «${cat.nombre}».`,
        );
        continue;
      }
      if (!catalogo.servicios.has(s.id)) {
        errores.push(`${donde}: el servicio ${s.id} no está activo.`);
        continue;
      }
      if (!entero(s.cantidad) || s.cantidad < 1) {
        errores.push(
          `${donde}: la cantidad del servicio ${s.id} debe ser 1 o más.`,
        );
        continue;
      }
      if (s.cantidad > MAX_POR_PERSONA) {
        errores.push(
          `${donde}: la cantidad del servicio ${s.id} es POR PERSONA (casi siempre 1); ${s.cantidad} no puede ser. La caja ya se multiplica por sus ${caja.personas} personas.`,
        );
        continue;
      }
      agregar(s.id, s.cantidad);
    }

    // La sección fija entra sola, como en el cotizador (mapa 01, regla 10).
    for (const id of cat.seccionFija) agregar(id, 1);

    avisos.push(
      ...avisosDeForma(
        cat,
        items.map((x) => x.codigo),
        donde,
      ),
    );

    cajas.push({
      category: cat.nombre,
      category_id: cat.id,
      day: caja.dia,
      audience: caja.audiencia === 'ninos' ? 'ninos' : 'adultos',
      people: caja.personas,
      items,
    });
  });

  const fijos: FijoDeFoto[] = [];
  const ordenDeFijos = [...catalogo.fijos.keys()];
  (plan.fijos ?? []).forEach((f, i) => {
    const donde = `fijo ${i + 1} (id ${f.id})`;
    const fijo = catalogo.fijos.get(f.id);
    if (!fijo) {
      errores.push(`${donde}: no es un servicio fijo del catálogo.`);
      return;
    }
    if (!entero(f.dia) || f.dia < 0 || f.dia > dias) {
      errores.push(`${donde}: el día debe ir de 0 (todo el evento) a ${dias}.`);
      return;
    }
    if (!entero(f.cantidad) || f.cantidad < 1) {
      errores.push(`${donde}: la cantidad debe ser 1 o más.`);
      return;
    }
    fijos.push({
      codigo: String(fijo.id),
      nombre: fijo.nombre,
      day: f.dia,
      precio: fijo.precio,
      categoria: 'General',
      quantity: f.cantidad,
      tipo_calculo: 'fijo',
      min_precio: 0,
      max_precio: 0,
      precio_por_persona: 0,
    });
  });
  fijos.sort(
    (a, b) =>
      ordenDeFijos.indexOf(Number(a.codigo)) -
        ordenDeFijos.indexOf(Number(b.codigo)) || a.day - b.day,
  );

  const descuento = plan.descuento_porcentaje ?? 0;
  if (descuento !== 0 && descuento !== 15) {
    errores.push('el descuento solo puede ser 0 o 15.');
  } else if (descuento === 15 && !evento.esTourOperador) {
    errores.push('el 15% de descuento es solo para tour operadores.');
  }

  if (errores.length > 0) return { ok: false, errores };

  // Las cajas en el orden de los días; dentro del día, el orden de la IA.
  const ordenadas = cajas
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.day - b.c.day || a.i - b.i)
    .map((x) => x.c);

  return {
    ok: true,
    items: { variable_services: ordenadas, fixed_services: fijos },
    ultimoDia,
    descuentoPorcentaje: descuento,
    dias,
    avisos,
  };
}
