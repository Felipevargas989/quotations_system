// LA FORMA DE CADA COMIDA, REVISADA CON CÓDIGO (Felipe, 17-10-2026: "no
// tiene sentido: dos puntos de hidratación, dos principales, sin postre y
// sin guarnición… ¿por qué pasó esto?").
//
// La regla vive en REGLAS_DE_ARMADO.md («La forma de cada comida»); acá se
// mira si una caja la cumple, con las secciones del cotizador. No es un
// error que impida guardar —un pedido puede querer dos principales—: es un
// AVISO. La IA lo recibe una vez para corregir o explicar, y lo que quede va
// a la nota para que el equipo lo vea.

import { type CategoriaDelCatalogo, seccionDe } from './catalogo';

export type TipoDeComida = 'comida' | 'desayuno' | 'coctel' | null;

const normal = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Qué forma se le pide a una categoría, según sus secciones. */
export function tipoDeComida(cat: CategoriaDelCatalogo): TipoDeComida {
  const secciones = cat.secciones.map((s) => normal(s.nombre));
  const tiene = (parte: string) => secciones.some((n) => n.includes(parte));
  if (tiene('principal') && tiene('postre')) return 'comida';
  if (tiene('bocado')) return 'coctel';
  if (
    /desayuno|once/.test(normal(cat.nombre)) &&
    tiene('salad') &&
    tiene('dulce')
  ) {
    return 'desayuno';
  }
  return null;
}

/** Los avisos de una caja ya armada (con su sección fija). */
export function avisosDeForma(
  cat: CategoriaDelCatalogo,
  codigos: string[],
  donde: string,
): string[] {
  const tipo = tipoDeComida(cat);
  if (!tipo) return [];
  const cuantos = (parte: string) =>
    codigos.filter((c) => {
      const s = seccionDe(cat, Number(c));
      return s !== null && normal(s).includes(parte);
    }).length;

  const avisos: string[] = [];
  if (tipo === 'comida') {
    const fondos = cuantos('principal') + cuantos('unico');
    const guarniciones = cuantos('guarnici');
    const postres = cuantos('postre');
    const bebestibles = cuantos('bebestible');
    if (fondos === 0)
      avisos.push(`${donde}: no trae principal ni plato único.`);
    if (fondos > 1) {
      avisos.push(`${donde}: trae ${fondos} principales (la casa sirve uno).`);
    }
    if (
      cuantos('principal') === 1 &&
      cuantos('unico') === 0 &&
      guarniciones === 0
    ) {
      avisos.push(`${donde}: el principal va sin guarnición.`);
    }
    if (guarniciones > 1)
      avisos.push(`${donde}: trae ${guarniciones} guarniciones.`);
    if (postres === 0) avisos.push(`${donde}: no trae postre.`);
    if (postres > 1) avisos.push(`${donde}: trae ${postres} postres.`);
    if (bebestibles > 1) {
      avisos.push(
        `${donde}: trae ${bebestibles} bebestibles (la casa pone uno).`,
      );
    }
  } else if (tipo === 'desayuno') {
    if (cuantos('salad') === 0) avisos.push(`${donde}: no trae nada salado.`);
    if (cuantos('dulce') === 0) avisos.push(`${donde}: no trae nada dulce.`);
  } else if (cuantos('bocado') === 0) {
    avisos.push(`${donde}: no trae bocados.`);
  }
  return avisos;
}
