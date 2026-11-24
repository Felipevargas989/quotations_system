// IMPRIMIR UN PEDAZO DE LA PANTALLA COMO HOJA (23-11-2026)
//
// Nació para el resumen del día de Planificación. Copia lo que se ve, con
// los mismos estilos de la app, en una pestaña limpia y abre SOLA la
// ventana de imprimir / guardar como PDF, igual que la cotización, sin
// botón de por medio (Felipe, 23-11-2026: "se pasa distinto, como que me
// abre otra hoja y me hace apretar otro botón"). El título de la pestaña
// es el nombre con que se guarda el PDF.
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
  /* Los colores de cada tabla también en papel y en PDF. */
  * { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  table, tr { page-break-inside:avoid; }
  @media print {
    @page { size:A4 portrait; margin:12mm; }
    body { padding:0; }
  }
</style></head><body>
${cuerpoDeLaHoja(nodo)}
<script>
  // Cuando cargaron los estilos, el diálogo de imprimir solo, una vez.
  window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 150); });
</script>
</body></html>`;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
