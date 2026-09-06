// LA HOJA DE COTIZACIÓN (mockup aprobado) — módulo COMPARTIDO.
// Extraída de QuotationViewer el 30-07-2026 para que el portal del
// mandante pueda mostrar la misma cotización que ve el equipo.
// Función PURA: recibe datos, devuelve {css, body}. Sin hooks, sin
// sesión — por eso sirve tanto en la app privada como en el portal
// público. Cualquier cambio de diseño de la hoja se hace AQUÍ y aplica
// a ambos mundos.

export interface PrintQuotationItems {
  variable_services?: unknown[];
  fixed_services?: unknown[];
}

export interface PrintQuotation {
  quotation_number: number;
  people_count?: number | null;
  children_count?: number | null;
  event_type?: string | null;
  event_date?: string | Date | null;
  event_end_date?: string | Date | null;
  created_at: string | Date;
  total_amount?: number | null;
  subtotal_amount?: number | null;
  tip_percentage?: number | null;
  observations?: string | null;
  contact_name?: string | null;
  items?: PrintQuotationItems | null;
  clients?: { name?: string | null } | null;
}

export interface PrintCompany {
  name?: string | null;
  logo_url?: string | null;
  colors?: { primary?: string; secondary?: string } | null;
}

export interface PrintMenu {
  categories: { id: number; name: string }[];
  sections: { id: number; name?: string; sort_order?: number | null }[];
  links: {
    variable_service_id: number | string;
    section_id?: number | null;
    category_id?: number | null;
  }[];
}

const clp = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-CL");

const esc = (s: string) =>
  String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

type VarGroup = {
  category?: string;
  day?: number;
  audience?: string;
  people?: number;
  items?: {
    codigo?: string;
    nombre?: string;
    precio?: number;
    quantity?: number;
  }[];
};

// LA LETRA DE LA HOJA (05-09-2026, revisión de Felipe): la tipografía
// viaja CON la pieza — Inter desde Google Fonts, idéntica en el visor,
// el portal, el PDF del motor y cualquier computador. Antes cada
// aparato ponía la suya (Helvetica en Mac, Liberation en el servidor)
// y los documentos se veían distintos. Si la fuente se cambia, se
// cambia AQUÍ y aplica a todos los mundos.
const INTER_FONT_FACES = `
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 400; font-display: swap; src: url(https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa25L7W0Q5n-wU.woff2) format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; } 
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 400; font-display: swap; src: url(https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2) format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; } 
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 500; font-display: swap; src: url(https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa25L7W0Q5n-wU.woff2) format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; } 
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 500; font-display: swap; src: url(https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2) format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; } 
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 600; font-display: swap; src: url(https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa25L7W0Q5n-wU.woff2) format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; } 
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 600; font-display: swap; src: url(https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2) format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; } 
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 700; font-display: swap; src: url(https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa25L7W0Q5n-wU.woff2) format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; } 
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 700; font-display: swap; src: url(https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2) format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; } 
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 800; font-display: swap; src: url(https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa25L7W0Q5n-wU.woff2) format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; } 
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 800; font-display: swap; src: url(https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2) format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }`;

