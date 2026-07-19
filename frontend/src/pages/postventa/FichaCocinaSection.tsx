import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChefHat,
  ChevronDown,
  ChevronRight,
  Printer,
  X,
} from "lucide-react";
import { Quotation } from "../../types/quotations.types";
import {
  KitchenNote,
  addEventKitchenNote,
  deleteEventKitchenNote,
  getEventDayPrints,
  getEventKitchenNotes,
  getEventServiceTimes,
  markEventDaysPrinted,
  setEventServiceTime,
} from "../../services/logistics.service";
import {
  FurnitureItem,
  RecipeItem,
  Supply,
  UNIT_FAMILY_INFO,
  grossQty,
  toBaseQty,
} from "../../types/logistics.types";
import {
  EventItemsSnapshot,
  buildConsolidationContext,
  consolidateEvent,
  newAccumulator,
} from "../../utils/eventConsolidation";
import { getMenuOrder } from "../../services/sections.service";
import {
  CategorySection,
  VariableServiceCategoryLink,
} from "../../types/services.types";

// Ficha de cocina: horarios por servicio + notas del evento (lista) y la
// vista imprimible aprobada (azul marino, notas amarillas). La ficha se
// genera SIEMPRE fresca desde los datos vigentes — cambió algo, se vuelve a
// imprimir. Impresión vía el diálogo del navegador (papel o PDF).

const fmtQty = (n: number) =>
  Number(n.toFixed(2)).toLocaleString("es-CL", { maximumFractionDigits: 2 });

