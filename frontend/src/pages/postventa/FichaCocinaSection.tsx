import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  ChefHat,
  ChevronDown,
  ChevronRight,
  Printer,
  X,
} from "lucide-react";
import { Quotation } from "../../types/quotations.types";
import { useAuth } from "../../contexts/AuthContext";
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
import { canonicalServiceName } from "../../utils/searchMatch";
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
  const { company } = useAuth();
  const quotationId = String(quote.id);
  const [times, setTimes] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<KitchenNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [saved, setSaved] = useState(false);

  // Carga vía React Query (Etapa 5): reabrir la cocina del mismo evento
  // es instantáneo. Las horas/notas son superficie de EDICIÓN, así que
  // se copian al estado local UNA VEZ por evento — los refrescos en
  // segundo plano no pisan lo que se esté escribiendo.
  const cocinaQuery = useQuery({
    queryKey: ["postventa", "cocina", companyId, quotationId],
    staleTime: 0,
    queryFn: async () => {
      const [t, n, dp] = await Promise.all([
        getEventServiceTimes(companyId, quotationId),
        getEventKitchenNotes(companyId, quotationId),
        getEventDayPrints(companyId, quotationId),
      ]);
      return { times: t, notes: n, dayPrints: dp };
    },
  });
  const cocinaLoaded = !!cocinaQuery.data;
  useEffect(() => {
    if (cocinaQuery.data) {
      setTimes(cocinaQuery.data.times);
      setNotes(cocinaQuery.data.notes);
      setDayPrints(cocinaQuery.data.dayPrints);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotationId, cocinaLoaded]);

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const personas = quote.people_count || 0;
  const kids = Number(quote.children_count || 0);
  const adults = Math.max(0, personas - kids);
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
      // Audiencia visible solo cuando el evento tiene niños; la clave (key)
      // NO cambia para no perder las horas ya guardadas por servicio.
      const aud = (g as { audience?: string }).audience;
      const audTag =
        kids > 0 && aud ? (aud === "ninos" ? " · Niños" : " · Adultos") : "";
      return {
        group: g,
        key: n === 1 ? g.category : `${g.category}#${n}`,
        label: (repeated ? `${g.category} (${n}º)` : g.category) + audTag,
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
  const notesForDay = (n: number) => notes.filter((x) => (x.day ?? 1) === n);

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
    () => buildConsolidationContext(recipes, supplies, furniture, nameIds, {}),
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
    return nameIds.variable[canonicalServiceName(nombre)];
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
    return nameIds.variable[canonicalServiceName(nombre)];
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
      (c) => c.name.trim().toLowerCase() === categoryName.trim().toLowerCase(),
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
    const bloquesDe = (slotList: typeof slots) =>
      slotList
        .map(({ group: g, key, label }) => {
          const hora = times[key] || "";
          // Personas de ESTE servicio (audiencia niños/adultos o ajuste
          // manual del cotizador); cotizaciones antiguas = total del evento.
          const groupPeople = (g as { people?: number }).people ?? personas;
          const itemRow = (it: {
            codigo: string;
            nombre: string;
            quantity?: number;
          }) => {
            const id = resolveVarId(it.codigo, it.nombre);
            const lines =
              id !== undefined
                ? ctx.byService.get(`variable-${id}`)
                : undefined;
            const porciones = groupPeople * (it.quantity || 1);
            let receta = "";
            let montar = "";
            if (lines?.length) {
              const parts: string[] = [];
              const furn: string[] = [];
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
                  furn.push(
                    `${Math.ceil(line.qty_per_person * porciones).toLocaleString("es-CL")} ${esc(f.name.toLowerCase())}`,
                  );
                }
              });
              receta = parts.join(" · ");
              montar = furn.join(" · ");
            }
            // El mobiliario del plato va en su propia línea azul bajo la
            // receta; la última línea del plato lleva el borde separador.
            return `<tr><td class="plato">${esc(it.nombre)}</td><td class="qty">×${porciones.toLocaleString("es-CL")}</td></tr>${
              receta
                ? `<tr class="receta${montar ? "" : " soloreceta"}"><td colspan="2">Receta: ${receta}</td></tr>`
                : ""
            }${
              montar
                ? `<tr class="montar"><td colspan="2">Montar: ${montar}</td></tr>`
                : ""
            }`;
          };
          // Platos ordenados como la carta, con subtítulo de sección.
          const rows = orderItems(g.category, g.items || [])
            .map(
              (og) =>
                (og.name
                  ? `<tr class="subsec"><td colspan="2">${esc(og.name)}</td></tr>`
                  : "") + og.items.map(itemRow).join(""),
            )
            .join("");
          return `<div class="servicio">
          <div class="svc-head"><span class="hora">${hora ? esc(hora) : "—"}</span><h3>${esc(label)}</h3><span class="svc-pers">${groupPeople.toLocaleString("es-CL")} personas</span></div>
          <table class="platos">${rows}</table>
        </div>`;
        })
        .join("");

    // Retiro de bodega de un conjunto de servicios (todo el evento o un día).
    const bodegaDe = (snapshot: EventItemsSnapshot) => {
      const acc = newAccumulator();
      consolidateEvent(snapshot, personas, ctx, acc);
      return [...acc.supplyTotals.values()]
        .sort(
          (a, b) =>
            b.totalBase * (b.supply.price || 0) -
            a.totalBase * (a.supply.price || 0),
        )
        .map(
          (c) =>
            `<tr><td class="chk"><span></span></td><td>${esc(c.supply.name)}</td><td class="der">${fmtQty(c.totalBase)} ${UNIT_FAMILY_INFO[c.supply.unit_family].base}</td></tr>`,
        )
        .join("");
    };

    // Resumen de mobiliario (hermano de bodega): cada mueble con su
    // necesidad total. Reutilizable → máximo simultáneo entre servicios;
    // preparación anticipada → suma (regla del catálogo de Mobiliario).
    const mobiliarioDe = (snapshot: EventItemsSnapshot) => {
      const acc = newAccumulator();
      const r = consolidateEvent(snapshot, personas, ctx, acc);
      return [...r.furnPeak.entries()]
        .map(([itemId, p]) => ({ item: ctx.furnById.get(itemId), p }))
        .filter((x): x is { item: FurnitureItem; p: typeof x.p } => !!x.item)
        .sort((a, b) => a.item.name.localeCompare(b.item.name))
        .map(
          ({ item, p }) =>
            `<tr><td class="chk"><span></span></td><td>${esc(item.name)}${
              p.preassembled
                ? ` <span class="nota">se prepara con anticipación · suma</span>`
                : p.peakService
                  ? ` <span class="nota">peak en ${esc(p.peakService)}</span>`
                  : ""
            }</td><td class="der">${Math.ceil(p.total).toLocaleString("es-CL")} u</td></tr>`,
        )
        .join("");
    };

    const notasDe = (list: KitchenNote[]) =>
      list.map((n) => `<li>${esc(n.note)}</li>`).join("");

    // Servicios fijos: nombre ×cant y, si su receta tiene mobiliario, la
    // línea "Montar: ..." en letra chica. Con etiqueta TODO EL EVENTO en
    // fichas multi-día.
    const fijosDe = (list: typeof fixedList, conTag: boolean) =>
      list
        .map((it) => {
          const numericId = Number(it.codigo);
          let id: number | undefined =
            Number.isFinite(numericId) &&
            ctx.byService.get(`fixed-${numericId}`)
              ? numericId
              : nameIds.fixed[canonicalServiceName(it.nombre)];
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
                  (furn.get(f.name) || 0) +
                    line.qty_per_person * personas * qty,
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
          return `<tr><td class="chk"><span></span></td><td>${esc(it.nombre)}${tag}</td><td class="der">×${qty}</td></tr>${
            montar
              ? `<tr class="fmontar"><td colspan="3">Montar: ${montar}</td></tr>`
              : ""
          }`;
        })
        .join("");

    const clientName =
      (quote as unknown as { clients?: { name?: string } }).clients?.name || "";
    const mandante =
      (
        quote as unknown as { contact_name?: string | null }
      ).contact_name?.trim() || "";

    // Marca de la empresa (mismo lenguaje del PDF a cliente): colores
    // configurados y logo; sin logo, iniciales sobre el color primario.
    const hexOk = (c?: string) =>
      c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : null;
    const brandP = hexOk(company?.colors?.primary) || "#1e3a8a";
    const brandS = hexOk(company?.colors?.secondary) || "#eef2ff";
    const onBrandP = (() => {
      const n = parseInt(brandP.slice(1), 16);
      const lum =
        (0.299 * ((n >> 16) & 255) +
          0.587 * ((n >> 8) & 255) +
          0.114 * (n & 255)) /
        255;
      return lum > 0.6 ? "#111827" : "#fff";
    })();
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
      mobiliario: string,
      tituloMob: string,
    ) => `<div class="hoja pagina">
  <div class="head">
    <div class="marca">
      <div class="logo">${logoHtml}</div>
      <div>
        <h1>${esc(company?.name || "Eventia")}</h1>
        <div class="sub">Documento operativo — uso interno de cocina</div>
      </div>
    </div>
    <div class="folio">
      <div class="tipo">Ficha de Cocina</div>
      <div class="num">Evento #${quote.quotation_number}</div>
      <div class="fecha">${esc(fechaTxt)}</div>
    </div>
  </div>
  <div class="datos">
    <div class="dato"><div class="k">Cliente</div><div class="v">${esc(clientName || "—")}</div></div>
    <div class="dato"><div class="k">Contacto</div><div class="v">${esc(mandante || "—")}</div></div>
    <div class="dato"><div class="k">Personas</div><div class="v big">${personas.toLocaleString("es-CL")}</div></div>
    <div class="dato"><div class="k">Detalle</div><div class="v">${adults.toLocaleString("es-CL")} adultos<br><small>${kids.toLocaleString("es-CL")} niños</small></div></div>
  </div>
  <h2 class="seccion">Servicios del día</h2>
  ${bloques || '<p style="margin-top:8px;color:#888;font-size:13px">Sin servicios variables asignados.</p>'}
  <div class="dos-col">
    <div>${
      bodega
        ? `<h2 class="seccion">${esc(tituloBodega)}</h2><table class="tabla">${bodega}</table>`
        : ""
    }</div>
    <div>
      ${
        mobiliario
          ? `<h2 class="seccion">${esc(tituloMob)}</h2><table class="tabla">${mobiliario}</table>`
          : ""
      }
      ${
        fijos
          ? `<h2 class="seccion">Servicios fijos</h2><table class="tabla fijos">${fijos}</table>`
          : ""
      }
    </div>
  </div>
  ${
    notas
      ? `<h2 class="seccion">Notas del evento</h2><div class="notas"><b>Cocina — leer antes de partir</b><ul>${notas}</ul></div>`
      : ""
  }
  <div class="pie">
    <span>Generada el ${esc(generada)} · ${esc(company?.name || "Eventia")}</span>
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
        mobiliarioDe(quote.items as EventItemsSnapshot),
        "Mobiliario — totales del evento",
      );
    } else {
      // Días a imprimir: los marcados; sin marcar ninguno = todos.
      daysPrinted = checkedDays.size
        ? [...checkedDays].sort((a, b) => a - b)
        : [...allDays];
      paginas = daysPrinted
        .map((n) => {
          const snapshot = {
            variable_services: groups.filter((_, i) => slotDay(slots[i]) === n),
            // el retiro de los fijos "todo el evento" se hace el día 1
            fixed_services: fixedList.filter(
              (f) => fixedDayOf(f) === n || (n === 1 && fixedDayOf(f) === 0),
            ),
          } as EventItemsSnapshot;
          return paginaDe(
            `DÍA ${n} de ${daysCount} — ${fmtLargaUTC(dayDateStr(n))}`,
            bloquesDe(slotsForDay(n)),
            bodegaDe(snapshot),
            `Retiro de bodega — día ${n}`,
            notasDe(notesForDay(n)),
            fijosDe(fixedForDay(n), true),
            mobiliarioDe(snapshot),
            `Mobiliario — día ${n}`,
          );
        })
        .join("");
    }

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Ficha de Cocina — Evento #${quote.quotation_number}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,'Segoe UI',Roboto,sans-serif; background:#e5e7eb; padding:24px; color:#111827; }
  .hoja { max-width:800px; margin:0 auto; background:#fff; padding:44px 52px; box-shadow:0 2px 12px rgba(0,0,0,.15); }

  /* ===== Encabezado (mismo lenguaje que el PDF a cliente) ===== */
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid ${brandP}; padding-bottom:16px; }
  .marca { display:flex; gap:12px; align-items:center; }
  .logo { width:64px; height:64px; border-radius:50%; background:${brandP}; color:${onBrandP}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:24px; overflow:hidden; }
  .logo img { width:100%; height:100%; object-fit:cover; }
  .marca h1 { font-size:17px; }
  .marca .sub { font-size:10.5px; color:#6b7280; margin-top:1px; }
  .folio { text-align:right; }
  .folio .tipo { font-size:11px; font-weight:800; letter-spacing:2px; color:${brandP}; text-transform:uppercase; }
  .folio .num { font-size:24px; font-weight:800; }
  .folio .fecha { font-size:11px; color:#6b7280; margin-top:2px; }

  /* ===== Datos del evento en grilla ===== */
  .datos { display:grid; grid-template-columns:1.4fr 1.2fr .8fr .8fr; gap:12px 22px; padding:14px 0; border-bottom:1px solid #e5e7eb; }
  .dato .k { font-size:9.5px; font-weight:800; letter-spacing:1px; color:#9ca3af; text-transform:uppercase; }
  .dato .v { font-size:13px; font-weight:600; margin-top:1px; }
  .dato .v small { font-weight:400; color:#6b7280; }
  .dato .v.big { font-size:16px; font-weight:800; color:${brandP}; }

  h2.seccion { font-size:11px; font-weight:800; letter-spacing:1.6px; text-transform:uppercase; color:${brandP}; margin:24px 0 8px; display:flex; align-items:center; gap:8px; }
  h2.seccion::after { content:""; flex:1; border-top:1px solid #e5e7eb; }

  /* ===== Bloque de servicio: franja suave, hora como chip ===== */
  .servicio { margin-bottom:14px; page-break-inside:avoid; }
  .svc-head { display:flex; align-items:center; gap:10px; background:${brandS}; border-radius:8px; padding:7px 12px; }
  .hora { font-size:15px; font-weight:800; background:${brandP}; color:${onBrandP}; padding:2px 10px; border-radius:6px; }
  .svc-head h3 { font-size:13px; font-weight:800; letter-spacing:.6px; text-transform:uppercase; color:${brandP}; }
  .svc-pers { margin-left:auto; font-size:12px; font-weight:700; color:#374151; }

  .platos { width:100%; border-collapse:collapse; margin-top:2px; }
  .platos td { padding:6px 10px 2px; }
  .platos .subsec td { font-size:9.5px; font-weight:800; letter-spacing:1.4px; color:#9ca3af; text-transform:uppercase; padding:10px 10px 2px; border-bottom:1px solid #e5e7eb; }
  .platos .plato { font-size:14.5px; font-weight:700; }
  .platos .qty { text-align:right; font-size:15px; font-weight:800; white-space:nowrap; width:80px; vertical-align:top; }
  .platos .receta td { font-size:11px; color:#6b7280; padding:0 10px 2px; }
  .platos .receta.soloreceta td { padding-bottom:7px; border-bottom:1px solid #f3f4f6; }
  .platos .montar td { font-size:11px; font-weight:600; color:${brandP}; padding:0 10px 7px; border-bottom:1px solid #f3f4f6; }
  .platos tr:last-child td { border-bottom:none; }

  /* ===== Bodega / Mobiliario / Fijos: tablas finas con check ===== */
  .chk { width:26px; }
  .chk span { display:inline-block; width:13px; height:13px; border:1.5px solid #9ca3af; border-radius:3px; vertical-align:middle; }
  .tabla { width:100%; border-collapse:collapse; }
  .tabla td { font-size:12.5px; padding:5px 10px 5px 0; border-bottom:1px solid #f3f4f6; }
  .tabla td.chk { padding-left:2px; }
  .tabla td:nth-child(2) { font-weight:600; }
  .tabla .der { text-align:right; white-space:nowrap; font-weight:700; }
  .tabla .nota { font-weight:400; font-size:10.5px; color:#9ca3af; }
  .fijos .fmontar td { font-weight:600; font-size:11px; color:${brandP}; padding:0 10px 7px 28px; border-bottom:1px solid #f3f4f6; }
  .dos-col { display:grid; grid-template-columns:1fr 1fr; gap:0 28px; align-items:start; }

  /* ===== Notas ===== */
  .notas { background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:10px 14px; }
  .notas b { display:block; font-size:10px; letter-spacing:1px; text-transform:uppercase; color:#b45309; margin-bottom:4px; }
  .notas ul { list-style:none; }
  .notas li { font-size:13px; padding:3px 0 3px 16px; position:relative; }
  .notas li::before { content:"\\25A0"; position:absolute; left:0; color:#d97706; font-size:9px; top:7px; }

  .tageva { font-size:9.5px; font-weight:800; text-transform:uppercase; color:#6b7280; background:#e5e7eb; border-radius:999px; padding:1px 7px; letter-spacing:.5px; }
  .pie { margin-top:26px; border-top:1px solid #e5e7eb; padding-top:10px; font-size:10.5px; color:#9ca3af; display:flex; justify-content:space-between; }
  .pagina { page-break-after:always; margin-bottom:26px; }
  .pagina:last-child { page-break-after:auto; margin-bottom:0; }
  .btn-imprimir { position:fixed; top:14px; right:14px; background:${brandP}; color:${onBrandP}; border:none; border-radius:8px; padding:10px 18px; font-size:14px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.25); }

  /* Los colores se respetan al imprimir/PDF (sin esto el navegador borra
     los fondos en modo ahorro de tinta y la ficha sale lavada). */
  .hoja, .hoja * { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  @media print {
    @page { margin:12mm; }
    body { background:#fff; padding:0; }
    .hoja { box-shadow:none; padding:0; max-width:none; }
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
      markEventDaysPrinted(companyId, quotationId, daysPrinted).then(async () =>
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
                  ×
                  {(
                    ((s.group as { people?: number }).people ?? personas) *
                    (it.quantity || 1)
                  ).toLocaleString("es-CL")}
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
          <h4 className="text-base font-bold text-gray-900">Ficha de cocina</h4>
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
