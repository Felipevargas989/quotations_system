import type {
  BloqueDelWord,
  ParrafoDelWord,
  TramoDelWord,
  TramoEditado,
} from "../../services/editorDelWord.service";

// LAS REGLAS DEL EDITOR DE WORD (decisión 78 del doc 17), sin React: cómo
// se dibuja un párrafo para escribir encima y cómo se lee de vuelta lo que
// quedó, pedazo por pedazo, con su negrita, cursiva y subrayado. Cada
// pedazo recuerda de qué corrida del Word salió (`data-r`), para que el
// motor conserve su letra y su color.

/** Lo que la IA dejó por completar: [COMPLETAR: qué falta]. */
export const PENDIENTE = /\[COMPLETAR[^\]]*\]/gi;

const escaparHtml = (t: string): string =>
  t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

type ComoSeVe = Pick<TramoDelWord, "b" | "i" | "u" | "pt">;

/** El formato como estilo de la página (también los «no», para que mande
 *  el más cercano al leer de vuelta). */
export const estiloDe = (f: ComoSeVe): string =>
  `font-weight:${f.b ? 700 : 400};font-style:${f.i ? "italic" : "normal"};text-decoration:${f.u ? "underline" : "none"}${f.pt ? `;font-size:${f.pt}pt` : ""}`;

const conSaltos = (t: string) => escaparHtml(t).replace(/\n/g, "<br>");

/** Lo pendiente, en amarillo. */
const conPendientes = (t: string) =>
  t
    .split(/(\[COMPLETAR[^\]]*\])/gi)
    .map((x, i) =>
      i % 2 === 1
        ? `<mark data-completar="" class="bg-yellow-200 rounded-sm">${conSaltos(x)}</mark>`
        : conSaltos(x),
    )
    .join("");

/** El párrafo para escribir encima. Si termina en salto de línea, lleva un
 *  `<br>` más: sin él el navegador no muestra la última línea vacía. */
export const htmlDelParrafo = (p: ParrafoDelWord): string => {
  const html = p.tramos
    .map(
      (t) =>
        `<span${t.r === undefined ? "" : ` data-r="${t.r}"`} style="${estiloDe(t)}">${conPendientes(t.t)}</span>`,
    )
    .join("");
  return p.tramos[p.tramos.length - 1]?.t.endsWith("\n") ? `${html}<br>` : html;
};

const peso = (v: string): boolean | undefined => {
  if (!v) return undefined;
  if (v === "bold" || v === "bolder") return true;
  if (v === "normal" || v === "lighter") return false;
  const n = Number(v);
  return Number.isFinite(n) ? n >= 600 : undefined;
};

const negrita = (el: HTMLElement): boolean | undefined =>
  peso(el.style.fontWeight) ??
  (el.tagName === "B" || el.tagName === "STRONG" ? true : undefined);

const cursiva = (el: HTMLElement): boolean | undefined => {
  const v = el.style.fontStyle;
  if (v) return v === "italic" || v === "oblique";
  return el.tagName === "I" || el.tagName === "EM" ? true : undefined;
};

const subrayado = (el: HTMLElement): boolean | undefined => {
  const v = el.style.textDecorationLine || el.style.textDecoration;
  if (v) return v.includes("underline");
  return el.tagName === "U" ? true : undefined;
};

type Marca = Omit<TramoEditado, "t">;

/** Cómo se ve un texto: manda lo más cercano, hasta el párrafo. */
const marcaDe = (nodo: Node, raiz: HTMLElement): Marca => {
  let r: number | undefined;
  let b: boolean | undefined;
  let i: boolean | undefined;
  let u: boolean | undefined;
  let el: HTMLElement | null =
    nodo instanceof HTMLElement ? nodo : nodo.parentElement;
  while (el) {
    if (r === undefined && el.dataset.r !== undefined) {
      const n = Number(el.dataset.r);
      if (Number.isInteger(n) && n >= 0) r = n;
    }
    b ??= negrita(el);
    i ??= cursiva(el);
    u ??= subrayado(el);
    if (el === raiz) break;
    el = el.parentElement;
  }
  return {
    ...(r === undefined ? {} : { r }),
    b: b ?? false,
    i: i ?? false,
    u: u ?? false,
  };
};

const mismaMarca = (a: Marca, b: Marca) =>
  a.r === b.r && a.b === b.b && a.i === b.i && a.u === b.u;

/** Lo último de adentro (el `<br>` final que pone el navegador). */
const ultimaHoja = (raiz: Node): Node | null => {
  let n = raiz.lastChild;
  while (n?.lastChild) n = n.lastChild;
  return n;
};

/** Lo escrito en un párrafo, en pedazos con su formato. */
export const tramosDelElemento = (raiz: HTMLElement): TramoEditado[] => {
  const tramos: TramoEditado[] = [];
  const agregar = (t: string, nodo: Node) => {
    const m = marcaDe(nodo, raiz);
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && mismaMarca(ultimo, m)) ultimo.t += t;
    else tramos.push({ ...m, t });
  };
  const recorrer = (n: Node) => {
    for (const h of Array.from(n.childNodes)) {
      if (h.nodeType === Node.TEXT_NODE) {
        const t = (h.nodeValue ?? "").replace(/[\u200b\ufeff]/g, "");
        if (t) agregar(t, h);
      } else if (h instanceof HTMLElement) {
        if (h.tagName === "BR") {
          agregar("\n", h);
          continue;
        }
        // Un Enter que se coló como bloque es un salto de línea.
        if ((h.tagName === "DIV" || h.tagName === "P") && tramos.length > 0) {
          agregar("\n", h);
        }
        recorrer(h);
      }
    }
  };
  recorrer(raiz);
  const ultimo = tramos[tramos.length - 1];
  if (ultimo?.t.endsWith("\n") && ultimaHoja(raiz)?.nodeName === "BR") {
    ultimo.t = ultimo.t.slice(0, -1);
  }
  return tramos.filter((t) => t.t !== "");
};

/** Para comparar: el espacio duro que pone el navegador es un espacio. */
const comparable = (tramos: ReadonlyArray<TramoEditado | TramoDelWord>) =>
  JSON.stringify(
    tramos.map((t) => [t.r ?? null, t.t.replace(/\u00a0/g, " "), t.b, t.i, t.u]),
  );

/** ¿Cambió el párrafo? */
export const cambio = (p: ParrafoDelWord, ahora: TramoEditado[]): boolean =>
  comparable(p.tramos) !== comparable(ahora);

/** Lo que se manda: el espacio duro del navegador va como espacio. */
export const paraGuardar = (tramos: TramoEditado[]): TramoEditado[] =>
  tramos.map((t) => ({ ...t, t: t.t.replace(/\u00a0/g, " ") }));

/** Los párrafos editables de la hoja, por su número. */
export const parrafosPorId = (
  bloques: readonly BloqueDelWord[],
): Map<number, ParrafoDelWord> => {
  const todos = new Map<number, ParrafoDelWord>();
  const recorrer = (b: BloqueDelWord) => {
    if (b.tipo === "parrafo") {
      if (b.editable) todos.set(b.id, b);
    } else
      b.filas.forEach((f) => f.forEach((c) => c.bloques.forEach(recorrer)));
  };
  bloques.forEach(recorrer);
  return todos;
};

/** Cuántos [COMPLETAR] quedan en un texto. */
export const cuantosPendientes = (texto: string): number =>
  texto.match(PENDIENTE)?.length ?? 0;
