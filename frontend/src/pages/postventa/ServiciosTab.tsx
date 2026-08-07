// ---- Pestaña Servicios (mudanza 04-08): antes vivía dentro de
// PostVentaPage.tsx. La montan Post-Venta Y la ficha del negocio
// (NegocioPage), por eso ahora es un archivo propio. Comportamiento
// idéntico: solo se mudó el código, con sus imports.
import { useState, useEffect, useMemo, useRef } from "react";
import { computeMoney, resolveFixedServicePrice } from "@dinero";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, X, Trash2, Lock } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import ConfirmInline from "../../components/ConfirmInline";
import { updateQuotation } from "../../services/quotations.service";
import { Quotation } from "../../types/quotations.types";
import { NumberInput } from "../../components/inputs";
import { getFixedSections } from "../../services/services.service";
import { getCategorySections } from "../../services/sections.service";
import { useServices } from "../../hooks/useServices";
import { CategorySection } from "../../types/services.types";
// Margen en Servicios (04-08, porte del cotizador): la misma despensa
// compartida de logística y la misma máquina de consolidación.
import { useBaseLogistica } from "../../hooks/useBaseLogistica";
import { canonicalServiceName } from "../../utils/searchMatch";
import { buscarCategoria, nombreVigente } from "../../utils/categoriaCaja";
import {
  buildConsolidationContext,
  consolidateEvent,
  newAccumulator,
  type EventItemsSnapshot,
} from "../../utils/eventConsolidation";
import { UserRole } from "../../constants/users";
import QuantitySelector from "../../components/QuantitySelector";
import SectionChipSelect from "../../components/selects/SectionChipSelect";
import { matchesSearch } from "../../utils/searchMatch";
import { verEnLista } from "../../utils/verEnLista";
import { getQuotationProvisioning } from "../../services/logistics.service";
// El formateador de pesos vive en la página madre y se comparte con el
// resto de Post-Venta; acá solo se importa.
import { clp } from "./PostVentaPage";