export function buildQuotationPrintDoc(
  quotation: PrintQuotation,
  company: PrintCompany | null,
  menu: PrintMenu | null,
): { css: string; body: string } {
  // ---------- Datos base ----------
  const kids = Number(quotation.children_count || 0);
  const adults = Math.max(0, Number(quotation.people_count || 0) - kids);

  const varGroups: VarGroup[] = (quotation.items?.variable_services ||
    []) as VarGroup[];
  const fixedList = (quotation.items?.fixed_services || []) as {
    nombre?: string;
    precio?: number;
    quantity?: number;
    day?: number;
  }[];

  const audienceOf = (g: VarGroup) =>
    g.audience === "ninos" ? "ninos" : "adultos";
  const audienceTotal = (g: VarGroup) =>
    audienceOf(g) === "ninos" ? kids : adults;
  const groupPeople = (g: VarGroup) =>
    typeof g.people === "number"
      ? g.people
      : audienceTotal(g) || Number(quotation.people_count || 0);
  const groupPerPerson = (g: VarGroup) =>
    (g.items || []).reduce(
      (s, it) => s + (it.precio || 0) * (it.quantity || 1),
      0,
    );
  const isFull = (g: VarGroup) => groupPeople(g) === audienceTotal(g);

  // Orden de presentación (Felipe, 23-07): manda la MESA DE TRABAJO.
  const sortedGroups = [...varGroups].sort(
    (a, b) => (a.day || 1) - (b.day || 1),
  );

  const variableTotal = varGroups.reduce(
    (s, g) => s + groupPerPerson(g) * groupPeople(g),
    0,
  );
  const perAdulto = varGroups
    .filter((g) => audienceOf(g) === "adultos" && isFull(g))
    .reduce((s, g) => s + groupPerPerson(g), 0);
  const perNino = varGroups
    .filter((g) => audienceOf(g) === "ninos" && isFull(g))
    .reduce((s, g) => s + groupPerPerson(g), 0);
  const partials = sortedGroups.filter((g) => !isFull(g));

  const fixedTotal = fixedList.reduce(
    (s, f) => s + (f.precio || 0) * (f.quantity || 1),
    0,
  );

  // Propina: se recalcula (no se guarda el monto)
  const tipPct = quotation.tip_percentage;
  const tipAmount =
    tipPct != null && tipPct > 0
      ? Math.round(variableTotal * (tipPct / 100))
      : 0;
  const totalConIva = Math.round(
    Number(quotation.total_amount || 0) - tipAmount,
  );
  const neto = Math.round(totalConIva / 1.19);
  const iva = totalConIva - neto;
  const subtotal = Math.round(Number(quotation.subtotal_amount || 0));
  const discount = Math.max(0, subtotal - totalConIva);

  // ---------- Fechas ----------
  const startMs = new Date(String(quotation.event_date)).getTime();
  const endMs = quotation.event_end_date
    ? new Date(String(quotation.event_end_date)).getTime()
    : NaN;
  const daysCount =
    Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
      ? Math.min(60, Math.round((endMs - startMs) / 86400000) + 1)
      : 1;
  const multiDay = daysCount > 1;

  const fmtLarga = (ms: number) =>
    new Date(ms).toLocaleDateString("es-CL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });
  const eventDateLabel = (() => {
    if (!Number.isFinite(startMs)) return "—";
    const y = new Date(startMs).toLocaleDateString("es-CL", {
      year: "numeric",
      timeZone: "UTC",
    });
    if (!multiDay) return `${fmtLarga(startMs)} ${y}`;
    const d1 = new Date(startMs).toLocaleDateString("es-CL", {
      day: "numeric",
      timeZone: "UTC",
    });
    const d2 = new Date(endMs).toLocaleDateString("es-CL", {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });
    return `${d1} al ${d2} ${y} <small>(${daysCount} días)</small>`;
  })();
  const dayHeader = (n: number) =>
    `Día ${n} — ${fmtLarga(startMs + (n - 1) * 86400000)}`;
  // Hora de CHILE fija (05-09-2026): created_at es un instante real, y
  // sin zona cada aparato ponía la suya — el PDF del motor (reloj UTC)
  // decía "30 de julio" donde la Mac decía "29 de julio".
  const emittedLabel = new Date(quotation.created_at).toLocaleDateString(
    "es-CL",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "America/Santiago",
    },
  );

  // ---------- Colores de marca ----------
  const hexOk = (c?: string) =>
    c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : null;
  const brandP = hexOk(company?.colors?.primary) || "#1e3a8a";
  const brandS = hexOk(company?.colors?.secondary);
  const onBrandP = (() => {
    const n = parseInt(brandP.slice(1), 16);
    const lum =
      (0.299 * ((n >> 16) & 255) +
        0.587 * ((n >> 8) & 255) +
        0.114 * (n & 255)) /
      255;
    return lum > 0.6 ? "#111827" : "#fff";
  })();

  // ---------- Plantilla (mockup aprobado) ----------
  // Textos del pie de página, escapados para viajar dentro de la regla
  // CSS (comillas y barras romperían la hoja de estilos).
  const enCss = (t: string) =>
    t
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      // Saltos de línea y el cierre de estilos romperían la hoja
      // entera (revisión 06-08): fuera.
      .replace(/[\r\n]+/g, " ")
      .replace(/<\/style/gi, "<\\/style");
  const pieIzq = enCss(company?.name || "");
  const pieDer = enCss(
    `Cotización N° ${quotation.quotation_number} · válida por 30 días`,
  );
  const css = `
    ${INTER_FONT_FACES}
    .qv-hoja { background:#fff; padding:48px 56px; font-family:'Inter',-apple-system,'Segoe UI',Roboto,sans-serif; color:#111827; }
    .qv-head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid ${brandP}; padding-bottom:18px; }
    .qv-marca { display:flex; gap:14px; align-items:center; }
    .qv-logo { width:88px; height:88px; border-radius:50%; background:${brandP}; color:${onBrandP}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:32px; overflow:hidden; }
    .qv-logo img { width:100%; height:100%; object-fit:cover; }
    .qv-marca h1 { font-size:19px; letter-spacing:.2px; margin:0; }
    .qv-folio { text-align:right; }
    .qv-folio .tipo { font-size:11px; font-weight:800; letter-spacing:2px; color:${brandP}; text-transform:uppercase; }
    .qv-folio .num { font-size:26px; font-weight:800; }
    .qv-folio .fecha { font-size:11px; color:#6b7280; margin-top:2px; }
    .qv-datos { display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px 24px; padding:18px 0; border-bottom:1px solid #e5e7eb; }
    .qv-dato .k { font-size:9.5px; font-weight:800; letter-spacing:1px; color:#9ca3af; text-transform:uppercase; }
    .qv-dato .v { font-size:13px; font-weight:600; margin-top:1px; }
    .qv-dato .v small { font-weight:400; color:#6b7280; }
    .qv-hoja h2 { font-size:11px; font-weight:800; letter-spacing:1.6px; text-transform:uppercase; color:${brandP}; margin:26px 0 10px; }
    .qv-dia { margin-bottom:12px; }
    .qv-dia h3 { font-size:12px; font-weight:800; color:#374151; background:${brandS || "#f3f4f6"}; border-radius:6px; padding:5px 10px; margin:0 0 4px; }
    .qv-prog { width:100%; border-collapse:collapse; }
    .qv-prog td { font-size:12.5px; padding:5px 10px; border-bottom:1px solid #f3f4f6; color:#1f2937; }
    .qv-prog tr:last-child td { border-bottom:none; }
    .qv-prog .aud { text-align:right; color:#6b7280; font-size:11.5px; white-space:nowrap; vertical-align:top; padding-top:7px; }
    .qv-prog .inc { font-size:11px; color:#6b7280; font-weight:400; margin-top:2px; line-height:1.5; }
    .qv-tagA { color:${brandP}; font-weight:800; font-size:9.5px; letter-spacing:.5px; }
    .qv-tagN { color:#b45309; font-weight:800; font-size:9.5px; letter-spacing:.5px; }
    /* Cierre del programa (06-08, pedido de Felipe): un renglón en el
       color secundario que sella la sección antes de la plata. */
    .qv-cierre { height:3px; border-radius:2px; background:${brandS || brandP}; margin:18px 0 2px; opacity:.85; }
    .qv-val { width:100%; border-collapse:collapse; }
    .qv-val td { font-size:12.5px; padding:6px 10px; border-bottom:1px solid #f3f4f6; color:#1f2937; }
    .qv-val .der { text-align:right; white-space:nowrap; font-weight:600; color:#111827; }
    .qv-val .calc { color:#6b7280; font-weight:400; }
    .qv-val td:first-child { width:100%; }
    .qv-val .per { text-align:right; white-space:nowrap; }
    .qv-val .unit { text-align:right; white-space:nowrap; color:#6b7280; font-weight:400; }
    .qv-val tr.sub td { font-weight:800; color:#111827; background:${brandS || "#f9fafb"}; }
    .qv-resumen { margin-top:22px; margin-left:auto; width:320px; }
    .qv-resumen .linea { display:flex; justify-content:space-between; font-size:12.5px; color:#4b5563; padding:4px 12px; }
    .qv-resumen .linea b { color:#111827; }
    .qv-resumen .iva-box { border-top:1px solid #e5e7eb; margin-top:4px; padding-top:4px; }
    .qv-resumen .totcon { display:flex; justify-content:space-between; background:#fef3c7; font-size:13px; font-weight:800; padding:7px 12px; border-radius:6px; margin-top:6px; }
    .qv-resumen .prop { display:flex; justify-content:space-between; font-size:12px; color:#6b7280; padding:5px 12px; border-bottom:1px dashed #e5e7eb; }
    .qv-resumen .final { display:flex; justify-content:space-between; background:${brandP}; color:${onBrandP}; font-size:14.5px; font-weight:800; padding:9px 12px; border-radius:6px; margin-top:6px; }
    .qv-obs { margin-top:24px; background:${brandS || "#f9fafb"}; border-radius:8px; padding:12px 14px; font-size:12px; color:#4b5563; }
    .qv-obs b { display:block; font-size:10px; letter-spacing:1px; text-transform:uppercase; color:#9ca3af; margin-bottom:4px; }
    .qv-pie { margin-top:28px; border-top:1px solid #e5e7eb; padding-top:12px; font-size:10.5px; color:#9ca3af; display:flex; justify-content:space-between; }
    /* COSTURAS A NIVEL SUPERIOR (06-08, corregido en la revisión): la
       paginación arma las hojas ANTES de imprimir — o sea trabajando en
       modo PANTALLA —, así que estas reglas NO pueden vivir dentro de
       @media print o las ignora, y el bloque de la plata volvía a
       cortarse. Acá valen para la paginación y para la impresión. */
    /* COSTURAS (06-08, pedido de Felipe: el detalle por secciones
       alarga el documento y no puede cortar bloques por la mitad).
       Granularidad fina a propósito: una TABLA larga sí puede seguir
       en la hoja siguiente, pero nunca se parte una FILA ni una caja
       que se lee como una unidad (los totales, sobre todo). */
    .qv-prog tr, .qv-val tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    /* El cuadro de totales viaja entero a la hoja siguiente si no
       cabe completo: jamás el IVA en una página y el TOTAL en otra. */
    .qv-resumen, .qv-obs, .qv-head, .qv-datos {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    /* LA PLATA, TODA JUNTA (06-08, pedido de Felipe): valores por
       persona con su subtotal, servicios fijos con el suyo, y
       Neto/IVA/TOTAL viajan como UNA sola pieza a la hoja siguiente
       si no caben. Cada cuadro por dentro tampoco se corta. Si el
       conjunto no cabe ni en una hoja completa, se parte igual —
       nunca se pierde contenido.
       Y DESDE EL 27-08 (Felipe, cotización 506): las OBSERVACIONES
       viven DENTRO del bloque — la plata y sus observaciones son una
       sola historia, jamás el total en una hoja y el cuadro huérfano
       en la siguiente. De paso queda UN solo bloque indivisible al
       cierre, que era lo que confundía al paginador. */
    .qv-plata, .qv-bloque {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* PAGINACIÓN DE VERDAD (06-08): el navegador solo sugiere cortes;
       esta regla — que interpreta la pieza de paginación cargada en la
       ventana de impresión — define el pie que se repite en TODAS las
       hojas y el contador "Página N de M". Fuera de @media print a
       propósito: la paginación lee las reglas de nivel superior. */
    @page {
      size: A4;
      margin: 12mm;
      @bottom-left {
        content: "${pieIzq}";
        font-family: 'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif;
        font-size: 9.5px;
        color: #9ca3af;
        vertical-align: bottom;
        padding-bottom: 2mm;
      }
      @bottom-right {
        content: "${pieDer} · Página " counter(page) " de " counter(pages);
        font-family: 'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif;
        font-size: 9.5px;
        color: #9ca3af;
        vertical-align: bottom;
        padding-bottom: 2mm;
      }
    }
    .qv-hoja, .qv-hoja * {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @media print {
      @page { margin: 12mm; }
      body { background: #fff !important; }
      .qv-hoja { padding: 0; }

      /* El pie del flujo se esconde SOLO cuando la paginación armó las
         hojas de verdad (ella marca el documento con .pagedjs_pages);
         si no cargó — o en el portal del cliente, que no la usa — el
         pie del flujo sigue ahí y el documento nunca sale sin folio
         (pillado en la revisión del 06-08). */
      body:has(.pagedjs_pages) .qv-pie { display: none; }
      /* Un título nunca queda solo al pie de la página. */
      .qv-hoja h2, .qv-dia h3 {
        page-break-after: avoid;
        break-after: avoid;
      }
      /* Y el rótulo del día viaja con sus primeras filas. */
      .qv-dia { page-break-inside: auto; break-inside: auto; }
    }
  `;

  // Nombres de lo que incluye un servicio, ordenados como la carta.
  // Con la cantidad cuando es más de una (05-08, pillado por Felipe en
  // la #411: cobraba 2 helados por persona y el programa mostraba uno
  // solo). Mismo "×N" que ya usaban los servicios fijos.
  const conCantidad = (it: { nombre?: string; quantity?: number }) => {
    const q = it.quantity || 1;
    return q > 1 ? `${it.nombre} ×${q}` : String(it.nombre);
  };
  // Lo que incluye un servicio, AGRUPADO POR SECCIÓN como una carta
  // (06-08, idea de Felipe: "aprovechemos las secciones que ya tenemos").
  // Categoría sin secciones → una sola línea plana, como antes. Los
  // ítems sin sección van al final SIN rótulo (el cliente no necesita
  // ver un "Otros"). Secciones vacías no aparecen.
  const includesOf = (g: VarGroup): { titulo: string; texto: string }[] => {
    const items = (g.items || []).filter((it) => it.nombre);
    if (items.length === 0) return [];
    const plano = () => [{ titulo: "Incluye:", texto: items.map(conCantidad).join(" · ") }];
    if (!menu) return plano();
    // Por id primero (06-08): la caja reencuentra su categoría aunque
    // haya sido renombrada en el catálogo; por nombre como respaldo.
    const gid = (g as { category_id?: number | null }).category_id;
    const cat =
      (gid != null ? menu.categories.find((c) => c.id === gid) : undefined) ??
      menu.categories.find((c) => c.name === g.category) ??
      menu.categories.find(
        (c) =>
          c.name.trim().toLowerCase().replace(/s$/, "") ===
          (g.category || "").trim().toLowerCase().replace(/s$/, ""),
      );
    if (!cat) return plano();
    const secs = menu.sections
      .filter((sec) => sec.name)
      .slice()
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
    const secDe = new Map(
      menu.links
        .filter((l) => l.category_id === cat.id)
        .map((l) => [String(l.variable_service_id), l.section_id ?? 0]),
    );
    // ¿Esta categoría usa secciones en esta cotización? Si ninguno de
    // sus ítems tiene sección, la lista plana de siempre.
    const conSeccion = items.some(
      (it) => (secDe.get(String(it.codigo ?? "")) ?? 0) !== 0,
    );
    if (!conSeccion) return plano();
    const bloques: { titulo: string; texto: string }[] = [];
    secs.forEach((sec) => {
      const dentro = items.filter(
        (it) => (secDe.get(String(it.codigo ?? "")) ?? 0) === sec.id,
      );
      if (dentro.length)
        bloques.push({
          titulo: `${sec.name}:`,
          texto: dentro.map(conCantidad).join(" · "),
        });
    });
    // Sin sección: al final y sin rótulo.
    const sueltos = items.filter(
      (it) => (secDe.get(String(it.codigo ?? "")) ?? 0) === 0,
    );
    if (sueltos.length)
      bloques.push({ titulo: "", texto: sueltos.map(conCantidad).join(" · ") });
    return bloques;
  };

  const audTag = (g: VarGroup) =>
    audienceOf(g) === "ninos"
      ? `<span class="qv-tagN">NIÑOS</span>`
      : `<span class="qv-tagA">ADULTOS</span>`;

  const progRow = (g: VarGroup) => {
    const bloques = includesOf(g)
      .map(
        (b) =>
          `<div class="inc">${b.titulo ? `<b>${esc(b.titulo)}</b> ` : ""}${esc(b.texto)}</div>`,
      )
      .join("");
    return `<tr><td><b>${esc(g.category || "Servicio")}</b>${bloques}</td><td class="aud">${audTag(g)} · ${groupPeople(g).toLocaleString("es-CL")} personas</td></tr>`;
  };

  const programa = multiDay
    ? Array.from({ length: daysCount }, (_, i) => i + 1)
        .map((n) => {
          const del = sortedGroups.filter(
            (g) => Math.min(g.day || 1, daysCount) === n,
          );
          if (del.length === 0) return "";
          return `<div class="qv-dia"><h3>${esc(dayHeader(n))}</h3><table class="qv-prog">${del
            .map(progRow)
            .join("")}</table></div>`;
        })
        .join("")
    : `<table class="qv-prog">${sortedGroups.map(progRow).join("")}</table>`;

  const valoresRows = [
    adults > 0 && perAdulto > 0
      ? `<tr><td><span class="qv-tagA">ADULTOS</span> &nbsp;Valor por persona</td><td class="per">${adults.toLocaleString("es-CL")} personas</td><td class="unit">${clp(perAdulto)}</td><td class="der">${clp(perAdulto * adults)}</td></tr>`
      : "",
    kids > 0 && perNino > 0
      ? `<tr><td><span class="qv-tagN">NIÑOS</span> &nbsp;Valor por persona</td><td class="per">${kids.toLocaleString("es-CL")} personas</td><td class="unit">${clp(perNino)}</td><td class="der">${clp(perNino * kids)}</td></tr>`
      : "",
    ...partials.map(
      (g) =>
        `<tr><td>${esc(g.category || "Servicio")}</td><td class="per">${groupPeople(g).toLocaleString("es-CL")} personas</td><td class="unit">${clp(groupPerPerson(g))}</td><td class="der">${clp(groupPerPerson(g) * groupPeople(g))}</td></tr>`,
    ),
    `<tr class="sub"><td colspan="3">Subtotal alimentación</td><td class="der">${clp(variableTotal)}</td></tr>`,
  ].join("");

  const fijosRows =
    fixedList.length > 0
      ? [
          ...fixedList.map((f) => {
            const qty = f.quantity || 1;
            const dayTag = multiDay
              ? ` <span class="calc">· ${
                  !f.day || f.day === 0
                    ? "todo el evento"
                    : `Día ${Math.min(f.day, daysCount)}`
                }</span>`
              : "";
            return `<tr><td>${esc(f.nombre || "")}${qty > 1 ? ` <span class="calc">×${qty}</span>` : ""}${dayTag}</td><td class="der">${clp((f.precio || 0) * qty)}</td></tr>`;
          }),
          `<tr class="sub"><td>Subtotal servicios fijos</td><td class="der">${clp(fixedTotal)}</td></tr>`,
        ].join("")
      : "";

  const logoHtml = company?.logo_url
    ? `<img src="${esc(company.logo_url)}" alt="logo">`
    : esc(
        (company?.name || "E")
          .split(/\s+/)
          .map((w) => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase(),
      );

  const body = `
    <div class="qv-hoja">
      <div class="qv-head">
        <div class="qv-marca">
          <div class="qv-logo">${logoHtml}</div>
          <div><h1>${esc(company?.name || "Empresa")}</h1></div>
        </div>
        <div class="qv-folio">
          <div class="tipo">Cotización</div>
          <div class="num">N° ${quotation.quotation_number}</div>
          <div class="fecha">Emitida el ${esc(emittedLabel)}</div>
        </div>
      </div>

      <div class="qv-datos">
        <div class="qv-dato"><div class="k">Cliente</div><div class="v">${esc(quotation.clients?.name || "—")}</div></div>
        ${
          quotation.contact_name
            ? `<div class="qv-dato"><div class="k">Persona de contacto</div><div class="v">${esc(quotation.contact_name)}</div></div>`
            : ""
        }
        <div class="qv-dato"><div class="k">Tipo de evento</div><div class="v">${esc(String(quotation.event_type || "—"))}</div></div>
        <div class="qv-dato"><div class="k">Fecha del evento</div><div class="v">${eventDateLabel}</div></div>
        <div class="qv-dato"><div class="k">Asistentes</div><div class="v">${(adults + kids).toLocaleString("es-CL")}${kids > 0 ? ` <small>· ${adults} adultos + ${kids} niños</small>` : ""}</div></div>
        <div class="qv-dato"><div class="k">Validez</div><div class="v">30 días</div></div>
      </div>

      ${varGroups.length > 0 ? `<h2>Programa del evento</h2>${programa}<div class="qv-cierre"></div>` : ""}

      <div class="qv-plata">
      ${varGroups.length > 0 ? `<div class="qv-bloque"><h2>Valores · servicios de alimentación</h2><table class="qv-val">${valoresRows}</table></div>` : ""}

      ${fijosRows ? `<div class="qv-bloque"><h2>Servicios fijos del evento</h2><table class="qv-val">${fijosRows}</table></div>` : ""}

      <div class="qv-resumen">
        ${
          discount > 0
            ? `<div class="linea"><span>Subtotal</span><b>${clp(subtotal)}</b></div>
               <div class="linea"><span>Descuento</span><b>−${clp(discount)}</b></div>`
            : ""
        }
        <div class="linea iva-box"><span>Neto</span><b>${clp(neto)}</b></div>
        <div class="linea"><span>IVA (19%)</span><b>${clp(iva)}</b></div>
        ${
          tipAmount > 0
            ? `<div class="totcon"><span>Total con IVA</span><span>${clp(totalConIva)}</span></div>
               <div class="prop"><span>Propina sugerida (${tipPct}% alimentación)</span><span>${clp(tipAmount)}</span></div>
               <div class="final"><span>TOTAL</span><span>${clp(totalConIva + tipAmount)}</span></div>`
            : `<div class="final"><span>TOTAL</span><span>${clp(totalConIva)}</span></div>`
        }
      </div>

      ${
        quotation.observations
          ? `<div class="qv-obs"><b>Observaciones</b>${esc(quotation.observations)}</div>`
          : ""
      }
      </div>

      <div class="qv-pie">
        <span>${esc(company?.name || "")}</span>
        <span>Cotización N° ${quotation.quotation_number} · válida por 30 días</span>
      </div>
    </div>
  `;

  return { css, body };
}

/** Abre la hoja en una ventana nueva y lanza imprimir/guardar PDF. */
// EL NOMBRE DEL ARCHIVO (06-08, pedido de Felipe): "470 - Municipalidad
// de Quillón" en vez de llevar siempre el nombre de la empresa propia,
// que hacía que todos los PDF se llamaran casi igual. Chrome usa el
// título de la ventana como nombre por defecto al guardar; se limpian
// los caracteres que el sistema de archivos no acepta.
export const nombreArchivo = (q: PrintQuotation): string => {
  const cliente = (q.clients?.name || "").trim();
  const limpio = cliente
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return limpio ? `${q.quotation_number} - ${limpio}` : `${q.quotation_number}`;
};

export function openQuotationPrintWindow(
  quotation: PrintQuotation,
  company: PrintCompany | null,
  menu: PrintMenu | null,
): boolean {
  const { css, body } = buildQuotationPrintDoc(quotation, company, menu);
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;
  // La ventana de impresión pagina de VERDAD antes de imprimir (06-08):
  // la pieza de paginación arma las hojas, repite el pie y numera
  // "Página N de M" — lo que el navegador solo no sabe hacer. El
  // respaldo por tiempo asegura que, si esa pieza no cargara, la
  // impresión salga igual como siempre.
  printWindow.document.write(`<!DOCTYPE html>
      <html lang="es"><head><meta charset="utf-8">
      <title>${esc(nombreArchivo(quotation))}</title>
      <style>body{margin:0;} ${css}</style>
      <script>
        window.__yaImprimio = false;
        window.imprimirUnaVez = function () {
          if (window.__yaImprimio) return;
          window.__yaImprimio = true;
          window.print();
        };
        window.__respaldo = null;
        window.PagedConfig = {
          auto: true,
          before: function () {
            // La paginación arrancó: el respaldo por tiempo ya no hace
            // falta y sobra que dispare un segundo diálogo si el
            // usuario canceló el primero (revisión 06-08).
            if (window.__respaldo) clearTimeout(window.__respaldo);
          },
          after: function () { setTimeout(window.imprimirUnaVez, 150); },
        };
      <\/script>
      <script src="/paged.polyfill.js" onerror="setTimeout(window.imprimirUnaVez, 200)"><\/script>
      </head><body>${body}
      <script>window.__respaldo = setTimeout(window.imprimirUnaVez, 8000);<\/script>
      </body></html>`);
  printWindow.document.close();
  return true;
}
