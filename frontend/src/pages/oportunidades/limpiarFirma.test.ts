import { describe, expect, it } from "vitest";
import { AZUL_DE_FIRMA, type Imagen, limpiarFirma } from "./limpiarFirma";

// LA FIRMA LIMPIA (decisión 50, 19-10). Felipe: "debe quedar solo las
// líneas, bonitas (capaz hay que suavizarlas) y deben ser azul". Una foto
// de mentira: papel gris con un degradé de luz, un trazo de tinta y polvo.

const foto = (
  ancho: number,
  alto: number,
  pintar: (x: number, y: number) => [number, number, number] | null,
): Imagen => {
  const datos = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++)
    for (let x = 0; x < ancho; x++) {
      // Papel gris, más claro a la derecha (la luz de la ventana).
      const papel = 150 + Math.round((x / ancho) * 40);
      const [r, g, b] = pintar(x, y) ?? [papel, papel, papel - 4];
      const o = (y * ancho + x) * 4;
      datos[o] = r;
      datos[o + 1] = g;
      datos[o + 2] = b;
      datos[o + 3] = 255;
    }
  return { datos, ancho, alto };
};

const alfaEn = (img: Imagen, x: number, y: number) =>
  img.datos[(y * img.ancho + x) * 4 + 3];

describe("Limpiar la foto de la firma", () => {
  it("deja solo el trazo, azul, sobre transparente y recortado a su tamaño", () => {
    // Un trazo horizontal grueso (de 60 a 140, alto 4) y polvo suelto.
    const original = foto(200, 120, (x, y) => {
      if (y >= 58 && y < 62 && x >= 60 && x < 140) return [40, 50, 120];
      if ((x === 20 && y === 20) || (x === 180 && y === 100))
        return [60, 60, 60];
      return null;
    });
    const limpia = limpiarFirma(original);
    expect(limpia).not.toBeNull();
    const img = limpia as Imagen;
    // Recortada: del ancho del trazo más un margen, mucho menos que la foto.
    expect(img.ancho).toBeGreaterThanOrEqual(80);
    expect(img.ancho).toBeLessThan(110);
    expect(img.alto).toBeLessThan(30);
    // Todo azul; el centro del trazo lleno, las esquinas transparentes.
    for (let i = 0; i < img.ancho * img.alto; i++) {
      expect([
        img.datos[i * 4],
        img.datos[i * 4 + 1],
        img.datos[i * 4 + 2],
      ]).toEqual([...AZUL_DE_FIRMA]);
    }
    const centroX = Math.floor(img.ancho / 2);
    const centroY = Math.floor(img.alto / 2);
    expect(alfaEn(img, centroX, centroY)).toBeGreaterThan(200);
    expect(alfaEn(img, 0, 0)).toBe(0);
    expect(alfaEn(img, img.ancho - 1, img.alto - 1)).toBe(0);
  });

  it("el borde del trazo queda suave, sin escalones", () => {
    const original = foto(200, 120, (x, y) =>
      y >= 50 && y < 70 && x >= 40 && x < 160 ? [30, 40, 110] : null,
    );
    const img = limpiarFirma(original) as Imagen;
    const centroX = Math.floor(img.ancho / 2);
    const columna = Array.from({ length: img.alto }, (_, y) =>
      alfaEn(img, centroX, y),
    );
    // Entre lo transparente y lo lleno hay pasos intermedios.
    expect(columna.some((a) => a > 0 && a < 255)).toBe(true);
    expect(Math.max(...columna)).toBe(255);
  });

  it("una foto sin tinta no da firma", () => {
    expect(limpiarFirma(foto(120, 80, () => null))).toBeNull();
  });

  it("una firma que ya está limpia (transparente) se puede volver a limpiar", () => {
    const una = limpiarFirma(
      foto(200, 120, (x, y) =>
        y >= 58 && y < 64 && x >= 60 && x < 140 ? [40, 50, 120] : null,
      ),
    ) as Imagen;
    const otra = limpiarFirma(una) as Imagen;
    expect(otra).not.toBeNull();
    expect(otra.ancho).toBeGreaterThan(0);
    expect(
      alfaEn(otra, Math.floor(otra.ancho / 2), Math.floor(otra.alto / 2)),
    ).toBeGreaterThan(200);
  });
});
