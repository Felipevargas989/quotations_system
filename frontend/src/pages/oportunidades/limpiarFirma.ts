// LA FIRMA LIMPIA (decisión 50 del doc 17, 19-10). Felipe, con el Formulario
// N°5 firmado a la vista: "hay que mejorar la extracción de la firma: debe
// quedar solo las líneas, bonitas (capaz hay que suavizarlas) y deben ser
// azul". La foto traía el papel gris entero. Aquí, sin canvas (se prueba
// con números): de los píxeles de la foto sale la firma sola, azul, sobre
// transparente, suavizada y recortada a su tamaño.

export type Imagen = {
  /** RGBA, 4 bytes por píxel, fila por fila (como ImageData). */
  datos: Uint8ClampedArray;
  ancho: number;
  alto: number;
};

/** El azul de un lápiz pasta. */
export const AZUL_DE_FIRMA: readonly [number, number, number] = [24, 52, 145];

/** Cuánto más oscuro que el papel de alrededor es tinta: desde ahí empieza
 *  a verse, y desde aquí es trazo lleno. */
const TINTA_DESDE = 0.12;
const TINTA_LLENA = 0.32;

const acotar = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const suave = (a: number, b: number, v: number) => {
  const t = acotar((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** La luz de cada píxel (0 a 255); lo transparente cuenta como papel. */
function luces({ datos, ancho, alto }: Imagen): Float32Array {
  const n = ancho * alto;
  const luz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = datos[i * 4 + 3] / 255;
    const l =
      0.299 * datos[i * 4] +
      0.587 * datos[i * 4 + 1] +
      0.114 * datos[i * 4 + 2];
    luz[i] = l * a + 255 * (1 - a);
  }
  return luz;
}

/** La luz del papel en cada punto: el promedio por bloques, el más claro de
 *  cada vecindario (un bloque lleno de tinta no es papel), suavizado y
 *  repartido a cada píxel. Así una foto con sombra o con luz pareja da lo
 *  mismo. */
function papel(luz: Float32Array, w: number, h: number): Float32Array {
  const lado = Math.max(8, Math.round(Math.min(w, h) / 24));
  const bw = Math.ceil(w / lado);
  const bh = Math.ceil(h / lado);
  const suma = new Float32Array(bw * bh);
  const cuenta = new Float32Array(bw * bh);
  for (let y = 0; y < h; y++) {
    const fy = Math.floor(y / lado) * bw;
    for (let x = 0; x < w; x++) {
      const k = fy + Math.floor(x / lado);
      suma[k] += luz[y * w + x];
      cuenta[k] += 1;
    }
  }
  const media = suma.map((s, k) => s / cuenta[k]);
  const vecino = (m: Float32Array, f: (a: number, b: number) => number) => {
    const r = new Float32Array(m.length);
    for (let y = 0; y < bh; y++)
      for (let x = 0; x < bw; x++) {
        let v = m[y * bw + x];
        let n = 1;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const yy = y + dy;
            const xx = x + dx;
            if ((dx || dy) && yy >= 0 && yy < bh && xx >= 0 && xx < bw) {
              v = f(v, m[yy * bw + xx]);
              n++;
            }
          }
        r[y * bw + x] = f === Math.max ? v : v / n;
      }
    return r;
  };
  const claro = vecino(media, Math.max);
  const grilla = vecino(claro, (a, b) => a + b);
  const fondo = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const gy = Math.min(Math.max((y + 0.5) / lado - 0.5, 0), bh - 1);
    const y0 = Math.floor(gy);
    const y1 = Math.min(y0 + 1, bh - 1);
    const ty = gy - y0;
    for (let x = 0; x < w; x++) {
      const gx = Math.min(Math.max((x + 0.5) / lado - 0.5, 0), bw - 1);
      const x0 = Math.floor(gx);
      const x1 = Math.min(x0 + 1, bw - 1);
      const tx = gx - x0;
      const arriba =
        grilla[y0 * bw + x0] * (1 - tx) + grilla[y0 * bw + x1] * tx;
      const abajo = grilla[y1 * bw + x0] * (1 - tx) + grilla[y1 * bw + x1] * tx;
      fondo[y * w + x] = arriba * (1 - ty) + abajo * ty;
    }
  }
  return fondo;
}

