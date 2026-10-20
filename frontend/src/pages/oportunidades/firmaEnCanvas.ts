import { limpiarFirma } from "./limpiarFirma";

// La foto de la firma pasa por el canvas del navegador: se achica si es
// enorme, se limpia (limpiarFirma.ts) y sale un PNG transparente, listo para
// subir. Nada sale del navegador hasta que la persona dice «Guardar».

/** El lado mayor con que se trabaja: de sobra para una firma nítida. Una
 *  foto chica se agranda antes de limpiar, para que el trazo salga liso. */
const LADO_MAXIMO = 2000;
const LADO_MINIMO = 1200;

export async function limpiarArchivoDeFirma(foto: Blob): Promise<File | null> {
  const bitmap = await createImageBitmap(foto);
  const mayor = Math.max(bitmap.width, bitmap.height);
  const escala = Math.min(
    LADO_MAXIMO / mayor,
    Math.max(1, LADO_MINIMO / mayor),
  );
  const ancho = Math.max(1, Math.round(bitmap.width * escala));
  const alto = Math.max(1, Math.round(bitmap.height * escala));
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("El navegador no deja trabajar la imagen.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();
  const limpia = limpiarFirma({
    datos: ctx.getImageData(0, 0, ancho, alto).data,
    ancho,
    alto,
  });
  if (!limpia) return null;

  const salida = document.createElement("canvas");
  salida.width = limpia.ancho;
  salida.height = limpia.alto;
  const ctxSalida = salida.getContext("2d");
  if (!ctxSalida) throw new Error("El navegador no deja trabajar la imagen.");
  const pixeles = ctxSalida.createImageData(limpia.ancho, limpia.alto);
  pixeles.data.set(limpia.datos);
  ctxSalida.putImageData(pixeles, 0, 0);
  const png = await new Promise<Blob | null>((listo) =>
    salida.toBlob(listo, "image/png"),
  );
  return png ? new File([png], "firma.png", { type: "image/png" }) : null;
}
