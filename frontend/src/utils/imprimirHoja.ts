// IMPRIMIR UN PEDAZO DE LA PANTALLA COMO HOJA (23-11-2026)
//
// Nació para el resumen del día de Planificación. Copia lo que se ve, con
// los mismos estilos de la app, en una pestaña limpia con el botón
// «Imprimir / PDF» arriba a la derecha, igual que la Ficha de Cocina.
//
// - Lo marcado con `data-no-imprimir` (botones, la ✕) no va.
// - Lo marcado con `data-dinero` tampoco: la hoja sale sin montos, porque
//   anda de mano en mano (Felipe, 23-11-2026: "puede ser sin dinero, me
//   preocupa que alguien más lo vea").
// - Los campos se cambian por su valor escrito: el HTML de un <input> no
//   trae lo que se tecleó, y la hora del servicio salía vacía.
// - Los botones que quedan (ej: un nombre que abre algo) van como texto.

const escapar = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** El HTML de la hoja: lo que se ve, sin controles. Aparte para probarlo. */
export function cuerpoDeLaHoja(nodo: HTMLElement): string {
  const copia = nodo.cloneNode(true) as HTMLElement;
  const originales = nodo.querySelectorAll("input, textarea, select");
  copia.querySelectorAll("input, textarea, select").forEach((campo, i) => {
    const original = originales[i] as HTMLInputElement | undefined;
    const valor = original?.value ?? "";
    const texto = document.createElement("span");
    texto.textContent = valor || "—";
    texto.className = "font-medium";
    campo.replaceWith(texto);
  });
  copia
    .querySelectorAll("[data-no-imprimir], [data-dinero]")
    .forEach((n) => n.remove());
  copia.querySelectorAll("button").forEach((b) => {
    const texto = document.createElement("span");
    texto.innerHTML = b.innerHTML;
    texto.className = b.className;
    b.replaceWith(texto);
  });
  return copia.outerHTML;
}

/** Abre la hoja en una pestaña nueva, lista para imprimir o guardar en PDF. */
export function imprimirHoja(nodo: HTMLElement, titulo: string) {
  // Los mismos estilos de la app (Tailwind ya armado), para que la hoja se
  // vea igual que la pantalla.
  const estilos = [
    ...document.querySelectorAll('link[rel="stylesheet"], style'),
  ]
    .map((n) => {
      if (n instanceof HTMLLinkElement)
        return `<link rel="stylesheet" href="${n.href}">`;
      return n.outerHTML;
    })
    .join("\n");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${escapar(titulo)}</title>
${estilos}
<style>
  body { background:#fff; padding:24px; }
  .btn-imprimir { position:fixed; top:14px; right:14px; background:#2563eb; color:#fff; border:none; border-radius:8px; padding:10px 18px; font-size:14px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.25); z-index:10; }
  /* Los colores de cada tabla también en papel y en PDF. */
  * { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  table, tr { page-break-inside:avoid; }
  @media print {
    @page { size:A4 portrait; margin:12mm; }
    body { padding:0; }
    .btn-imprimir { display:none; }
  }
</style></head><body>
<button class="btn-imprimir" onclick="window.print()">Imprimir / PDF</button>
${cuerpoDeLaHoja(nodo)}
</body></html>`;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
