import { useEffect, useState } from "react";
import { X, Download, FileText } from "lucide-react";
import { QuotationWithClient } from "../types/quotations.types";
import { useAuth } from "../contexts/AuthContext";
import { getMenuOrder } from "../services/sections.service";
import {
  CategorySection,
  VariableServiceCategoryLink,
} from "../types/services.types";

// Visor de cotización + PDF al cliente (mockup aprobado 20-07).
// UNA sola plantilla HTML para la pantalla (el "ojo") y para imprimir:
// lo que se ve es exactamente lo que recibe el cliente.
//
// Reglas del documento (definidas por Felipe):
// - El cliente NO ve el detalle de platos ni precios internos: solo el
//   programa por día, los valores por audiencia (por persona × personas),
//   los servicios parciales como línea propia y los fijos en detalle.
// - La propina es "Propina sugerida" y si no existe NO aparece.
// - Neto/IVA se calculan sobre el total SIN propina (la propina no lleva
//   IVA y se suma al final).

interface QuotationViewerProps {
  quotation: QuotationWithClient;
  onClose: () => void;
}

const clp = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-CL");

const esc = (s: string) =>
  String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export default function QuotationViewer({
  quotation,
  onClose,
}: QuotationViewerProps) {
  const { company } = useAuth();

  // Orden de la carta (secciones): el "incluye" de cada servicio se lista
  // en el mismo orden que el menu, sin precios (el detalle de cobros es
  // interno). Mientras carga, se usa el orden del snapshot.
  const [menu, setMenu] = useState<{
    categories: { id: number; name: string }[];
    sections: CategorySection[];
    links: VariableServiceCategoryLink[];
  } | null>(null);
  useEffect(() => {
    if (company?.id) getMenuOrder(company.id).then(setMenu);
  }, [company?.id]);

  // ---------- Datos base ----------
  const kids = Number(quotation.children_count || 0);
  const adults = Math.max(0, Number(quotation.people_count || 0) - kids);

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

  // Orden de presentación: por día, luego por el orden de las categorías
  // en el sistema, y adultos antes que niños. Aplica al programa y a la
  // tabla de valores por igual.
  const catRank = (name?: string) => {
    if (!menu || !name) return 9999;
    const i = menu.categories.findIndex((c) => c.name === name);
    return i === -1 ? 9999 : i;
  };
  const sortedGroups = [...varGroups].sort(
    (a, b) =>
      (a.day || 1) - (b.day || 1) ||
      catRank(a.category) - catRank(b.category) ||
      (audienceOf(a) === audienceOf(b)
        ? 0
        : audienceOf(a) === "adultos"
          ? -1
          : 1),
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
  const emittedLabel = new Date(quotation.created_at).toLocaleDateString(
    "es-CL",
    { day: "numeric", month: "long", year: "numeric" },
  );

  // ---------- Colores de marca ----------
  // Primario: acentos de identidad (línea del encabezado, "COTIZACIÓN",
  // títulos de sección, etiqueta ADULTOS, panel TOTAL A PAGAR, logo sin
  // imagen). Secundario: fondos suaves (franjas de día, fila de subtotal,
  // caja de observaciones). Si la empresa no configuró colores, se usa el
  // azul y los grises del mockup aprobado. El texto sobre el primario se
  // elige blanco o negro automáticamente según la luminosidad del color.
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
  const css = `
    .qv-hoja { background:#fff; padding:48px 56px; font-family:-apple-system,'Segoe UI',Roboto,sans-serif; color:#111827; }
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
    /* Los colores del documento se respetan al imprimir/PDF: sin esto,
       el navegador borra los fondos (modo ahorro de tinta) y la papeleta
       sale lavada. */
    .qv-hoja, .qv-hoja * {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @media print {
      @page { margin: 12mm; }
      body { background: #fff !important; }
      .qv-hoja { padding: 0; }
    }
  `;

  // Nombres de lo que incluye un servicio, ordenados como la carta.
  const includesOf = (g: VarGroup): string => {
    const items = (g.items || []).filter((it) => it.nombre);
    if (items.length === 0) return "";
    if (!menu) return items.map((it) => it.nombre).join(" · ");
    const cat = menu.categories.find((c) => c.name === g.category);
    const secSort = new Map(menu.sections.map((s) => [s.id, s.sort_order]));
    const linkSec = new Map(
      menu.links
        .filter((l) => !cat || l.category_id === cat.id)
        .map((l) => [String(l.variable_service_id), l.section_id]),
    );
    return items
      .map((it, i) => ({
        nombre: it.nombre as string,
        sort:
          (it.codigo && linkSec.get(String(it.codigo)) != null
            ? (secSort.get(linkSec.get(String(it.codigo)) as number) ?? 9998)
            : 9999) *
            10000 +
          i,
      }))
      .sort((a, b) => a.sort - b.sort)
      .map((x) => x.nombre)
      .join(" · ");
  };

  const audTag = (g: VarGroup) =>
    audienceOf(g) === "ninos"
      ? `<span class="qv-tagN">NIÑOS</span>`
      : `<span class="qv-tagA">ADULTOS</span>`;

  const progRow = (g: VarGroup) => {
    const inc = includesOf(g);
    return `<tr><td><b>${esc(g.category || "Servicio")}</b>${
      inc ? `<div class="inc"><b>Incluye:</b> ${esc(inc)}</div>` : ""
    }</td><td class="aud">${audTag(g)} · ${groupPeople(g).toLocaleString("es-CL")} personas</td></tr>`;
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

  // Tabla de valores en columnas alineadas: Concepto | Personas | Valor |
  // Monto. El "cuándo" (día de cada servicio) vive en el programa del
  // evento, no aquí (decisión de Felipe, 20-07-2026).
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
        <div class="qv-dato"><div class="k">Validez</div><div class="v">15 días</div></div>
      </div>

      ${varGroups.length > 0 ? `<h2>Programa del evento</h2>${programa}` : ""}

      ${varGroups.length > 0 ? `<h2>Valores · servicios de alimentación</h2><table class="qv-val">${valoresRows}</table>` : ""}

      ${fijosRows ? `<h2>Servicios fijos del evento</h2><table class="qv-val">${fijosRows}</table>` : ""}

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

      <div class="qv-pie">
        <span>${esc(company?.name || "")}</span>
        <span>Cotización N° ${quotation.quotation_number} · válida por 15 días</span>
      </div>
    </div>
  `;

  const handleDownloadPDF = (): void => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert(
        "No se pudo abrir la ventana de impresión. Verifica que el bloqueador de ventanas emergentes esté deshabilitado.",
      );
      return;
    }
    printWindow.document.write(`<!DOCTYPE html>
      <html lang="es"><head><meta charset="utf-8">
      <title>Cotización ${quotation.quotation_number} - ${esc(company?.name || "Empresa")}</title>
      <style>body{margin:0;} ${css}</style>
      </head><body>${body}</body></html>`);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  // ---------- Modal en pantalla: la MISMA hoja ----------
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-hidden">
        <div className="bg-blue-900 text-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileText className="h-5 w-5" />
              <h2 className="text-lg font-bold">
                Cotización #{quotation.quotation_number}
              </h2>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleDownloadPDF}
                className="bg-white bg-opacity-15 hover:bg-opacity-25 text-white px-4 py-2 rounded-lg flex items-center space-x-2 text-sm font-semibold"
              >
                <Download size={15} />
                <span>PDF</span>
              </button>
              <button
                onClick={onClose}
                className="text-white hover:text-blue-200"
              >
                <X size={22} />
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto max-h-[calc(95vh-64px)] bg-gray-100 p-6">
          <style>{css}</style>
          <div
            className="shadow-lg mx-auto max-w-3xl"
            dangerouslySetInnerHTML={{ __html: body }}
          />
        </div>
      </div>
    </div>
  );
}