// ---- Servicios tab (editable: personas, servicios, descuento % / $, comentarios) ----
const deep = (x: any) => JSON.parse(JSON.stringify(x || []));
export default function ServiciosTab({
  quote,
  paidAmount,
  onSaved,
}: {
  readonly quote: Quotation;
  readonly paidAmount: number;
  readonly onSaved: () => void;
}) {
  // Contadores de la cotización: total = adultos + niños (Cotizador 2.0).
  const initKids = Number(quote.children_count || 0);
  const initAdults = Math.max(0, Number(quote.people_count || 0) - initKids);
  const multiDia = Boolean(
    quote.event_end_date &&
      String(quote.event_end_date).slice(0, 10) !==
        String(quote.event_date).slice(0, 10),
  );
  const [varGroups, setVarGroups] = useState<any[]>(() =>
    deep(quote.items?.variable_services).map((g: any) => ({
      ...g,
      // Fotos muy antiguas pueden traer category null: normalizada a
      // "" el selector queda HABILITADO (elegible) en vez de muerto.
      category: g.category || "",
      // people igual a su audiencia al cargar = "automático": sigue al
      // contador si este cambia. Distinto = ajuste manual, se respeta.
      people:
        typeof g.people === "number" &&
        g.people !== (g.audience === "ninos" ? initKids : initAdults)
          ? g.people
          : undefined,
    })),
  );
  const [fixed, setFixed] = useState<any[]>(() =>
    // Filas fantasma de fotos antiguas (fijo sin código/nombre que el
    // cotizador viejo guardaba con el selector pendiente — pillada
    // Felipe 04-08 en la #436): se ignoran al cargar, y al primer
    // guardado la cotización queda limpia para siempre.
    deep(quote.items?.fixed_services).filter((f: any) => f?.codigo),
  );
  const [adultsN, setAdultsN] = useState<number>(initAdults);
  const [kidsN, setKidsN] = useState<number>(initKids);
  const personas = adultsN + kidsN;
  // Provisión: si el evento ya se compró, advertir cambios y restringir
  // la baja de personas a administradores.
  const { userRole, company } = useAuth();
  const [provInfo, setProvInfo] = useState<{
    provisioned_at: string | null;
    provisioned_people: number | null;
  }>({ provisioned_at: null, provisioned_people: null });
  useEffect(() => {
    getQuotationProvisioning(String(quote.id))
      .then((p) =>
        setProvInfo({
          provisioned_at: p.provisioned_at,
          provisioned_people: p.provisioned_people,
        }),
      )
      .catch(() => {});
  }, [quote.id]);
  const initDiscAmount = quote.discount_amount || 0;
  const [discType, setDiscType] = useState<"%" | "$">(
    initDiscAmount > 0 ? "$" : "%",
  );
  const [discVal, setDiscVal] = useState<number>(
    initDiscAmount > 0 ? initDiscAmount : quote.discount_percentage || 0,
  );
  // Propina editable (04-08, pedido de Felipe): mismo interruptor del
  // cotizador — el checkbox activa/desactiva tip_percentage. Parte de lo
  // guardado en la cotización; 10% es el arranque del cotizador para una
  // propina nueva.
  const [tipEnabled, setTipEnabled] = useState<boolean>(
    quote.tip_percentage != null,
  );
  const [tipPct, setTipPct] = useState<number>(quote.tip_percentage ?? 10);
  const [obs, setObs] = useState<string>(quote.observations || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Aviso transparente del reajuste del plan de pagos tras guardar.
  const [notice, setNotice] = useState<{
    tone: "up" | "down" | "refund";
    title: string;
    text: string;
  } | null>(null);

  // Catálogo del sistema vía useServices (04-08): el MISMO origen que el
  // cotizador — products ya ordenados por categoría/orden interno, fijos
  // con sección y orden, categorías ordenadas y vínculos con sección.
  const {
    products,
    fixedServices: fixedCatalog,
    orderedCategories,
    categoryLinks,
    inactiveCategories,
  } = useServices();
  const inactiveCategorySet = new Set(inactiveCategories);
  // Secciones de fijos y de categorías: mismas fuentes del cotizador.
  const { data: fixedSections = [] } = useQuery({
    queryKey: ["fixedSections"],
    queryFn: getFixedSections,
  });
  const [categorySections, setCategorySections] = useState<CategorySection[]>(
    [],
  );
  useEffect(() => {
    if (!company?.id) return;
    getCategorySections(Number(company.id)).then(setCategorySections);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);
  // Servicios de una categoría (una entrada por vínculo servicio-categoría)
  // y nombres de categoría en el orden del catálogo.
  const productsOf = (categoria: string) =>
    products.filter((p) => p.categoria === categoria);
  // La categoría del catálogo a la que apunta una caja: por id (foto
  // nueva) o por nombre (foto vieja). De ahí sale el nombre VIGENTE que
  // usan buscadores, secciones y fijos — así un renombre no rompe nada.
  const catDeCaja = (g: any) => buscarCategoria(orderedCategories, g);
  const nomCat = (g: any) => nombreVigente(orderedCategories, g);
  const catNames = [...new Set(products.map((p) => p.categoria || "General"))];
  // Posición y sección de un fijo según el catálogo (calco del cotizador):
  // el `codigo` guardado en la cotización es el id del catálogo en texto.
  const fixedOrderOf = (codigo: string): number => {
    const svc = fixedCatalog.find((f) => f.codigo === codigo);
    if (!svc) return Number.MAX_SAFE_INTEGER;
    const secIdx =
      svc.section_id != null
        ? fixedSections.findIndex((sec) => sec.id === svc.section_id)
        : -1;
    const secPos = secIdx >= 0 ? secIdx : fixedSections.length;
    return secPos * 100000 + (svc.sort_order ?? 99999);
  };
  const fixedSectionNameOf = (codigo: string): string => {
    const svc = fixedCatalog.find((f) => f.codigo === codigo);
    const sec =
      svc?.section_id != null
        ? fixedSections.find((x) => x.id === svc.section_id)
        : null;
    return sec ? sec.name : "Sin sección";
  };
  // Sección FIJA de una categoría (is_default, calco del cotizador): sus
  // servicios entran solos al crear la categoría y no se pueden quitar.
  // Ids de servicios de la sección fija de una categoría (por nombre).
  const defaultServiceIdsFor = (categoryName: string): number[] => {
    const cat = orderedCategories.find((c) => c.name === categoryName);
    if (!cat) return [];
    const sec = categorySections.find(
      (s) => s.category_id === cat.id && s.is_default,
    );
    if (!sec) return [];
    return categoryLinks
      .filter((l) => l.category_id === cat.id && l.section_id === sec.id)
      .sort(
        (a, b) =>
          (a.sort_order ?? Number.MAX_SAFE_INTEGER) -
          (b.sort_order ?? Number.MAX_SAFE_INTEGER),
      )
      .map((l) => l.variable_service_id);
  };
  // ¿Este item va bloqueado en la categoría? (pertenece a su sección fija)
  const isLockedService = (categoryName: string, codigo: string) =>
    defaultServiceIdsFor(categoryName).some((id) => id.toString() === codigo);
  // Items de la sección fija listos para entrar al grupo (solo activos).
  const defaultServicesFor = (categoryName: string) =>
    defaultServiceIdsFor(categoryName).flatMap((sid) => {
      const p = products.find(
        (prod) =>
          prod.categoria === categoryName && prod.codigo === sid.toString(),
      );
      if (!p || p.is_active === false) return [];
      return [
        {
          codigo: p.codigo,
          nombre: p.nombre,
          precio: p.precio,
          categoria: categoryName,
          quantity: 1,
        },
      ];
    });
  // Agregar POR GRUPO (acordado 22-07): cada grupo tiene su propio
  // "+ Agregar servicio" — así dos categorías gemelas nunca se mezclan.
  const [addingToGroup, setAddingToGroup] = useState<number | null>(null);
  // Desplegables artesanales (04-08, trasplante del cotizador): cuál está
  // abierto y qué se busca adentro. Se cierran al hacer clic afuera.
  // El de categoría es POR CAJA: cada grupo recién nacido tiene el suyo.
  const [openCatPicker, setOpenCatPicker] = useState<number | null>(null);
  // Basurero de caja (04-08): confirmación inline solo si hay ítems.
  const [confirmGroupKey, setConfirmGroupKey] = useState<number | null>(null);
  const [openItemPicker, setOpenItemPicker] = useState<number | null>(null);
  const [itemSearch, setItemSearch] = useState("");
  const [openFixedPicker, setOpenFixedPicker] = useState(false);
  const [fixedSearch, setFixedSearch] = useState("");
  // Búsqueda del desplegable de Categoría (04-08): mismo patrón sticky
  // del buscador de ítems, paridad con el cotizador.
  const [catSearch, setCatSearch] = useState("");
  // Cierre al clic afuera: misma mecánica del cotizador (listener global
  // que respeta los envoltorios .dropdown-container).
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest(".dropdown-container")) {
        setOpenCatPicker(null);
        setOpenItemPicker(null);
        setOpenFixedPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const daysCount = (() => {
    if (!multiDia) return 1;
    const d0 = new Date(
      String(quote.event_date).slice(0, 10) + "T00:00:00Z",
    ).getTime();
    const d1 = new Date(
      String(quote.event_end_date).slice(0, 10) + "T00:00:00Z",
    ).getTime();
    // Mismas rejas del cotizador: fechas raras → 1 día; tope 60 (un
    // "hasta" tipeado un año después no puede parir 366 chips).
    if (!Number.isFinite(d0) || !Number.isFinite(d1) || d1 < d0) return 1;
    return Math.min(60, Math.round((d1 - d0) / 86400000) + 1);
  })();
  // Rótulo de día con fecha, calco del cotizador: "Día 1 (03/08)".
  // Derivado del quote VIVO: si la ficha mueve las fechas con
  // EventoCajitas, el refetch trae el quote nuevo y esto lo sigue.
  const dayLabel = (n: number) => {
    const base = new Date(`${String(quote.event_date).slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(base.getTime())) return `Día ${n}`;
    const d = new Date(base.getTime() + (n - 1) * 86400000);
    return `Día ${n} (${d.toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "UTC",
    })})`;
  };
  // Las opciones de día se arman UNA vez por cambio de fechas (no en
  // cada tecleo, que redibuja toda la pestaña).
  const diasOpciones = useMemo(
    () =>
      Array.from({ length: daysCount }, (_, i) => ({
        id: i + 1,
        name: dayLabel(i + 1),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [daysCount, quote.event_date],
  );

  // Precio por persona de un ítem variable = precio × cantidad (igual que la
  // cotización). Se usa para las filas en pantalla.
  const ppp = (it: any) => (it.precio || 0) * (it.quantity || 1);
  // Audiencia y personas de cada grupo (Cotizador 2.0).
  const audOf = (g: any) => (g.audience === "ninos" ? "ninos" : "adultos");
  const audCount = (g: any) => (audOf(g) === "ninos" ? kidsN : adultsN);
  const gPeople = (g: any) =>
    typeof g.people === "number" ? g.people : audCount(g);

  // FASE 1.2 (27-07-2026): la foto de los ítems se arma UNA vez y de ahí
  // salen la pantalla, lo guardado y lo que el backend verifica — misma
  // fórmula compartida (@dinero = api-rest/src/quotations/utils/money.ts).
  const buildItemsSnapshot = () => ({
    // Una caja sin categoría o sin ítems NO viaja: es solo un borrador
    // en pantalla (el basurero de la caja es su única salida).
    variable_services: varGroups
      .filter((g) => g.category && (g.items || []).length > 0)
      .map((g) => ({
        category: g.category,
        // El id NO cambia nunca (diseño de Felipe 06-08): con él la
        // caja reencuentra su categoría aunque se renombre.
        category_id: catDeCaja(g)?.id ?? g.category_id ?? null,
        // Mismo campo y mismo tope del cotizador: la foto guardada es
        // indistinguible de la suya.
        day: Math.min(g.day || 1, daysCount),
        audience: audOf(g),
        people: gPeople(g),
        items: (g.items || []).map((it: any) => ({
          codigo: it.codigo,
          nombre: it.nombre,
          precio: it.precio,
          categoria: it.categoria || g.category,
          quantity: it.quantity || 1,
        })),
      })),
    // Filtro + orden de catálogo ANTES de guardar, calco del cotizador:
    // la foto queda idéntica la guarde quien la guarde (el documento
    // impreso lista los fijos en este orden).
    fixed_services: [...fixed]
      .filter((f) => f?.codigo)
      .sort((a, b) => fixedOrderOf(a.codigo) - fixedOrderOf(b.codigo))
      .map((f) => ({
        codigo: f.codigo,
        nombre: f.nombre,
        // Día del fijo como el cotizador: 0 = "todo el evento" (su default).
        day: Math.min(f.day || 0, daysCount),
        precio: f.precio,
        categoria: f.categoria || "General",
        quantity: f.quantity || 1,
        tipo_calculo: f.tipo_calculo || "fijo",
        min_precio: f.min_precio || 0,
        max_precio: f.max_precio || 0,
        precio_por_persona: f.precio_por_persona || 0,
      })),
  });

  const money = computeMoney({
    items: buildItemsSnapshot(),
    people_count: personas,
    children_count: kidsN,
    // Solo el modo activo del descuento entra a la cuenta.
    discount_percentage: discType === "%" ? discVal || 0 : 0,
    discount_amount: discType === "$" ? discVal || 0 : 0,
    // La propina se edita acá desde el 04-08 (checkbox del cotizador):
    // apagada viaja null, no 0 — igual que el cotizador.
    tip_percentage: tipEnabled ? tipPct || 0 : null,
  });
  const valuePerPerson = money.valuePerPerson;
  const fixedValue = money.fixedTotal;
  const subtotal = money.subtotalAmount;
  const descAmount = money.discountAmount;
  const tipAmount = money.tipAmount;
  const total = money.totalAmount;

  // Tope de descuento por rol (calco del cotizador): quién puede
  // descontar cuánto; recepción no ve la tarjeta de descuento.
  const getMaxDiscountForRole = () => {
    if (!userRole) return 0;
    switch (userRole) {
      case "administrador":
        return 40;
      case "vendedor":
      case "operaciones":
        return 15;
      case "recepcion":
        return 0;
      default:
        return 0;
    }
  };
  // Tope en $ = el mismo % máximo del rol aplicado al subtotal actual.
  const getMaxDiscountAmount = () =>
    Math.round((subtotal * getMaxDiscountForRole()) / 100);

  // ---------- Margen y costos (porte del cotizador, 04-08) ----------
  // Solo operaciones y administrador ven el costo (decisión de Felipe).
  // El vendedor sigue pudiendo descontar, pero sin ver el margen.
  const puedeVerMargen =
    userRole === UserRole.ADMINISTRADOR || userRole === UserRole.OPERACIONES;
  // La despensa compartida de logística (misma llave que Compras, el
  // Dashboard y el cotizador): si otra pantalla ya la pidió, sale de
  // caché. Sin permiso no se pide (companyId null = query apagada).
  const marginBaseQuery = useBaseLogistica(
    puedeVerMargen && company?.id ? Number(company.id) : null,
  );
  // Costo ESTIMADO DE CATÁLOGO: recetas → insumos, más los costos fijos
  // del catálogo — la MISMA estimación del cotizador, armada con la misma
  // foto de ítems que alimenta la cuenta de pantalla y el guardado, así
  // reacciona en vivo a cantidades, ítems y personas.
  const margenEvento = useMemo(() => {
    const base = marginBaseQuery.data;
    if (!base) return null;
    const ctx = buildConsolidationContext(
      base.recipes,
      base.supplies,
      base.furniture,
      base.nameIds,
      base.fixedCosts,
    );
    const acc = newAccumulator();
    const r = consolidateEvent(
      buildItemsSnapshot() as EventItemsSnapshot,
      personas,
      ctx,
      acc,
    );
    // Los marcados "sin costo en Eventia" (migración 57) NO son
    // pendientes: no tienen receta a propósito. Gestión ya los dejaba
    // pasar; este cuadro los contaba igual (pillado en la #470 con
    // "Ticket Diario"). Mismo filtro, misma verdad en las dos casas.
    const sinCostoVar = new Set(base.nameIds?.sinCostoVariable ?? []);
    return {
      costo: r.costoInsumos + r.costoFijos,
      sinReceta: [...new Set(acc.noRecipe)].filter(
        (n) => !sinCostoVar.has(canonicalServiceName(n)),
      ),
    };
    // buildItemsSnapshot se rearma sola cuando cambia cualquiera de estos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marginBaseQuery.data, varGroups, fixed, adultsN, kidsN, daysCount]);

  const removeVar = (gi: number, ii: number) => {
    setVarGroups((prev) => {
      const copy = prev.map((g) => ({ ...g, items: [...(g.items || [])] }));
      copy[gi].items.splice(ii, 1);
      // El grupo ya NO se esfuma al vaciarse (04-08): la única salida de
      // una caja es su basurero — una sola mecánica, como el cotizador.
      return copy;
    });
  };
  // Quita la caja COMPLETA (basurero del encabezado, como el cotizador —
  // que permite borrar cajas incluso con fijos de sección adentro). Los
  // estados por índice se cierran: tras el corrimiento apuntarían mal.
  const removeGroup = (gi: number) => {
    setVarGroups((prev) => prev.filter((_, i) => i !== gi));
    setConfirmGroupKey(null);
    setAddingToGroup(null);
    setOpenItemPicker(null);
    setOpenCatPicker(null);
  };
  const removeFixed = (i: number) =>
    setFixed((prev) => prev.filter((_, idx) => idx !== i));
  // Cantidad de un ítem variable (botones − / + de la casa). Por índice
  // original, igual que quitar; el piso es 1 — quitar pasa por la ✕.
  const setItemQty = (gi: number, ii: number, qty: number) =>
    setVarGroups((prev) =>
      prev.map((g, i) =>
        i === gi
          ? {
              ...g,
              items: (g.items || []).map((it: any, j: number) =>
                j === ii ? { ...it, quantity: Math.max(1, qty) } : it,
              ),
            }
          : g,
      ),
    );
  // Cantidad de un fijo (misma botonera − / +); piso 1, quitar por la ✕.
  const setFixedQty = (i: number, qty: number) =>
    setFixed((prev) =>
      prev.map((f, idx) =>
        idx === i ? { ...f, quantity: Math.max(1, qty) } : f,
      ),
    );
  // Día de un fijo (calco del cotizador): 0 = "todo el evento".
  const setFixedDay = (i: number, day: number) =>
    setFixed((prev) => prev.map((f, idx) => (idx === i ? { ...f, day } : f)));

  // Agrega un servicio del catálogo AL GRUPO gi (nunca adivina el grupo).
  // Se identifica por `codigo`: con el desplegable agrupado por secciones
  // el índice del arreglo ya no coincide con lo que se ve en pantalla.
  // El panel queda abierto tras elegir, para agregar varios seguidos
  // (mismo comportamiento del cotizador).
  const addToGroup = (gi: number, codigo: string) => {
    const g = varGroups[gi];
    const s = g
      ? productsOf(nomCat(g)).find((p) => p.codigo === codigo)
      : undefined;
    if (!s) return;
    setVarGroups((prev) => {
      const copy = prev.map((x) => ({ ...x, items: [...(x.items || [])] }));
      const grp = copy[gi];
      if (!grp) return prev;
      // Re-elegir el mismo ítem suma +1 a su cantidad, no duplica la fila.
      const idx = grp.items.findIndex(
        (it: any) => String(it.codigo) === codigo,
      );
      if (idx >= 0) {
        grp.items[idx] = {
          ...grp.items[idx],
          quantity: (grp.items[idx].quantity || 1) + 1,
        };
      } else {
        grp.items.push({
          codigo: s.codigo,
          nombre: s.nombre,
          precio: s.precio,
          categoria: nomCat(g),
          quantity: 1,
        });
      }
      return copy;
    });
  };

  // También por `codigo` (el desplegable agrupado reordena la lista) y
  // también deja el panel abierto tras elegir.
  const addFixedSvc = (codigo: string) => {
    const s = fixedCatalog.find((f) => f.codigo === codigo);
    // El precio queda RESUELTO al agregarlo (regla del catálogo en
    // @dinero): un fijo "por persona" ya no entra con precio 0.
    if (s)
      setFixed((prev) => [
        ...prev,
        { ...s, precio: resolveFixedServicePrice(s, personas), quantity: 1 },
      ]);
  };

  // Nace la caja VACÍA y sin categoría, como en el cotizador (04-08):
  // el panel azul intermedio se jubiló. La categoría se elige ADENTRO.
  const addGroup = () =>
    setVarGroups((prev) => [
      ...prev,
      { category: "", audience: "adultos", day: 1, items: [] },
    ]);
  // Elegir la categoría dispara lo que antes hacía "Crear": entran solos
  // los ítems de la sección fija (solo en cajas nuevas; lo guardado no se
  // toca al cargar) y se abre el agregador del grupo. La categoría de una
  // caja NO se cambia después (regla del cotizador): se borra la caja y
  // se hace otra.
  const setGroupCategory = (gi: number, name: string) => {
    setVarGroups((prev) =>
      prev.map((g, i) =>
        i === gi
          ? {
              ...g,
              category: name,
              category_id:
                orderedCategories.find((c) => c.name === name)?.id ?? null,
              items: defaultServicesFor(name),
            }
          : g,
      ),
    );
    setOpenCatPicker(null);
    setAddingToGroup(gi);
    // El desplegable del grupo nuevo se abre de una, con el buscador listo.
    setOpenItemPicker(gi);
    setItemSearch("");
  };
  // Día y audiencia de una caja recién nacida (antes vivían en el panel
  // azul); tras elegir categoría quedan fijos en la banda, como hoy.
  const setGroupDay = (gi: number, day: number) =>
    setVarGroups((prev) => prev.map((g, i) => (i === gi ? { ...g, day } : g)));
  // Cambiar la audiencia vuelve las personas al automático de la NUEVA
  // audiencia (people: undefined), igual que el cotizador: los montos se
  // rehacen solos con la tarifa por-adulto/por-niño existente.
  const setGroupAud = (gi: number, aud: "adultos" | "ninos") =>
    setVarGroups((prev) =>
      prev.map((g, i) =>
        i === gi ? { ...g, audience: aud, people: undefined } : g,
      ),
    );

  // TECLADO DEL BUSCADOR (06-08, pedido de Felipe: "para ahorrarme ese
  // clic"). La lista ofrecida se arma UNA vez y en el mismo orden en que
  // se ve —agrupada por sección—, así las flechas recorren lo que el ojo
  // recorre y Enter agrega exactamente lo resaltado.
  const [idxItem, setIdxItem] = useState(0);
  const buscadorItemRef = useRef<HTMLInputElement | null>(null);
  const ofrecidosDe = (g: any) => {
    // El buscador entiende SECCIONES además de nombres (07-08, pedido
    // de Felipe): escribir "postres" trae todo lo de esa sección aunque
    // ningún plato diga "postre". `matchesSearch` ya acepta varios
    // textos y exige que todas las palabras aparezcan en alguno, así que
    // "principales pollo" también acierta. Por eso el filtro por nombre
    // se aplica DESPUÉS de saber en qué sección cae cada item.
    const ofrecidos = productsOf(nomCat(g))
      .filter((p) => p.is_active !== false)
      .filter((p) => !isLockedService(nomCat(g), p.codigo));
    const filtrados = ofrecidos.filter((p) =>
      matchesSearch(itemSearch, p.nombre),
    );
    const cat = catDeCaja(g);
    const secs = cat
      ? categorySections
          .filter((sec) => sec.category_id === cat.id)
          .sort((a, b) => a.sort_order - b.sort_order)
      : [];
    if (secs.length === 0)
      return {
        bloques: [{ key: "plano", name: "", items: filtrados }],
        orden: filtrados,
      };
    const seccionDe = (codigo: string) =>
      categoryLinks.find(
        (l) =>
          l.category_id === cat!.id &&
          l.variable_service_id.toString() === codigo,
      )?.section_id || 0;
    const deSeccion = (id: number, nombre: string) =>
      ofrecidos.filter(
        (p) =>
          seccionDe(p.codigo) === id &&
          matchesSearch(itemSearch, p.nombre, nombre),
      );
    const bloques = [
      ...secs.map((sec) => ({
        key: `s-${sec.id}`,
        name: sec.name,
        items: deSeccion(sec.id, sec.name),
      })),
      {
        key: "s-0",
        name: "Sin sección",
        items: deSeccion(0, "Sin sección"),
      },
    ].filter((b) => b.items.length > 0);
    return { bloques, orden: bloques.flatMap((b) => b.items) };
  };

  // Flechitas ▲▼ (06-08, pedido de Felipe): mover cajas sin arrastrar,
  // patrón del catálogo. Orden local puro — viaja en la foto al Guardar.
  const moverCaja = (gi: number, delta: -1 | 1) => {
    const j = gi + delta;
    if (j < 0 || j >= varGroups.length) return;
    setVarGroups((prev) => {
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[gi], next[j]] = [next[j], next[gi]];
      return next;
    });
    // Todo lo que se identifica por ÍNDICE de caja queda apuntando a la
    // caja equivocada tras el intercambio (pillado en la revisión del
    // 06-08): con una confirmación de quitar abierta, el "Sí, quitar"
    // borraría de otra caja — y el auto-guardado lo persistiría. Se
    // cierran todos antes de mover.
    setConfirmGroupKey(null);
    setConfirmRowKey(null);
    setAddingToGroup(null);
    setOpenItemPicker(null);
    setOpenCatPicker(null);
  };

  // Personas del grupo: igual al cotizador — escribir el número de su
  // audiencia vuelve a modo automático; otro número = ajuste manual.
  const setGroupPeople = (gi: number, v?: number) => {
    setVarGroups((prev) =>
      prev.map((g, i) =>
        i === gi
          ? {
              ...g,
              // Igual que el cotizador: SOLO vacío o el total de la
              // audiencia vuelven a automático. Un 0 tipeado es ajuste
              // manual (filas en $0) — no un "cobrar a todos" callado.
              people: v === undefined || v === audCount(g) ? undefined : v,
            }
          : g,
      ),
    );
  };

  // ---- Auto-guardado (05-08, pedido de Felipe): al modificar servicios,
  // personas o fijos, los cambios viajan solos tras 1.5 s de calma; el
  // botón de abajo queda como guardado general de refuerzo. ----
  const [autoEstado, setAutoEstado] = useState<
    "reposo" | "guardando" | "ok" | "error"
  >("reposo");
  const [autoHora, setAutoHora] = useState("");
  const primerRender = useRef(true);
  // Serialización: nunca dos guardados en vuelo. Si algo cambia mientras
  // uno viaja, la bandera queda izada y al aterrizar despega otro con el
  // estado final. autoRef apunta siempre a la versión más fresca.
  const vueloRef = useRef(false);
  const pendienteRef = useRef(false);
  const autoRef = useRef<() => void>(() => {});

  // `silencioso`: el auto-guardado no toca los textos del guardado
  // manual (tiene su indicador propio); todo lo demás — payload, cuenta
  // compartida, avisos de plan de pagos y refetch — es EXACTAMENTE igual.
  const save = async (): Promise<boolean> => {
    // Evento provisionado: bajar personas es solo para administradores.
    if (
      provInfo.provisioned_at &&
      provInfo.provisioned_people !== null &&
      personas < provInfo.provisioned_people &&
      userRole !== "administrador"
    ) {
      setMsg(
        "Evento provisionado: solo un administrador puede disminuir el número de personas.",
      );
      return false;
    }
    if (vueloRef.current) {
      pendienteRef.current = true;
      return false;
    }
    vueloRef.current = true;
    setSaving(true);
    setMsg(null);
    setNotice(null);
    const prevTotal = quote.total_amount || 0;
    const newTotal = Math.round(total);
    try {
      // La MISMA foto que alimentó la cuenta de pantalla (Fase 1.2).
      const itemsPayload = buildItemsSnapshot();
      const { error } = await updateQuotation(
        {
          people_count: personas,
          children_count: kidsN,
          discount_percentage: discType === "%" ? discVal || 0 : 0,
          // El MONTO sale de la cuenta compartida porque ahí viene topado
          // al subtotal: subtotal − descuento siempre da el total guardado.
          discount_amount: discType === "$" ? Math.round(descAmount) : 0,
          value_per_person: Math.round(valuePerPerson),
          fixed_value: Math.round(fixedValue),
          subtotal_amount: Math.round(subtotal),
          total_amount: Math.round(total),
          // Propina (04-08, mismo flujo del cotizador): viaja el % activo
          // — apagada va null, no 0 — junto al MISMO tipAmount que ya
          // está sumado dentro de total (migración 37), para que la
          // verificación del backend cuadre una sola cuenta.
          tip_percentage: tipEnabled ? tipPct || 0 : null,
          tip_amount: Math.round(tipAmount),
          observations: obs,
          items: itemsPayload,
        } as any,
        quote.id,
      );
      if (error) throw error;
      // Aviso: describe cómo se reajustó el plan de pagos. SOLO en
      // Post-Venta — en una cotización en juego no hay cuotas que
      // ajustar y el cartel mentía (pillada de Felipe 05-08, #436).
      const diff = newTotal - prevTotal;
      const enPreVenta = [
        "solicitada",
        "enviada",
        "en_negociacion",
        "rechazada",
      ].includes(quote.quotation_status);
      if (enPreVenta) {
        // sin cartel: el total nuevo ya se ve en el resumen
      } else if (diff > 0) {
        setNotice({
          tone: "up",
          title: `El total subió ${clp(diff)}`,
          text: "Se ajustó el plan de pagos automáticamente: la diferencia se sumó a la última cuota pendiente (o se creó una nueva cuota si no quedaban pendientes).",
        });
      } else if (diff < 0) {
        const refund = Math.max(0, Math.round(paidAmount) - newTotal);
        if (refund > 0) {
          setNotice({
            tone: "refund",
            title: `Se generó un reembolso de ${clp(refund)}`,
            text: `El total bajó ${clp(-diff)} y quedó por debajo de lo ya pagado (${clp(paidAmount)}). Regístralo en la pestaña Comprobantes con su fecha, medio de pago y comprobante.`,
          });
        } else {
          setNotice({
            tone: "down",
            title: `El total bajó ${clp(-diff)}`,
            text: "Se ajustó el plan de pagos automáticamente: la diferencia se descontó de las cuotas pendientes.",
          });
        }
      }
      onSaved();
      return true;
    } catch {
      return false;
    } finally {
      vueloRef.current = false;
      setSaving(false);
      // Cambió algo en pleno vuelo: despega otro con el estado final
      // (cubre también lo editado durante un guardado manual).
      if (pendienteRef.current) {
        pendienteRef.current = false;
        setTimeout(() => void autoRef.current(), 0);
      }
    }
  };

  // Un viaje del auto-guardado: si hay vuelo, deja la bandera; si no,
  // parte y pinta el indicador según cómo aterrice.
  const autoGuardar = async () => {
    if (vueloRef.current) {
      pendienteRef.current = true;
      return;
    }
    setAutoEstado("guardando");
    const ok = await save();
    setAutoEstado(ok ? "ok" : "error");
    if (ok)
      setAutoHora(
        new Date().toLocaleTimeString("es-CL", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
      );
  };
  autoRef.current = autoGuardar;

  // El observador de la ESTRUCTURA: ítems variables y fijos, personas,
  // descuento y propina. Debounce de 1.5 s tras el último cambio (foto
  // asentada; la verificación del backend cuadra porque el payload es
  // el mismo de siempre).
  //
  // Los comentarios NO entran acá: tienen su propio ritmo más abajo.
  // Segundo y medio es perfecto para un número o un clic, pero al
  // redactar un párrafo las pausas son más largas que eso y el
  // indicador quedaba parpadeando en cada punto seguido (07-08,
  // pillada de Felipe escribiendo comentarios).
  useEffect(() => {
    // El montaje no es un cambio: la foto recién cargada no se guarda.
    if (primerRender.current) {
      primerRender.current = false;
      return;
    }
    const timer = setTimeout(() => void autoRef.current(), 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [varGroups, fixed, adultsN, kidsN, discType, discVal, tipEnabled, tipPct]);

  // El observador del TEXTO: cinco segundos de pausa, que es una pausa
  // de verdad y no la de quien piensa la frase siguiente. Y al salir del
  // campo guarda al tiro (ver onBlur del textarea), así que nada queda
  // colgando por esperar.
  const primerTexto = useRef(true);
  useEffect(() => {
    if (primerTexto.current) {
      primerTexto.current = false;
      return;
    }
    const timer = setTimeout(() => void autoRef.current(), 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obs]);

  // Quitar un servicio pasa por confirmacion inline (es delicado aunque
  // el cambio recien se aplique al Guardar).
  const [confirmRowKey, setConfirmRowKey] = useState<string | null>(null);
  // Fila de un servicio FIJO (04-08, unificada con varRow para que la
  // lista hable UN solo idioma): nombre · $precio unitario · − cantidad
  // + · $TOTAL del ítem · ✕. El total es la MISMA cuenta de siempre
  // (precio × cantidad — los fijos NO multiplican por personas). El
  // candado no aplica acá: es de la sección fija de variables.
  const fixedRow = (f: any, i: number) => {
    const key = `f-${i}`;
    if (confirmRowKey === key) {
      return (
        <div
          key={key}
          className="flex items-center justify-between py-2 border-b border-gray-100 text-sm"
        >
          <span className="text-gray-900 truncate mr-3">{f.nombre}</span>
          <ConfirmInline
            question="¿Quitar del evento?"
            yesLabel="Sí, quitar"
            onYes={() => {
              removeFixed(i);
              setConfirmRowKey(null);
            }}
            onNo={() => setConfirmRowKey(null)}
          />
        </div>
      );
    }
    return (
      <div
        key={key}
        className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-100 text-sm"
      >
        <span className="text-gray-800 flex items-center gap-2 min-w-0">
          <span className="truncate">{f.nombre}</span>
        </span>
        {/* flex-wrap: en pantallas angostas la fila crece hacia abajo
            en vez de desbordar la tarjeta (el chip de día mide 150px). */}
        <span className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
          <span className="text-gray-500">{clp(f.precio || 0)}</span>
          <QuantitySelector
            value={f.quantity || 1}
            onChange={(q) => setFixedQty(i, q)}
            min={1}
          />
          <span className="font-medium text-gray-900 w-20 text-right">
            {clp((f.precio || 0) * (f.quantity || 1))}
          </span>
          {/* Día del fijo (calco del cotizador): solo en multi-día, con
              "todo el evento" como default (0). */}
          {daysCount > 1 && (
            <SectionChipSelect
              value={Math.min(f.day || 0, daysCount)}
              options={diasOpciones}
              onChange={(dia) => setFixedDay(i, dia)}
              zeroLabel="todo el evento"
              size="md"
              title="Día del evento (o todo el evento)"
            />
          )}
          <button
            type="button"
            onClick={() => setConfirmRowKey(key)}
            className="text-red-500 hover:text-red-700"
            title="Quitar"
          >
            ✕
          </button>
        </span>
      </div>
    );
  };

  // Fila de un ítem VARIABLE (ajuste Felipe 04-08): nombre [+ candado si
  // es de sección fija] … $precio unitario · − cantidad + · $TOTAL del
  // ítem · ✕ (solo si no es fijo). El total es la MISMA cuenta de la
  // última columna de siempre (precio × cantidad × personas del grupo);
  // la matemática de personas/audiencia no se mueve de ppp/gPeople.
  // Quitar sigue pasando por la confirmación inline.
  const varRow = (g: any, gi: number, it: any, ii: number) => {
    const key = `v-${gi}-${ii}`;
    const locked = isLockedService(nomCat(g), String(it.codigo || ""));
    if (confirmRowKey === key) {
      return (
        <div
          key={key}
          className="flex items-center justify-between py-2 border-b border-gray-100 text-sm"
        >
          <span className="text-gray-900 truncate mr-3">{it.nombre}</span>
          <ConfirmInline
            question="¿Quitar del evento?"
            yesLabel="Sí, quitar"
            onYes={() => {
              removeVar(gi, ii);
              setConfirmRowKey(null);
            }}
            onNo={() => setConfirmRowKey(null)}
          />
        </div>
      );
    }
    return (
      <div
        key={key}
        className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-100 text-sm"
      >
        <span className="text-gray-800 flex items-center gap-2 min-w-0">
          <span className="truncate">{it.nombre}</span>
          {locked && (
            <span
              title="Va siempre con esta categoría (sección fija)"
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 shrink-0"
            >
              <Lock size={10} /> fijo
            </span>
          )}
        </span>
        <span className="flex items-center gap-3 shrink-0">
          <span className="text-gray-500">{clp(it.precio || 0)}</span>
          <QuantitySelector
            value={it.quantity || 1}
            onChange={(q) => setItemQty(gi, ii, q)}
            min={1}
          />
          <span className="font-medium text-gray-900 w-20 text-right">
            {clp(ppp(it) * gPeople(g))}
          </span>
          {locked ? (
            <span className="w-4" />
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRowKey(key)}
              className="text-red-500 hover:text-red-700"
              title="Quitar"
            >
              ✕
            </button>
          )}
        </span>
      </div>
    );
  };

  return (
    <div>
      {/* Aviso: evento ya provisionado */}
      {provInfo.provisioned_at && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <span className="font-bold">Evento provisionado</span> el{" "}
          {new Date(provInfo.provisioned_at).toLocaleDateString("es-CL")}
          {provInfo.provisioned_people !== null &&
            ` con ${provInfo.provisioned_people} personas`}
          . Si cambias personas o servicios, revisa las compras en Logística →
          Compras (puedes re-provisionar para actualizar la foto).
        </div>
      )}
      {/* Aviso de reajuste del plan de pagos */}
      {notice && (
        <div
          className={`mb-4 rounded-lg border p-3 flex items-start gap-3 ${
            notice.tone === "refund"
              ? "bg-red-50 border-red-200"
              : notice.tone === "down"
                ? "bg-amber-50 border-amber-200"
                : "bg-blue-50 border-blue-200"
          }`}
        >
          <span className="text-lg leading-none mt-0.5">
            {notice.tone === "refund"
              ? "↩️"
              : notice.tone === "down"
                ? "📉"
                : "📈"}
          </span>
          <div className="flex-1">
            <p
              className={`text-sm font-bold ${
                notice.tone === "refund"
                  ? "text-red-800"
                  : notice.tone === "down"
                    ? "text-amber-800"
                    : "text-blue-800"
              }`}
            >
              {notice.title}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">{notice.text}</p>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-gray-400 hover:text-gray-600"
            title="Cerrar"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Etapa 3 (03-08): dos columnas — la edición a la izquierda y el
          RESUMEN PEGAJOSO a la derecha, con Guardar siempre a la vista. */}
      <div className="grid gap-8 lg:grid-cols-[1fr_360px] items-start">
        <div>
          {/* Asistentes (editable): adultos + niños, como el cotizador */}
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 text-sm font-semibold text-blue-900">
            <span>
              👥 Asistentes del evento{" "}
              <span className="text-[10px] font-semibold uppercase text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded ml-1">
                de la cotización
              </span>
            </span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                Adultos
                <div className="w-24">
                  <NumberInput
                    value={adultsN || undefined}
                    onChange={(v) => setAdultsN(v || 0)}
                    min={0}
                    formatThousands
                    placeholder="0"
                    className="text-right"
                  />
                </div>
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                Niños
                <div className="w-24">
                  <NumberInput
                    value={kidsN || undefined}
                    onChange={(v) => setKidsN(v || 0)}
                    min={0}
                    formatThousands
                    placeholder="0"
                    className="text-right"
                  />
                </div>
              </label>
              <span className="text-gray-500">
                = {personas.toLocaleString("es-CL")}
              </span>
            </div>
          </div>

          {/* La cabecera de columnas de la grilla se retiró (04-08): con
          todas las filas en anatomía flex ya no describía nada. */}
          {varGroups.map((g, gi) => (
            <div key={`${g.category || "cat"}-${gi}`} className="mt-3">
              {/* Cabecera de caja calcada del cotizador (04-08, pedido de
              Felipe: la cotización vive su vida en esta pestaña, así que
              la caja se ve y se maneja IGUAL): número + Categoría
              (bloqueada una vez elegida) + Audiencia + Personas + Día
              (solo multi-día) + basurero. Sin arrastre ni colapso: acá
              no hay reordenamiento de cajas. */}
              <div className="flex items-end gap-3 flex-wrap mb-3">
                <div className="flex-1 min-w-[200px]">
                  {/* Número compacto en la fila del rótulo (04-08, "esquina
                  limpia"): así el desplegable de Categoría parte pegado
                  a la izquierda, en la MISMA columna que el área de
                  ítems de abajo — igual que el cotizador. */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-bold text-gray-400">
                      {gi + 1}
                    </span>
                    <label className="text-xs font-medium text-gray-600">
                      Categoría
                    </label>
                  </div>
                  <div className="relative dropdown-container">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenCatPicker(openCatPicker === gi ? null : gi);
                        setCatSearch("");
                      }}
                      disabled={g.category !== ""}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed text-left flex justify-between items-center bg-white"
                    >
                      <span
                        className={
                          g.category ? "text-gray-900" : "text-gray-500"
                        }
                      >
                        {g.category || "Seleccionar categoría"}
                      </span>
                      <svg
                        className="w-4 h-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>
                    {openCatPicker === gi && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                        {/* Buscador pegajoso (04-08): mismo patrón del
                        buscador de ítems, paridad con el cotizador. */}
                        <div className="sticky top-0 bg-white p-2 border-b border-gray-200">
                          <input
                            type="text"
                            autoFocus
                            value={catSearch}
                            onChange={(e) => setCatSearch(e.target.value)}
                            placeholder="Buscar categoría..."
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        {(() => {
                          const cats = catNames
                            // Paridad con el cotizador: desactivadas afuera,
                            // salvo la ya elegida de esta caja.
                            .filter(
                              (c) =>
                                !inactiveCategorySet.has(c) || c === g.category,
                            )
                            .filter((c) => matchesSearch(catSearch, c));
                          if (cats.length === 0)
                            return (
                              <div className="px-3 py-2 text-sm text-gray-500">
                                No se encontraron categorías
                              </div>
                            );
                          return cats.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => {
                                // Lo escrito se borra solo al pinchar.
                                setGroupCategory(gi, c);
                                setCatSearch("");
                              }}
                              className="w-full px-3 py-2 text-sm text-left hover:bg-blue-50"
                            >
                              {c}
                            </button>
                          ));
                        })()}
                      </div>
                    )}
                  </div>
                </div>
                {/* Nacimiento progresivo (04-08, Felipe: "no traer los
                cubiertos antes de saber qué vas a comer"): sin categoría
                la caja muestra SOLO el selector y el basurero; Audiencia,
                Personas y Día aparecen al elegirla. */}
                {/* Visible con niños en el evento O si la caja YA es de
                niños (foto antigua con niños en 0): sin esto la caja
                queda muda y sin vuelta a adultos. */}
                {g.category !== "" && (kidsN > 0 || audOf(g) === "ninos") && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Audiencia
                    </label>
                    <div
                      className="flex rounded-lg border border-gray-300 overflow-hidden"
                      title="Audiencia de este servicio"
                    >
                      {(["adultos", "ninos"] as const).map((aud) => {
                        const on = audOf(g) === aud;
                        return (
                          <button
                            key={aud}
                            type="button"
                            onClick={() => setGroupAud(gi, aud)}
                            className={`px-3 py-2 text-sm font-bold ${
                              on
                                ? aud === "ninos"
                                  ? "bg-amber-600 text-white"
                                  : "bg-blue-900 text-white"
                                : "bg-white text-gray-500 hover:bg-gray-50"
                            }`}
                          >
                            {aud === "ninos" ? "Niños" : "Adultos"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {g.category !== "" && (
                  <div className="relative">
                    <label
                      className="block text-xs font-medium text-gray-600 mb-1"
                      title="Personas de este servicio (por defecto, toda su audiencia)"
                    >
                      Personas
                    </label>
                    <NumberInput
                      value={gPeople(g) || undefined}
                      onChange={(v) => setGroupPeople(gi, v)}
                      min={1}
                      className={`w-12 text-sm text-right font-semibold ${
                        typeof g.people === "number"
                          ? "border-amber-400 bg-amber-50 text-amber-900"
                          : ""
                      }`}
                    />
                    {/* El "de N" anclado bajo el campo, calco del cotizador.
                  Supera al pedido del 22-07 de omitirlo en esta pestaña:
                  Felipe ordenó el 04-08 que la cabecera sea IGUAL. */}
                    {typeof g.people === "number" && (
                      <p className="absolute right-0 top-full mt-0.5 text-[10px] text-amber-700 whitespace-nowrap">
                        de {audCount(g)}
                      </p>
                    )}
                  </div>
                )}
                {g.category !== "" && daysCount > 1 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Día
                    </label>
                    <SectionChipSelect
                      value={Math.min(g.day || 1, daysCount)}
                      options={diasOpciones}
                      onChange={(dia) => setGroupDay(gi, dia)}
                      zeroLabel={null}
                      size="md"
                      title="Día del evento en que va este servicio"
                    />
                  </div>
                )}
                <div className="ml-auto pb-2 flex items-center gap-2">
                  {varGroups.length > 1 && (
                    <>
                      <button
                        type="button"
                        title="Subir servicio"
                        onClick={() => moverCaja(gi, -1)}
                        className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"
                      >
                        <ChevronUp size={15} />
                      </button>
                      <button
                        type="button"
                        title="Bajar servicio"
                        onClick={() => moverCaja(gi, 1)}
                        className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"
                      >
                        <ChevronDown size={15} />
                      </button>
                    </>
                  )}
                  {confirmGroupKey === gi ? (
                    /* Basurero con ítems adentro: confirmación inline de la
                    casa antes de borrar la caja completa. */
                    <ConfirmInline
                      question="¿Quitar la categoría completa?"
                      yesLabel="Sí, quitar"
                      onYes={() => removeGroup(gi)}
                      onNo={() => setConfirmGroupKey(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        (g.items || []).length > 0
                          ? setConfirmGroupKey(gi)
                          : removeGroup(gi)
                      }
                      className="text-red-500 hover:text-red-700"
                      title="Quitar este servicio"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
              {g.category && (
                <>
                  {/* Lista armada por secciones, como la carta del cotizador:
              rótulo azul con línea divisora ("Otros" para lo suelto);
              sin secciones, lista plana. Cada ítem conserva su índice
              original en el estado para editar cantidad y quitar. */}
                  {(() => {
                    const cat = catDeCaja(g);
                    const secs = cat
                      ? categorySections
                          .filter((s) => s.category_id === cat.id)
                          .sort((a, b) => a.sort_order - b.sort_order)
                      : [];
                    const sectionOf = (codigo: string) =>
                      cat
                        ? categoryLinks.find(
                            (l) =>
                              l.category_id === cat.id &&
                              l.variable_service_id.toString() === codigo,
                          )?.section_id || 0
                        : 0;
                    const withIdx = (g.items || []).map(
                      (it: any, i: number) => ({
                        it,
                        i,
                      }),
                    );
                    const bloques = [
                      ...secs.map((s) => ({
                        key: `s-${s.id}`,
                        name: s.name,
                        items: withIdx.filter(
                          (x: any) =>
                            sectionOf(String(x.it.codigo || "")) === s.id,
                        ),
                      })),
                      {
                        key: "s-0",
                        name: secs.length ? "Otros" : "",
                        items: withIdx.filter(
                          (x: any) =>
                            sectionOf(String(x.it.codigo || "")) === 0,
                        ),
                      },
                    ].filter((b) => b.items.length > 0);
                    return bloques.map((b) => (
                      <div key={b.key}>
                        {b.name && (
                          <div className="pt-2 pb-0.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-900 border-b border-blue-900/20">
                            {b.name}
                          </div>
                        )}
                        {b.items.map((x: any) => varRow(g, gi, x.it, x.i))}
                      </div>
                    ));
                  })()}
                  {/* Agregador DEL grupo: el servicio cae aquí, sin ambigüedad.
              Desplegable trasplantado del cotizador (04-08): buscador
              pegajoso arriba, ítems agrupados por sección de la categoría
              y panel que queda abierto para agregar varios seguidos. */}
                  <div className="py-1.5 border-t border-gray-100">
                    {addingToGroup === gi ? (
                      <div className="flex items-center gap-2">
                        <div className="relative dropdown-container flex-1">
                          <button
                            type="button"
                            onClick={() => {
                              setOpenItemPicker(
                                openItemPicker === gi ? null : gi,
                              );
                              setItemSearch("");
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-left flex justify-between items-center bg-white"
                          >
                            <span className="text-gray-500">
                              Seleccionar servicio de {g.category}…
                            </span>
                            <svg
                              className="w-4 h-4 text-gray-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                          </button>
                          {openItemPicker === gi &&
                            (() => {
                              const { bloques, orden } = ofrecidosDe(g);
                              const elegir = (codigo: string) => {
                                addToGroup(gi, codigo);
                                setItemSearch("");
                                setIdxItem(0);
                                // El cursor NO se suelta: se sigue
                                // escribiendo el próximo servicio sin
                                // volver a pinchar la barra.
                                buscadorItemRef.current?.focus();
                              };
                              let corrido = -1;
                              return (
                                <div
                                  className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-[min(43rem,75vh)] overflow-y-auto"
                                  data-lista-scroll
                                >
                                  <div className="sticky top-0 bg-white p-2 border-b border-gray-200">
                                    <input
                                      type="text"
                                      autoFocus
                                      ref={buscadorItemRef}
                                      value={itemSearch}
                                      onChange={(e) => {
                                        setItemSearch(e.target.value);
                                        setIdxItem(0);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "ArrowDown") {
                                          e.preventDefault();
                                          setIdxItem((i) =>
                                            Math.min(i + 1, orden.length - 1),
                                          );
                                        } else if (e.key === "ArrowUp") {
                                          e.preventDefault();
                                          setIdxItem((i) => Math.max(i - 1, 0));
                                        } else if (e.key === "Enter") {
                                          e.preventDefault();
                                          const p = orden[idxItem];
                                          if (p) elegir(p.codigo);
                                        } else if (e.key === "Escape") {
                                          e.preventDefault();
                                          setOpenItemPicker(null);
                                        }
                                      }}
                                      placeholder="Buscar item por nombre..."
                                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                  </div>
                                  {orden.length === 0 ? (
                                    <div className="px-3 py-2 text-sm text-gray-500">
                                      No se encontraron items
                                    </div>
                                  ) : (
                                    bloques.map((grp) => (
                                      <div key={grp.key}>
                                        {grp.name && (
                                          <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400 bg-gray-50">
                                            {grp.name}
                                          </div>
                                        )}
                                        {grp.items.map((p: any) => {
                                          // El índice de ESTA vuelta, congelado en
                                          // una constante. Si el handler de abajo
                                          // cierra sobre `corrido` —que es un let
                                          // que sigue contando— lee su valor FINAL
                                          // y todos los items terminan apuntando al
                                          // último (07-08: se autoseleccionaba el
                                          // último de la lista y bastaba un Enter
                                          // para agregar un item que nadie eligió).
                                          const pos = (corrido += 1);
                                          const activo = pos === idxItem;
                                          return (
                                            <button
                                              key={p.codigo}
                                              type="button"
                                              ref={(el) =>
                                                activo && verEnLista(el)
                                              }
                                              onMouseEnter={() =>
                                                setIdxItem(pos)
                                              }
                                              onClick={() => elegir(p.codigo)}
                                              className={`w-full px-3 py-2 text-left focus:outline-none ${
                                                activo
                                                  ? "bg-blue-50 text-blue-900"
                                                  : "hover:bg-gray-100"
                                              }`}
                                            >
                                              {p.nombre} - $
                                              {p.precio.toLocaleString("es-CL")}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    ))
                                  )}
                                </div>
                              );
                            })()}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setAddingToGroup(null);
                            setOpenItemPicker(null);
                          }}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setAddingToGroup(gi);
                          setOpenItemPicker(gi);
                          setItemSearch("");
                        }}
                        className="ml-2 text-[11px] font-semibold text-blue-500 hover:text-blue-700"
                        title="Agregar un servicio a ESTA categoría"
                      >
                        ↳ Agregar servicio
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}

          {/* Nivel EVENTO (03-08): línea divisoria + botón sobrio para la
          caja nueva, separado del "agregar" de cada categoría. */}
          <div className="flex items-center gap-3 border-t border-gray-200 mt-4 pt-4">
            <button
              type="button"
              onClick={addGroup}
              className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              + Agregar servicio
            </button>
          </div>

          {/* Servicios fijos del evento — tarjeta propia, calco del cotizador
          (04-08): título grande, lista seccionada adentro y el selector
          SIEMPRE visible al final. Sin subtotal en el título — el
          cotizador no lo muestra acá; el total vive en el Resumen. */}
          <div className="bg-white rounded-xl shadow p-6 mt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Servicios fijos del evento
            </h3>
            <div>
              {/* Lista agrupada por secciones de fijos (calco del cotizador):
              se ordena por la posición del catálogo y se emite el rótulo
              azul cuando cambia la sección. El `codigo` guardado se cruza
              contra el catálogo (codigo = id en texto); las filas sin
              codigo van al final, planas. Solo cambia el ORDEN visual:
              removeFixed sigue usando el índice original del estado. */}
              {(() => {
                const conCodigo = fixed
                  .map((f, i) => ({ f, i }))
                  .filter((x) => x.f?.codigo)
                  .sort(
                    (a, b) =>
                      fixedOrderOf(String(a.f.codigo)) -
                      fixedOrderOf(String(b.f.codigo)),
                  );
                const sinCodigo = fixed
                  .map((f, i) => ({ f, i }))
                  .filter((x) => !x.f?.codigo);
                let rotuloPrev = "";
                return [...conCodigo, ...sinCodigo].map(({ f, i }) => {
                  const rotulo =
                    f?.codigo && fixedSections.length > 0
                      ? fixedSectionNameOf(String(f.codigo))
                      : null;
                  const muestraRotulo = !!rotulo && rotulo !== rotuloPrev;
                  if (rotulo) rotuloPrev = rotulo;
                  return (
                    <div key={`fw-${i}`}>
                      {muestraRotulo && (
                        <div className="pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-blue-900">
                          {rotulo}
                        </div>
                      )}
                      {fixedRow(f, i)}
                    </div>
                  );
                });
              })()}
              {/* Slot de selección SIEMPRE al final, calco del cotizador: la
              ventanita vive al final de la tarjeta, sin botón de
              abrir/cerrar. Buscador pegajoso, agrupado por secciones y
              panel que queda abierto para agregar varios seguidos. */}
              <div className="flex items-center gap-2 py-2 border-b border-gray-100">
                <div className="relative dropdown-container flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenFixedPicker((v) => !v);
                      setFixedSearch("");
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-left flex justify-between items-center bg-white"
                  >
                    <span className="text-gray-500">
                      Seleccionar servicio fijo…
                    </span>
                    <svg
                      className="w-4 h-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                  {openFixedPicker && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-[min(43rem,75vh)] overflow-y-auto">
                      <div className="sticky top-0 bg-white p-2 border-b border-gray-200">
                        <input
                          type="text"
                          autoFocus
                          value={fixedSearch}
                          onChange={(e) => setFixedSearch(e.target.value)}
                          placeholder="Buscar servicio por nombre..."
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      {(() => {
                        const disponibles = fixedCatalog
                          // Paridad con el cotizador: desactivados afuera.
                          .filter((f) => f.is_active !== false)
                          .filter((f) => matchesSearch(fixedSearch, f.nombre))
                          .sort(
                            (a, b) =>
                              fixedOrderOf(a.codigo) - fixedOrderOf(b.codigo),
                          );
                        if (disponibles.length === 0) {
                          return (
                            <div className="px-3 py-2 text-sm text-gray-500">
                              No se encontraron servicios
                            </div>
                          );
                        }
                        const botonDe = (f: (typeof disponibles)[number]) => (
                          <button
                            key={f.codigo}
                            type="button"
                            onClick={() => {
                              // Lo escrito se borra solo al pinchar
                              // (04-08); el panel queda abierto.
                              addFixedSvc(f.codigo);
                              setFixedSearch("");
                            }}
                            className="w-full px-3 py-2 text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                          >
                            {f.nombre} - $
                            {(f.precio || 0).toLocaleString("es-CL")}
                          </button>
                        );
                        if (fixedSections.length === 0) {
                          return disponibles.map(botonDe);
                        }
                        let prev = "";
                        return disponibles.map((f) => {
                          const nombre = fixedSectionNameOf(f.codigo);
                          const header = nombre !== prev;
                          prev = nombre;
                          return (
                            <div key={f.codigo}>
                              {header && (
                                <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400 bg-gray-50">
                                  {nombre}
                                </div>
                              )}
                              {botonDe(f)}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Columna derecha pegajosa (04-08, orden calcado del cotizador):
          Resumen de la cotización → Descuento → Margen y costos →
          Comentarios + Guardar. Tarjetas hermanas, como en el cotizador. */}
        <div className="lg:sticky lg:top-16 self-start space-y-6 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto lg:pr-1">
          {/* Resumen de la cotización: panel único, estilo mockup v1 */}
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="bg-blue-900 px-4 py-2.5">
              <span className="text-xs font-extrabold uppercase tracking-wider text-white">
                Resumen de la cotización
              </span>
            </div>
            <div className="divide-y divide-gray-200">
              {/* Una línea POR GRUPO (nunca fusionadas): audiencia, día si es
              multi-día, y personas — calco del cotizador sobre varGroups. */}
              {varGroups.filter((g) => (g.items || []).length > 0).length ===
              0 ? (
                <p className="px-4 py-3 text-sm text-gray-400">
                  Aún no hay servicios.
                </p>
              ) : (
                varGroups
                  .filter((g) => (g.items || []).length > 0)
                  .map((g, gi) => {
                    const perPerson = (g.items || []).reduce(
                      (s: number, it: any) => s + ppp(it),
                      0,
                    );
                    const people = gPeople(g);
                    const aud = audOf(g);
                    const parts: string[] = [];
                    if (daysCount > 1)
                      parts.push(`Día ${Math.min(g.day || 1, daysCount)}`);
                    parts.push(
                      typeof g.people === "number"
                        ? `${people} de ${audCount(g)} personas`
                        : `${people} personas`,
                    );
                    return (
                      <div key={`rs-${gi}`} className="px-4 py-2 text-sm">
                        <div className="flex justify-between gap-2">
                          <span className="text-gray-700">
                            <span
                              className={`mr-1 text-[10px] font-extrabold ${
                                aud === "ninos"
                                  ? "text-amber-700"
                                  : "text-blue-900"
                              }`}
                            >
                              {aud === "ninos" ? "NIÑOS" : "ADULTOS"}
                            </span>
                            {g.category}
                          </span>
                          <span className="font-medium text-gray-900 whitespace-nowrap">
                            ${(perPerson * people).toLocaleString("es-CL")}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400">
                          {parts.join(" · ")}
                        </p>
                      </div>
                    );
                  })
              )}

              {/* Las filas "Por adulto / Por niño" se retiraron (04-08):
              interrumpían la lectura; el desglose vive ahora dentro del
              recuadro ámbar del Total con IVA. */}
            </div>

            {/* Fijos: solo lectura aquí (se editan en la lista de la izquierda) */}
            {fixed.length > 0 && (
              <div className="border-t border-gray-200">
                {fixed.map((f, i) => (
                  <div
                    key={`fs-${i}`}
                    className="flex justify-between px-4 py-2 text-sm bg-gray-50"
                  >
                    <span className="text-gray-700">{f.nombre}</span>
                    <span className="font-medium text-gray-900">
                      $
                      {((f.precio || 0) * (f.quantity || 1)).toLocaleString(
                        "es-CL",
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {descAmount > 0 && (
              <div className="bg-gray-100 px-4 py-2 border-b">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    Subtotal antes descuento
                  </span>
                  <span className="text-gray-600">
                    ${Math.round(subtotal).toLocaleString("es-CL")}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-red-600">
                    Descuento{" "}
                    {discType === "%"
                      ? `(${discVal || 0}%)`
                      : "(monto cerrado)"}
                  </span>
                  <span className="text-red-600">
                    -${Math.round(descAmount).toLocaleString("es-CL")}
                  </span>
                </div>
              </div>
            )}

            {/* La propina NO lleva IVA: Neto e IVA se calculan sobre el
            total SIN propina, y la propina se suma al final. */}
            {(() => {
              const totalConIva = total - tipAmount;
              return (
                <>
                  <div className="divide-y divide-gray-200">
                    <div className="flex justify-between px-4 py-1.5 text-sm">
                      <span className="text-gray-500">Neto</span>
                      <span className="text-gray-700">
                        $
                        {Math.round(totalConIva / 1.19).toLocaleString("es-CL")}
                      </span>
                    </div>
                    <div className="flex justify-between px-4 py-1.5 text-sm">
                      <span className="text-gray-500">IVA (19%)</span>
                      <span className="text-gray-700">
                        $
                        {Math.round(
                          totalConIva - totalConIva / 1.19,
                        ).toLocaleString("es-CL")}
                      </span>
                    </div>
                  </div>

                  <div className="bg-amber-100 px-4 py-2">
                    <div className="flex justify-between font-bold text-black">
                      <span>Total con IVA</span>
                      <span>
                        ${Math.round(totalConIva).toLocaleString("es-CL")}
                      </span>
                    </div>
                    {/* Desglose (04-08, Felipe): SUMA EXACTO al total ámbar
                    porque sale de los MISMOS números de computeMoney:
                    variables = ámbar + descuento − fijos (por
                    construcción), adultos con la misma fórmula de la
                    cuenta y niños POR DIFERENCIA — cualquier resto cae
                    ahí y la suma nunca descuadra. La apostilla "×N" solo
                    cuando toda audiencia adulta/niña está completa. */}
                    {(() => {
                      const variablesTot =
                        totalConIva + descAmount - fixedValue;
                      const activos = varGroups.filter(
                        (g) => (g.items || []).length > 0,
                      );
                      const deAdultos = activos.filter(
                        (g) => audOf(g) === "adultos",
                      );
                      const deNinos = activos.filter(
                        (g) => audOf(g) === "ninos",
                      );
                      const perPersonOf = (g: any) =>
                        (g.items || []).reduce(
                          (s: number, it: any) => s + ppp(it),
                          0,
                        );
                      const adultosCalc = deAdultos.reduce(
                        (s, g) => s + perPersonOf(g) * gPeople(g),
                        0,
                      );
                      const adultosVar = kidsN > 0 ? adultosCalc : variablesTot;
                      const ninosVar =
                        kidsN > 0 ? variablesTot - adultosCalc : 0;
                      const adultosExacto =
                        adultsN > 0 &&
                        deAdultos.length > 0 &&
                        deAdultos.every((g) => gPeople(g) === adultsN);
                      const ninosExacto =
                        kidsN > 0 &&
                        deNinos.length > 0 &&
                        deNinos.every((g) => gPeople(g) === kidsN);
                      const vppNinos = ninosExacto
                        ? deNinos.reduce((s, g) => s + perPersonOf(g), 0)
                        : 0;
                      const fmtA = (m: number) =>
                        `$${Math.round(m).toLocaleString("es-CL")}`;
                      return (
                        <div className="mt-1 pt-1 border-t border-amber-200 space-y-0.5 text-xs font-normal text-amber-900">
                          <div className="flex justify-between gap-2">
                            <span>
                              Variables (adultos)
                              {adultosExacto && (
                                <span className="text-amber-700">
                                  {" "}
                                  — {fmtA(valuePerPerson)} ×{" "}
                                  {adultsN.toLocaleString("es-CL")} adultos
                                </span>
                              )}
                            </span>
                            <span>{fmtA(adultosVar)}</span>
                          </div>
                          {kidsN > 0 && (
                            <div className="flex justify-between gap-2">
                              <span>
                                Variables (niños)
                                {ninosExacto && (
                                  <span className="text-amber-700">
                                    {" "}
                                    — {fmtA(vppNinos)} ×{" "}
                                    {kidsN.toLocaleString("es-CL")} niños
                                  </span>
                                )}
                              </span>
                              <span>{fmtA(ninosVar)}</span>
                            </div>
                          )}
                          <div className="flex justify-between gap-2">
                            <span>Servicios fijos</span>
                            <span>{fmtA(fixedValue)}</span>
                          </div>
                          {descAmount > 0 && (
                            <div className="flex justify-between gap-2">
                              <span>Descuento</span>
                              <span>−{fmtA(descAmount)}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Propina opcional: sobre los variables, DESPUÉS del
                  IVA, va directa al equipo */}
                  <div className="px-4 py-2.5 border-t-2 border-dashed border-gray-200">
                    <div className="flex items-center justify-between text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={tipEnabled}
                          onChange={(e) => setTipEnabled(e.target.checked)}
                          className="w-4 h-4 accent-blue-600"
                        />
                        <span className="text-gray-700">Propina equipo</span>
                        {tipEnabled && (
                          <span className="flex items-center gap-1">
                            <NumberInput
                              value={tipPct || undefined}
                              onChange={(v) => setTipPct(v ?? 0)}
                              min={0}
                              max={100}
                              placeholder="0"
                              className="w-12 px-1.5 py-0.5 text-xs text-right"
                            />
                            <span className="text-xs text-gray-500">%</span>
                          </span>
                        )}
                      </label>
                      {tipEnabled && (
                        <span className="font-bold text-gray-900">
                          ${Math.round(tipAmount).toLocaleString("es-CL")}
                        </span>
                      )}
                    </div>
                    {tipEnabled && (
                      <p className="mt-1 text-[11px] text-gray-400">
                        Sobre los servicios variables, después del IVA. No lleva
                        IVA: va directa al equipo.
                      </p>
                    )}
                  </div>

                  <div className="bg-blue-900 px-4 py-2.5">
                    <div className="flex justify-between font-extrabold text-white">
                      <span>TOTAL A PAGAR</span>
                      <span>${Math.round(total).toLocaleString("es-CL")}</span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Descuento — con el tope por rol del cotizador. El toggle %/$
          conserva la conversión del tab (mantener el descuento efectivo
          al cambiar de modo). Recepción no ve la tarjeta. */}
          {userRole && getMaxDiscountForRole() > 0 && (
            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                Descuento
              </h3>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-gray-300 overflow-hidden shrink-0">
                  {(["%", "$"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        if (t === discType) return;
                        // Convertir el valor para que el descuento en $ se
                        // mantenga al cambiar de modo (no reinterpretar).
                        if (t === "$") {
                          setDiscVal(descAmount);
                        } else {
                          setDiscVal(
                            subtotal > 0
                              ? Math.round((descAmount / subtotal) * 10000) /
                                  100
                              : 0,
                          );
                        }
                        setDiscType(t);
                      }}
                      className={`px-3 py-2 text-sm font-bold ${
                        discType === t
                          ? "bg-blue-600 text-white"
                          : "bg-white text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="flex-1">
                  <NumberInput
                    value={discVal || undefined}
                    onChange={(v) => setDiscVal(v || 0)}
                    min={0}
                    max={
                      discType === "%"
                        ? getMaxDiscountForRole()
                        : getMaxDiscountAmount()
                    }
                    formatThousands
                    currency={discType === "$"}
                    placeholder="0"
                    className="text-right"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {discType === "%"
                  ? `Máximo: ${getMaxDiscountForRole()}% (${userRole})`
                  : `Máximo: $${getMaxDiscountAmount().toLocaleString("es-CL")} — equivale al ${getMaxDiscountForRole()}% (${userRole})`}
              </p>
            </div>
          )}

          {/* Margen y costos — debajo del Descuento, para verlo ANTES de
          ofrecerlo (orden del cotizador). Solo operaciones y
          administrador. Tarjeta propia, como en el cotizador. */}
          {puedeVerMargen && (
            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                Margen y costos
              </h3>
              {!margenEvento ? (
                <p className="text-xs text-gray-500">Calculando…</p>
              ) : (
                (() => {
                  // Mismos números del cotizador: la propina no entra a la
                  // venta; el descuento se muestra con y sin efecto.
                  const venta = total - tipAmount;
                  const ventaSinDesc = venta + descAmount;
                  const costo = margenEvento.costo;
                  const margen = venta - costo;
                  const pct = venta > 0 ? (margen / venta) * 100 : 0;
                  const margenSinDesc = ventaSinDesc - costo;
                  const pctSinDesc =
                    ventaSinDesc > 0 ? (margenSinDesc / ventaSinDesc) * 100 : 0;
                  const fmt = (n: number) =>
                    `$${Math.round(n).toLocaleString("es-CL")}`;
                  if (costo <= 0) {
                    return (
                      <p className="text-xs text-gray-500">
                        Todavía no hay costos: los servicios cotizados no tienen
                        receta cargada.
                      </p>
                    );
                  }
                  return (
                    <>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Monto cotizado</span>
                          <span className="text-gray-900">{fmt(venta)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Costo estimado</span>
                          <span className="text-gray-900">{fmt(costo)}</span>
                        </div>
                        <div className="flex justify-between border-t pt-1 font-semibold">
                          <span className="text-gray-700">Margen</span>
                          <span
                            className={
                              margen >= 0 ? "text-emerald-600" : "text-red-600"
                            }
                          >
                            {fmt(margen)} ({pct.toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                      {descAmount > 0 && (
                        <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs">
                          <div className="flex justify-between text-gray-600">
                            <span>Margen sin descuento</span>
                            <span>
                              {fmt(margenSinDesc)} ({pctSinDesc.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                      )}
                      {margenEvento.sinReceta.length > 0 && (
                        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          ⚠ {margenEvento.sinReceta.length} servicio
                          {margenEvento.sinReceta.length > 1 ? "s" : ""} sin
                          receta, no suma
                          {margenEvento.sinReceta.length > 1 ? "n" : ""} al
                          costo: el margen se ve mejor de lo que es.
                        </p>
                      )}
                      <p className="mt-2 text-[11px] text-gray-400">
                        Estimación de catálogo (recetas + costos fijos), no el
                        costo real de compra. La propina no entra en el cálculo.
                      </p>
                    </>
                  );
                })()
              )}
            </div>
          )}

          {/* Comentarios + Guardar: cierre de la columna (orden del
          cotizador: Resumen → Descuento → Margen → Observaciones). */}
          <div className="bg-white rounded-xl shadow p-4">
            <p className="text-xs font-semibold text-gray-700 mb-1">
              Comentarios / observaciones
            </p>
            <textarea
              rows={3}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              // Salir del campo es señal de "ya está": guarda al tiro y
              // no hay que esperar los cinco segundos.
              onBlur={() => void autoRef.current()}
              className="w-full text-sm border border-gray-300 rounded-lg p-3"
            />
            <div className="flex items-center justify-end gap-3 mt-4">
              {/* Indicador sutil del auto-guardado; el botón queda como
                  refuerzo manual, tal cual. */}
              {autoEstado === "guardando" && (
                <span className="text-xs text-gray-400">Guardando…</span>
              )}
              {autoEstado === "ok" && (
                <span className="text-xs text-gray-400">
                  Guardado ✓ {autoHora}
                </span>
              )}
              {autoEstado === "error" && (
                <span className="text-xs font-semibold text-amber-600">
                  No se pudo guardar — reintenta o usa Guardar
                </span>
              )}
              {msg && <span className="text-sm text-gray-500">{msg}</span>}
              <button
                type="button"
                onClick={() => void autoGuardar()}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Editable: adultos y niños, servicios y cantidades, descuento (% o
              $), propina equipo y comentarios. Cada servicio multiplica por las
              personas de SU audiencia. Al guardar, si cambia el total, el plan
              de pagos se ajusta automáticamente.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