/** Saca las manchitas sueltas (polvo, grano del papel): de la tinta, quedan
 *  solo los trazos de cierto tamaño, con su borde suave. */
function sinManchas(alfa: Float32Array, w: number, h: number): Float32Array {
  const n = w * h;
  const minimo = Math.max(8, Math.round(n * 0.000012));
  const etiqueta = new Int32Array(n);
  const pila = new Int32Array(n);
  const queda = new Uint8Array(n);
  let actual = 0;
  for (let i = 0; i < n; i++) {
    if (alfa[i] < 0.5 || etiqueta[i]) continue;
    actual++;
    const miembros: number[] = [];
    let tope = 0;
    pila[tope++] = i;
    etiqueta[i] = actual;
    while (tope > 0) {
      const p = pila[--tope];
      miembros.push(p);
      const px = p % w;
      const py = (p - px) / w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = px + dx;
          const yy = py + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const q = yy * w + xx;
          if (!etiqueta[q] && alfa[q] >= 0.5) {
            etiqueta[q] = actual;
            pila[tope++] = q;
          }
        }
    }
    if (miembros.length >= minimo) for (const p of miembros) queda[p] = 1;
  }
  // El borde suave de un trazo que queda (2 píxeles alrededor), sí.
  const r = new Float32Array(n);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (alfa[i] === 0) continue;
      let cerca = false;
      for (let dy = -2; dy <= 2 && !cerca; dy++)
        for (let dx = -2; dx <= 2 && !cerca; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          cerca =
            xx >= 0 && yy >= 0 && xx < w && yy < h && queda[yy * w + xx] === 1;
        }
      if (cerca) r[i] = alfa[i];
    }
  return r;
}

/** Suaviza el borde del trazo (desenfoque 1-2-1) y lo vuelve a apretar, para
 *  que quede liso y lleno. */
function suavizar(alfa: Float32Array, w: number, h: number): Float32Array {
  const pasada = (a: Float32Array, horizontal: boolean) => {
    const r = new Float32Array(a.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const antes = horizontal
          ? x > 0
            ? a[i - 1]
            : a[i]
          : y > 0
            ? a[i - w]
            : a[i];
        const despues = horizontal
          ? x < w - 1
            ? a[i + 1]
            : a[i]
          : y < h - 1
            ? a[i + w]
            : a[i];
        r[i] = (antes + 2 * a[i] + despues) / 4;
      }
    return r;
  };
  const borroso = pasada(pasada(alfa, true), false);
  return borroso.map((v) => suave(0.15, 0.85, v));
}

/** La firma sola: azul, sobre transparente, suavizada y recortada con un
 *  margen. null si en la foto no hay tinta que reconocer. */
export function limpiarFirma(foto: Imagen): Imagen | null {
  const { ancho: w, alto: h } = foto;
  const luz = luces(foto);
  const fondo = papel(luz, w, h);
  const tinta = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const oscuro = (fondo[i] - luz[i]) / Math.max(fondo[i], 1);
    tinta[i] = suave(TINTA_DESDE, TINTA_LLENA, oscuro);
  }
  const alfa = suavizar(sinManchas(tinta, w, h), w, h);

  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (alfa[y * w + x] > 0.05) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const margen = Math.max(6, Math.round(Math.max(x1 - x0, y1 - y0) * 0.04));
  x0 = Math.max(0, x0 - margen);
  y0 = Math.max(0, y0 - margen);
  x1 = Math.min(w - 1, x1 + margen);
  y1 = Math.min(h - 1, y1 + margen);

  const ancho = x1 - x0 + 1;
  const alto = y1 - y0 + 1;
  const datos = new Uint8ClampedArray(ancho * alto * 4);
  const [r, g, b] = AZUL_DE_FIRMA;
  for (let y = 0; y < alto; y++)
    for (let x = 0; x < ancho; x++) {
      const o = (y * ancho + x) * 4;
      datos[o] = r;
      datos[o + 1] = g;
      datos[o + 2] = b;
      datos[o + 3] = Math.round(alfa[(y + y0) * w + (x + x0)] * 255);
    }
  return { datos, ancho, alto };
}