export default function FichaCocinaSection({
  companyId,
  quote,
  recipes,
  supplies,
  furniture,
  nameIds,
}: {
  readonly companyId: number;
  readonly quote: Quotation;
  readonly recipes: RecipeItem[];
  readonly supplies: Supply[];
  readonly furniture: FurnitureItem[];
  readonly nameIds: {
    variable: Record<string, number>;
    fixed: Record<string, number>;
  };
}) {
  const quotationId = String(quote.id);
  const [times, setTimes] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<KitchenNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      getEventServiceTimes(companyId, quotationId),
      getEventKitchenNotes(companyId, quotationId),
      getEventDayPrints(companyId, quotationId),
    ]).then(([t, n, dp]) => {
      setTimes(t);
      setNotes(n);
      setDayPrints(dp);
    });
  }, [companyId, quotationId]);

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const personas = quote.people_count || 0;
  const groups = quote.items?.variable_services || [];

  // Cada SERVICIO de la cotización tiene su propio horario, aunque la
  // categoría se repita (ej: dos Coffee, mañana y tarde). La 1ª aparición
  // guarda con el nombre tal cual (compatible con horarios ya guardados);
  // las siguientes llevan sufijo #2, #3... y en pantalla se rotulan (2º).
  const slots = useMemo(() => {
    const catCount = new Map<string, number>();
    groups.forEach((g) =>
      catCount.set(g.category, (catCount.get(g.category) || 0) + 1),
    );
    const seen = new Map<string, number>();
    return groups.map((g) => {
      const n = (seen.get(g.category) || 0) + 1;
      seen.set(g.category, n);
      const repeated = (catCount.get(g.category) || 1) > 1;
      return {
        group: g,
        key: n === 1 ? g.category : `${g.category}#${n}`,
        label: repeated ? `${g.category} (${n}º)` : g.category,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.items]);

  // ---------- Días del evento (multi-día, mockup aprobado) ----------
  const daysCount = (() => {
    if (!quote.event_date || !quote.event_end_date) return 1;
    const sMs = new Date(String(quote.event_date)).getTime();
    const eMs = new Date(String(quote.event_end_date)).getTime();
    if (!Number.isFinite(sMs) || !Number.isFinite(eMs) || eMs <= sMs) return 1;
    return Math.min(60, Math.round((eMs - sMs) / 86400000) + 1);
  })();
  const multiDay = daysCount > 1;
  const allDays = Array.from({ length: daysCount }, (_, i) => i + 1);
  const dayDateStr = (n: number) => {
    const sMs = new Date(String(quote.event_date)).getTime();
    return new Date(sMs + (n - 1) * 86400000).toISOString().slice(0, 10);
  };
  const fmtLargaUTC = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("es-CL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  const todayStr = (() => {
    const d = new Date();
    const p = (x: number) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  })();
  const dayState = (n: number): "pasado" | "hoy" | "futuro" => {
    const ds = dayDateStr(n);
    return ds === todayStr ? "hoy" : ds < todayStr ? "pasado" : "futuro";
  };

  // Día de cada servicio variable (del cotizador; legado sin día = 1) y
  // orden DENTRO del día: por horario ascendente, sin hora al final.
  const slotDay = (sl: (typeof slots)[number]) =>
    Math.min((sl.group as unknown as { day?: number }).day || 1, daysCount);
  const orderByTime = (list: typeof slots) =>
    [...list].sort((a, b) => {
      const ta = times[a.key] || "";
      const tb = times[b.key] || "";
      if (ta && tb) return ta < tb ? -1 : ta > tb ? 1 : 0;
      if (ta) return -1;
      if (tb) return 1;
      return 0;
    });
  const slotsForDay = (n: number) =>
    orderByTime(slots.filter((sl) => slotDay(sl) === n));

  // Servicios fijos: día 0 = "todo el evento" (aparece en cada día).
  const fixedList = quote.items?.fixed_services || [];
  const fixedDayOf = (f: unknown) =>
    Math.min((f as { day?: number }).day || 0, daysCount);
  const fixedForDay = (n: number) =>
    fixedList.filter((f) => fixedDayOf(f) === n || fixedDayOf(f) === 0);
  const notesForDay = (n: number) =>
    notes.filter((x) => (x.day ?? 1) === n);

  // Estado de la vista multi-día: desplegables (por defecto solo se abre el
  // día de HOY, o el primer día futuro), selección de impresión y registro
  // de fichas ya impresas (verde suave).
  const [openDays, setOpenDays] = useState<Set<number> | null>(null);
  const defaultOpenDay =
    allDays.find((n) => dayState(n) === "hoy") ??
    allDays.find((n) => dayState(n) === "futuro") ??
    daysCount;
  const isDayOpen = (n: number) =>
    openDays ? openDays.has(n) : n === defaultOpenDay;
  const toggleDay = (n: number) =>
    setOpenDays((prev) => {
      const next = new Set(prev ?? [defaultOpenDay]);
      if (next.has(n)) {
        next.delete(n);
      } else {
        next.add(n);
      }
      return next;
    });
  const [checkedDays, setCheckedDays] = useState<Set<number>>(new Set());
  const toggleChecked = (n: number) =>
    setCheckedDays((prev) => {
      const next = new Set(prev);
      if (next.has(n)) {
        next.delete(n);
      } else {
        next.add(n);
      }
      return next;
    });
  const [dayPrints, setDayPrints] = useState<Record<number, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});

  const saveTime = async (serviceName: string, value: string) => {
    setTimes((prev) => ({ ...prev, [serviceName]: value }));
    const { error } = await setEventServiceTime(
      companyId,
      quotationId,
      serviceName,
      value,
    );
    if (!error) flashSaved();
  };

  const addNote = async () => {
    const text = newNote.trim();
    if (!text) return;
    const { error } = await addEventKitchenNote(companyId, quotationId, text);
    if (!error) {
      setNewNote("");
      setNotes(await getEventKitchenNotes(companyId, quotationId));
      flashSaved();
    }
  };

  const removeNote = async (id: number) => {
    const { error } = await deleteEventKitchenNote(id);
    if (!error) setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  // Nota de un día específico (multi-día).
  const addNoteDay = async (day: number) => {
    const text = (noteDrafts[day] || "").trim();
    if (!text) return;
    const { error } = await addEventKitchenNote(
      companyId,
      quotationId,
      text,
      day,
    );
    if (!error) {
      setNoteDrafts((prev) => ({ ...prev, [day]: "" }));
      setNotes(await getEventKitchenNotes(companyId, quotationId));
      flashSaved();
    }
  };

  // ---------- Datos calculados para la ficha ----------
  const ctx = useMemo(
    () =>
      buildConsolidationContext(recipes, supplies, furniture, nameIds, {}),
    [recipes, supplies, furniture, nameIds],
  );

  const resolveVarId = (codigo: string, nombre: string) => {
    const numericId = Number(codigo);
    if (
      Number.isFinite(numericId) &&
      ctx.byService.get(`variable-${numericId}`)
    ) {
      return numericId;
    }
    return nameIds.variable[nombre.trim().toLowerCase()];
  };

  // ---------- Orden "como la carta": secciones de cada categoría ----------
  const [menu, setMenu] = useState<{
    categories: { id: number; name: string }[];
    sections: CategorySection[];
    links: VariableServiceCategoryLink[];
  }>({ categories: [], sections: [], links: [] });
  useEffect(() => {
    getMenuOrder(companyId).then(setMenu);
  }, [companyId]);

  // Id del servicio para efectos de orden (sin exigir que tenga receta).
  const serviceIdOf = (codigo: string, nombre: string) => {
    const n = Number(codigo);
    if (Number.isFinite(n) && String(codigo).trim() !== "") return n;
    return nameIds.variable[nombre.trim().toLowerCase()];
  };

  type SnapItem = { codigo: string; nombre: string; quantity?: number };

  // Agrupa y ordena los platos de un servicio según las secciones de su
  // categoría (mismo orden que en Gestión de Servicios). Platos sin sección
  // van al final bajo "Otros". Categoría sin secciones → un grupo sin título.
  const orderItems = (
    categoryName: string,
    items: SnapItem[],
  ): { name: string | null; items: SnapItem[] }[] => {
    const cat = menu.categories.find(
      (c) =>
        c.name.trim().toLowerCase() === categoryName.trim().toLowerCase(),
    );
    if (!cat) return [{ name: null, items }];
    const secs = menu.sections.filter((s) => s.category_id === cat.id);
    if (secs.length === 0) return [{ name: null, items }];
    const linkByService = new Map(
      menu.links
        .filter((l) => l.category_id === cat.id)
        .map((l) => [l.variable_service_id, l]),
    );
    const linkOf = (it: SnapItem) => {
      const id = serviceIdOf(it.codigo, it.nombre);
      return id === undefined ? undefined : linkByService.get(id);
    };
    const grouped = secs.map((s) => ({
      name: s.name,
      items: [] as SnapItem[],
    }));
    const bySec = new Map(secs.map((s, i) => [s.id, grouped[i]]));
    const rest: SnapItem[] = [];
    items.forEach((it) => {
      const g = linkOf(it)?.section_id
        ? bySec.get(linkOf(it)!.section_id as number)
        : undefined;
      if (g) {
        g.items.push(it);
      } else {
        rest.push(it);
      }
    });
    grouped.forEach((g) =>
      g.items.sort(
        (a, b) =>
          (linkOf(a)?.sort_order ?? Number.MAX_SAFE_INTEGER) -
          (linkOf(b)?.sort_order ?? Number.MAX_SAFE_INTEGER),
      ),
    );
    const out = grouped.filter((g) => g.items.length > 0);
    if (rest.length > 0) out.push({ name: "Otros", items: rest });
    return out.length > 0 ? out : [{ name: null, items }];
  };

  const openFicha = () => {
    const esc = (s: string) =>
      String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Bloques por servicio (categoría de la cotización): platillos ×cant,
    // receta en letra chica y mobiliario a montar. Un bloque por servicio,
    // con su propio horario aunque la categoría se repita.
    const bloquesDe = (slotList: typeof slots) => slotList
      .map(({ group: g, key, label }) => {
        const hora = times[key] || "";
        const furnTotals = new Map<string, number>();
        const itemRow = (it: {
          codigo: string;
          nombre: string;
          quantity?: number;
        }) => {
            const id = resolveVarId(it.codigo, it.nombre);
            const lines =
              id !== undefined ? ctx.byService.get(`variable-${id}`) : undefined;
            const porciones = personas * (it.quantity || 1);
            let receta = "";
            if (lines?.length) {
              const parts: string[] = [];
              lines.forEach((line) => {
                if (line.item_kind === "insumo" && line.supply_id) {
                  const sup = ctx.supplyById.get(line.supply_id);
                  if (!sup) return;
                  // Bruta (neta + merma): lo que la cocina saca en crudo,
                  // coherente con el retiro de bodega y con Compras.
                  const base = grossQty(
                    toBaseQty(line.qty_per_person, line.unit) * porciones,
                    sup,
                  );
                  parts.push(
                    `${esc(sup.name.toLowerCase())} ${fmtQty(base)} ${UNIT_FAMILY_INFO[sup.unit_family].base}`,
                  );
                } else if (
                  line.item_kind === "mobiliario" &&
                  line.furniture_id
                ) {
                  const f = ctx.furnById.get(line.furniture_id);
                  if (!f) return;
                  furnTotals.set(
                    f.name,
                    (furnTotals.get(f.name) || 0) +
                      line.qty_per_person * porciones,
                  );
                }
              });
              receta = parts.join(" · ");
            }
            return `<tr><td class="plato">${esc(it.nombre)}</td><td class="qty">×${porciones.toLocaleString("es-CL")}</td></tr>${
              receta
                ? `<tr class="receta"><td colspan="2">Receta: ${receta}</td></tr>`
                : ""
            }`;
        };
        // Platos ordenados como la carta, con subtítulo de sección.
        const rows = orderItems(g.category, g.items || [])
          .map(
            (og) =>
              (og.name
                ? `<tr class="subseccion"><td colspan="2">${esc(og.name)}</td></tr>`
                : "") + og.items.map(itemRow).join(""),
          )
          .join("");
        const montar = [...furnTotals.entries()]
          .map(([name, q]) => `${Math.ceil(q).toLocaleString("es-CL")} ${esc(name.toLowerCase())}`)
          .join(" · ");
        return `<div class="servicio">
          <div class="servicio-head">${hora ? `<span class="hora">${esc(hora)}</span>` : ""}<h2>${esc(label)}</h2></div>
          <div class="platillo"><table class="preparar">${rows}</table></div>
          ${montar ? `<div class="mobiliario"><b>Montar:</b> ${montar}</div>` : ""}
        </div>`;
      })
      .join("");

    // Retiro de bodega de un conjunto de servicios (todo el evento o un día).
    const bodegaDe = (snapshot: EventItemsSnapshot) => {
      const acc = newAccumulator();
      consolidateEvent(snapshot, personas, ctx, acc);
      return [...acc.supplyTotals.values()]
        .sort((a, b) => b.totalBase * (b.supply.price || 0) - a.totalBase * (a.supply.price || 0))
        .map(
          (c) =>
            `<tr><td>${esc(c.supply.name)}</td><td class="qty">${fmtQty(c.totalBase)} ${UNIT_FAMILY_INFO[c.supply.unit_family].base}</td></tr>`,
        )
        .join("");
    };

    const notasDe = (list: KitchenNote[]) =>
      list.map((n) => `<li>${esc(n.note)}</li>`).join("");

    // Servicios fijos: nombre ×cant y, si su receta tiene mobiliario, la
    // línea "Montar: ..." en letra chica. Con etiqueta TODO EL EVENTO en
    // fichas multi-día.
    const fijosDe = (list: typeof fixedList, conTag: boolean) => list
      .map((it) => {
        const numericId = Number(it.codigo);
        let id: number | undefined =
          Number.isFinite(numericId) && ctx.byService.get(`fixed-${numericId}`)
            ? numericId
            : nameIds.fixed[it.nombre.trim().toLowerCase()];
        if (id === undefined && Number.isFinite(numericId)) id = numericId;
        const lines =
          id !== undefined ? ctx.byService.get(`fixed-${id}`) : undefined;
        const qty = it.quantity || 1;
        const furn = new Map<string, number>();
        lines?.forEach((line) => {
          if (line.item_kind === "mobiliario" && line.furniture_id) {
            const f = ctx.furnById.get(line.furniture_id);
            if (f) {
              furn.set(
                f.name,
                (furn.get(f.name) || 0) + line.qty_per_person * personas * qty,
              );
            }
          }
        });
        const montar = [...furn.entries()]
          .map(
            ([n, q]) =>
              `${Math.ceil(q).toLocaleString("es-CL")} ${esc(n.toLowerCase())}`,
          )
          .join(" · ");
        const tag =
          conTag && fixedDayOf(it) === 0
            ? ` <span class="tageva">todo el evento</span>`
            : "";
        return `<tr><td class="fnombre">${esc(it.nombre)}${tag}</td><td class="qty">×${qty}</td></tr>${
          montar
            ? `<tr class="fmontar"><td colspan="2">Montar: ${montar}</td></tr>`
            : ""
        }`;
      })
      .join("");

    const clientName =
      (quote as unknown as { clients?: { name?: string } }).clients?.name ||
      "";
    const fmtLarga = (d: Date) =>
      d.toLocaleDateString("es-CL", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    const generada = new Date().toLocaleString("es-CL");

    // Una página completa de ficha (evento de un día = una sola página;
    // multi-día = una página por día seleccionado).
    const paginaDe = (
      fechaTxt: string,
      bloques: string,
      bodega: string,
      tituloBodega: string,
      notas: string,
      fijos: string,
    ) => `<div class="hoja pagina">
  <div class="encabezado">
    <div><div class="marca">EVENTIA</div><h1>FICHA DE COCINA</h1></div>
    <div class="evento">
      <strong>Evento #${quote.quotation_number}${clientName ? ` · ${esc(clientName)}` : ""}</strong><br>
      ${esc(fechaTxt)}<br>
      <span class="personas">${personas.toLocaleString("es-CL")} personas</span>
    </div>
  </div>
  ${bloques || '<p style="margin-top:20px;color:#888">Sin servicios variables asignados.</p>'}
  ${
    bodega
      ? `<div class="seccion"><h2>${esc(tituloBodega)}</h2><table class="bodega">${bodega}</table></div>`
      : ""
  }
  ${
    notas
      ? `<div class="seccion notas"><h2>Notas</h2><ul>${notas}</ul></div>`
      : ""
  }
  ${
    fijos
      ? `<div class="seccion fijos"><h2>Servicios fijos</h2><table>${fijos}</table></div>`
      : ""
  }
  <div class="pie">
    <span>Generada el ${esc(generada)} · Eventia</span>
    <span>Si cambian personas, servicios o notas: volver a imprimir — la ficha siempre sale con los datos vigentes</span>
  </div>
</div>`;

    let paginas: string;
    let daysPrinted: number[] = [];
    if (!multiDay) {
      const fechaTxt = quote.event_date
        ? fmtLarga(new Date(quote.event_date))
        : "—";
      paginas = paginaDe(
        fechaTxt,
        bloquesDe(slots),
        bodegaDe(quote.items as EventItemsSnapshot),
        "Retiro de bodega — totales del evento",
        notasDe(notes),
        fijosDe(fixedList, false),
      );
    } else {
      // Días a imprimir: los marcados; sin marcar ninguno = todos.
      daysPrinted = checkedDays.size
        ? [...checkedDays].sort((a, b) => a - b)
        : [...allDays];
      paginas = daysPrinted
        .map((n) => {
          const snapshot = {
            variable_services: groups.filter(
              (_, i) => slotDay(slots[i]) === n,
            ),
            // el retiro de los fijos "todo el evento" se hace el día 1
            fixed_services: fixedList.filter(
              (f) =>
                fixedDayOf(f) === n || (n === 1 && fixedDayOf(f) === 0),
            ),
          } as EventItemsSnapshot;
          return paginaDe(
            `DÍA ${n} de ${daysCount} — ${fmtLargaUTC(dayDateStr(n))}`,
            bloquesDe(slotsForDay(n)),
            bodegaDe(snapshot),
            `Retiro de bodega — día ${n}`,
            notasDe(notesForDay(n)),
            fijosDe(fixedForDay(n), true),
          );
        })
        .join("");
    }

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Ficha de Cocina — Evento #${quote.quotation_number}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,'Segoe UI',Roboto,sans-serif; background:#e5e7eb; padding:24px; }
  .hoja { max-width:800px; margin:0 auto; background:#fff; padding:36px 44px; box-shadow:0 2px 12px rgba(0,0,0,.15); }
  .encabezado { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #1e3a8a; padding-bottom:12px; }
  .encabezado h1 { font-size:22px; letter-spacing:.5px; }
  .encabezado .marca { font-size:12px; color:#1e3a8a; font-weight:700; }
  .evento { text-align:right; font-size:13px; line-height:1.5; }
  .evento strong { font-size:16px; }
  .personas { display:inline-block; margin-top:4px; border:2px solid #1e3a8a; color:#1e3a8a; padding:2px 10px; font-size:18px; font-weight:800; }
  .servicio { margin-top:22px; border:1px solid #bbb; page-break-inside:avoid; }
  .servicio-head { display:flex; align-items:center; gap:12px; background:#1e3a8a; color:#fff; padding:7px 12px; }
  .hora { font-size:17px; font-weight:800; background:#fff; color:#1e3a8a; padding:1px 8px; border-radius:3px; }
  .servicio-head h2 { font-size:15px; text-transform:uppercase; letter-spacing:1px; }
  .platillo { padding:6px 14px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  td { padding:2.5px 6px; border-bottom:1px dotted #ccc; }
  td.qty { text-align:right; font-weight:700; white-space:nowrap; width:110px; }
  .preparar .plato { font-size:16px; font-weight:800; padding:7px 6px 2px; border-bottom:none; }
  .preparar .qty { font-size:16px; vertical-align:bottom; border-bottom:none; }
  .preparar .receta td { font-size:11.5px; color:#777; padding:0 6px 7px; border-bottom:1px solid #e5e5e5; }
  .preparar .subseccion td { font-size:10.5px; font-weight:800; letter-spacing:1.5px; color:#1e3a8a; text-transform:uppercase; padding:10px 6px 1px; border-bottom:1.5px solid #1e3a8a; }
  .mobiliario { padding:8px 14px; background:#eff6ff; border-top:1px solid #dbeafe; font-size:12.5px; color:#1e3a8a; }
  .mobiliario b { text-transform:uppercase; font-size:11px; letter-spacing:.5px; }
  .seccion { margin-top:24px; page-break-inside:avoid; }
  .seccion > h2 { font-size:14px; text-transform:uppercase; letter-spacing:1px; border-bottom:2px solid #1e3a8a; color:#1e3a8a; padding-bottom:4px; margin-bottom:8px; }
  .bodega td:first-child { font-weight:600; }
  .notas > h2 { border-bottom-color:#d97706; color:#92400e; }
  .notas ul { list-style:none; background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:6px 10px; }
  .notas li { font-size:13.5px; padding:5px 0 5px 22px; border-bottom:1px dotted #ccc; position:relative; }
  .notas li:last-child { border-bottom:none; }
  .notas li::before { content:"\\25A0"; position:absolute; left:2px; color:#d97706; font-size:10px; top:8px; }
  .fijos .fnombre { font-weight:700; font-size:13.5px; }
  .fijos .fmontar td { font-size:11.5px; color:#777; padding:0 6px 6px; border-bottom:1px solid #e5e5e5; }
  .pie { margin-top:26px; display:flex; justify-content:space-between; font-size:10.5px; color:#888; border-top:1px solid #ddd; padding-top:8px; }
  .pagina { page-break-after:always; margin-bottom:26px; }
  .pagina:last-child { page-break-after:auto; margin-bottom:0; }
  .tageva { font-size:9.5px; font-weight:800; text-transform:uppercase; color:#6b7280; background:#e5e7eb; border-radius:999px; padding:1px 7px; letter-spacing:.5px; }
  .btn-imprimir { position:fixed; top:14px; right:14px; background:#1e3a8a; color:#fff; border:none; border-radius:8px; padding:10px 18px; font-size:14px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.25); }
  @media print {
    body { background:#fff; padding:0; }
    .hoja { box-shadow:none; padding:10mm 12mm; max-width:none; }
    .btn-imprimir { display:none; }
  }
</style></head><body>
<button class="btn-imprimir" onclick="window.print()">Imprimir / PDF</button>
${paginas}
</body></html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();

    // Registrar las fichas impresas por día (verde suave en el desplegable).
    if (multiDay && daysPrinted.length > 0) {
      markEventDaysPrinted(companyId, quotationId, daysPrinted).then(
        async () =>
          setDayPrints(await getEventDayPrints(companyId, quotationId)),
      );
    }
  };

  // Tarjeta de vista previa de un servicio: horario editable + platos por
  // sección con porciones. Se usa en la vista simple y dentro de cada día.
  const slotCard = (s: (typeof slots)[number]) => (
    <div
      key={s.key}
      className="border border-gray-200 rounded-lg overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 bg-blue-900 text-white px-3 py-1.5">
        <span className="text-xs font-bold uppercase tracking-wide truncate">
          {s.label}
        </span>
        <input
          type="time"
          value={times[s.key] || ""}
          onChange={(e) => saveTime(s.key, e.target.value)}
          className="border-0 rounded px-1.5 py-0.5 text-xs font-bold text-blue-900 bg-white"
          aria-label={`Horario de ${s.label}`}
        />
      </div>
      <div className="px-3 py-1">
        {orderItems(s.group.category, s.group.items || []).map((og, gi) => (
          <div key={og.name ?? `g-${gi}`}>
            {og.name && (
              <div className="pt-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-900 border-b border-blue-900/25">
                {og.name}
              </div>
            )}
            {og.items.map((it) => (
              <div
                key={it.codigo}
                className="flex items-center justify-between gap-2 py-1 text-sm border-b border-gray-100 last:border-b-0"
              >
                <span className="text-gray-800 truncate">{it.nombre}</span>
                <span className="font-bold text-gray-900 shrink-0">
                  ×{(personas * (it.quantity || 1)).toLocaleString("es-CL")}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );

  // Retiro de bodega de un día (para el cuadro en pantalla).
  const dayBodegaTotals = (n: number) => {
    const snapshot = {
      variable_services: groups.filter((_, i) => slotDay(slots[i]) === n),
      fixed_services: fixedList.filter(
        (f) => fixedDayOf(f) === n || (n === 1 && fixedDayOf(f) === 0),
      ),
    } as EventItemsSnapshot;
    const acc = newAccumulator();
    consolidateEvent(snapshot, personas, ctx, acc);
    return [...acc.supplyTotals.values()].sort(
      (a, b) =>
        b.totalBase * (b.supply.price || 0) -
        a.totalBase * (a.supply.price || 0),
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChefHat size={17} className="text-gray-600" />
          <h4 className="text-base font-bold text-gray-900">
            Ficha de cocina
          </h4>
          {saved && (
            <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
              <Check size={13} /> Guardado
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={openFicha}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-900 text-white rounded-lg text-sm font-semibold hover:bg-blue-800"
        >
          <Printer size={15} /> Imprimir
        </button>
      </div>
      <p className="text-xs text-gray-500 -mt-1">
        {multiDay
          ? `Evento de ${daysCount} días. Marca los días que quieres imprimir (sin marcar ninguno se imprime todo); sale una página por día, siempre con los datos vigentes.`
          : "Ponle horario a cada servicio y revisa el contenido; la ficha se imprime siempre con los datos vigentes: cambió algo → volver a imprimir."}
      </p>

      {!multiDay ? (
        <>
          {/* ---- Evento de un día: vista de siempre ---- */}
          {slots.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {slots.map(slotCard)}
            </div>
          )}

          {fixedList.length > 0 && (
            <p className="text-xs text-gray-500">
              Servicios fijos:{" "}
              {fixedList
                .map((f) => `${f.nombre} ×${f.quantity || 1}`)
                .join(" · ")}
            </p>
          )}

          <div className="flex items-center gap-2">
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addNote();
              }}
              placeholder="Agregar nota (ej: 2 alérgicos al maní, carne a punto…)"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={addNote}
              disabled={!newNote.trim()}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-40"
            >
              + Agregar
            </button>
          </div>
          {notes.length > 0 && (
            <ul className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 divide-y divide-amber-100">
              {notes.map((n) => (
                <li
                  key={n.id}
                  className="flex items-center justify-between gap-2 py-1.5 text-sm text-gray-800"
                >
                  <span>
                    <span className="text-amber-600 mr-1.5">■</span>
                    {n.note}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeNote(n.id)}
                    className="text-gray-300 hover:text-red-500 shrink-0"
                    aria-label="Eliminar nota"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          {/* ---- Multi-día: cada día es un desplegable autocontenido ---- */}
          {allDays.map((n) => {
            const st = dayState(n);
            const printed = Boolean(dayPrints[n]);
            const open = isDayOpen(n);
            const daySlots = slotsForDay(n);
            const borderCls =
              st === "hoy"
                ? "border-2 border-blue-900"
                : printed
                  ? "border border-emerald-200"
                  : "border border-gray-200";
            const headCls =
              st === "hoy"
                ? "bg-blue-900"
                : printed
                  ? "bg-emerald-50"
                  : "bg-gray-50";
            const titleCls =
              st === "hoy"
                ? "text-white"
                : printed
                  ? "text-emerald-700"
                  : st === "pasado"
                    ? "text-gray-400"
                    : "text-gray-700";
            return (
              <div
                key={n}
                className={`rounded-xl overflow-hidden ${borderCls}`}
              >
                <div
                  className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer ${headCls}`}
                  onClick={() => toggleDay(n)}
                >
                  <input
                    type="checkbox"
                    checked={checkedDays.has(n)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleChecked(n)}
                    className="w-4 h-4 accent-blue-900"
                    aria-label={`Incluir día ${n} en la impresión`}
                  />
                  {st === "hoy" && (
                    <span className="bg-amber-400 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wide">
                      HOY
                    </span>
                  )}
                  <span className={`text-sm font-bold ${titleCls}`}>
                    DÍA {n} — {fmtLargaUTC(dayDateStr(n))}
                  </span>
                  <span
                    className={`ml-auto flex items-center gap-1 text-xs ${
                      st === "hoy" ? "text-blue-200" : "text-gray-400"
                    }`}
                  >
                    {printed && st !== "hoy" ? "ficha impresa" : ""}
                    {open ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                  </span>
                </div>

                {open && (
                  <div className="p-3 space-y-2.5">
                    {daySlots.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {daySlots.map(slotCard)}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">
                        Sin servicios variables asignados a este día.
                      </p>
                    )}

                    {/* Retiro de bodega del día */}
                    {(() => {
                      const rows = dayBodegaTotals(n);
                      if (rows.length === 0) return null;
                      return (
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                          <div className="bg-gray-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-600">
                            Retiro de bodega — día {n}
                          </div>
                          <div className="px-3 py-1">
                            {rows.map((c) => (
                              <div
                                key={c.supply.id}
                                className="flex items-center justify-between gap-2 py-0.5 text-sm border-b border-gray-50 last:border-b-0"
                              >
                                <span className="text-gray-800">
                                  {c.supply.name}
                                </span>
                                <span className="font-bold text-gray-900 shrink-0">
                                  {fmtQty(c.totalBase)}{" "}
                                  {UNIT_FAMILY_INFO[c.supply.unit_family].base}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Servicios fijos del día */}
                    {fixedForDay(n).length > 0 && (
                      <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5 text-sm text-blue-900">
                        <span className="text-[10px] font-bold uppercase tracking-wide mr-1">
                          Servicios fijos de este día:
                        </span>
                        {fixedForDay(n).map((f, i) => (
                          <span key={`${f.codigo}-${i}`}>
                            {i > 0 && " · "}
                            {f.nombre} ×{f.quantity || 1}
                            {fixedDayOf(f) === 0 && (
                              <span className="ml-1 text-[9px] font-bold uppercase text-gray-500 bg-gray-200 rounded-full px-1.5 py-0.5">
                                todo el evento
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Notas del día */}
                    {notesForDay(n).length > 0 && (
                      <ul className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1 divide-y divide-amber-100">
                        {notesForDay(n).map((x) => (
                          <li
                            key={x.id}
                            className="flex items-center justify-between gap-2 py-1.5 text-sm text-gray-800"
                          >
                            <span>
                              <span className="text-amber-600 mr-1.5">■</span>
                              {x.note}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeNote(x.id)}
                              className="text-gray-300 hover:text-red-500 shrink-0"
                              aria-label="Eliminar nota"
                            >
                              <X size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex items-center gap-2">
                      <input
                        value={noteDrafts[n] || ""}
                        onChange={(e) =>
                          setNoteDrafts((prev) => ({
                            ...prev,
                            [n]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addNoteDay(n);
                        }}
                        placeholder={`Agregar nota del día ${n}…`}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => addNoteDay(n)}
                        disabled={!(noteDrafts[n] || "").trim()}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-40"
                      >
                        + Agregar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
