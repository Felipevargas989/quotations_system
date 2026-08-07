import { useState, useEffect, useMemo } from "react";
import { computeMoney } from "@dinero";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Save,
  ArrowLeft,
  Plus,
  Trash2,
  X,
  CheckCircle,
  Layers,
  Lock,
  Package,
  ChevronDown,
  ChevronRight,
  ChevronUp,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { olvidarFiltrosTablero } from "./filtrosTablero";
import { useServices } from "../../hooks/useServices";
import { getFixedSections } from "../../services/services.service";
import { useServiceGroups } from "../../hooks/useServiceGroups";
import { useServiceGroupCollections } from "../../hooks/useServiceGroupCollections";
import { ServiceGroup } from "../../types/serviceGroups.types";
import { ServiceGroupCollection } from "../../types/serviceGroupCollections.types";
import { useDateAvailability } from "../../hooks/useDateAvailability";
import { validateCompleteClientForm } from "../../utils/validation";
import {
  emailProblem,
  normalizePhone,
  PHONE_PLACEHOLDER,
  phoneProblem,
} from "../../utils/phone";
import { CLIENT_TYPES, DEFAULT_CLIENT_TYPE } from "../../constants/clientTypes";
import { clientTypesQueryOptions } from "../../services/clientTypes.service";
import {
  createQuotation,
  deleteQuotation,
  getQuotationById,
  updateQuotation,
} from "../../services/quotations.service";
import {
  createClient,
  clientsQueryOptions,
} from "../../services/clients.service";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getUser } from "../../services/users.service";
import { ClientFormData } from "../../types/clients.types";
import {
  EventType,
  QuotationFormData,
  QuotationFormDataUpdate,
  QuotationRequestType,
  QuotationStatus,
} from "../../types/quotations.types";
import { NumberInput } from "../../components/inputs";
import ConfirmInline from "../../components/ConfirmInline";
import { getCategorySections } from "../../services/sections.service";
import {
  ClientContact,
  createClientContact,
  getClientContacts,
} from "../../services/clientContacts.service";
import { CategorySection } from "../../types/services.types";
import QuantitySelector from "../../components/QuantitySelector";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import SectionChipSelect from "../../components/selects/SectionChipSelect";
import { matchesSearch } from "../../utils/searchMatch";
import { UserRole } from "../../constants/users";
import { toast } from "../../components/toast/Toast";
import { humanizeApiError } from "../../utils/apiErrors";
import {
  buscarCategoria,
  nombreVigente,
} from "../../utils/categoriaCaja";
// Margen en el cotizador (24-07): misma máquina de consolidación que usa
// Post-venta → Gestión y la pestaña Compras.
import { getBaseCatalogo } from "../../services/logistics.service";
import {
  buildConsolidationContext,
  consolidateEvent,
  newAccumulator,
  type EventItemsSnapshot,
} from "../../utils/eventConsolidation";

// TODO: use already defined types
interface SelectedService {
  codigo: string;
  nombre: string;
  precio: number;
  categoria: string;
  quantity: number;
}

interface ServiceBox {
  id: string;
  selectedCategory: string;
  // Id del catálogo (06-08): sobrevive a los renombres.
  selectedCategoryId?: number | null;
  selectedItem: string;
  services: SelectedService[]; // Each box has its own services
  groupName?: string; // Set (in memory) when the box was loaded from a saved group
  // Día del evento al que pertenece este servicio (1..N; eventos de un día = 1)
  day?: number;
  // Audiencia del servicio: adultos (default) o niños. Cada caja
  // multiplica por SU audiencia, no por el total del evento.
  audience?: "adultos" | "ninos";
  // Personas de este servicio. undefined = automático (el total de su
  // audiencia); un número = ajuste manual (ej: coffee solo para 30).
  people?: number;
}

// TODO: use already defined types
interface SelectedFixedService {
  codigo: string;
  nombre: string;
  precio_calculado: number;
  categoria: string;
  quantity: number;
  tipo_calculo?: string;
  min_precio?: number;
  max_precio?: number;
  precio_por_persona?: number;
  // Día del evento (0 = todo el evento, 1..N = día específico)
  day?: number;
}

export default function QuotationForm() {
  const { id } = useParams<{ id?: string }>();
  // Estado de navegación desde la ficha 360° del cliente:
  // - clientId: "Nueva cotización" con el cliente ya preseleccionado.
  // - duplicateFrom: "Duplicar" una cotización existente (se copia todo
  //   menos la fecha del evento; se crea con número y estado nuevos).
  const location = useLocation();
  const navClientId = (location.state as any)?.clientId as string | undefined;
  const duplicateFrom = (location.state as any)?.duplicateFrom as
    | string
    | undefined;
  const navigate = useNavigate();
  // Volver a DONDE VENÍAS (pillada Felipe 04-08: desde la ficha del
  // negocio, "volver" botaba a la lista). Si se entró directo por URL
  // (sin historia propia), la lista sigue siendo el puerto seguro.
  const volver = () => {
    if (window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate("/quotations");
  };
  const { user, userRole, company } = useAuth();
  const {
    products,
    variableServices,
    fixedServices,
    inactiveCategories,
    orderedCategories,
    categoryLinks,
    loading: servicesLoading,
    calculatePrice,
  } = useServices();
  const inactiveCategorySet = new Set(inactiveCategories);
  const {
    groups: serviceGroups,
    saveGroup,
    removeGroup: removeServiceGroup,
  } = useServiceGroups();
  const {
    collections: serviceGroupCollections,
    saveCollection,
    removeCollection: removeServiceGroupCollection,
  } = useServiceGroupCollections();

  const [quotation, setQuotation] = useState<any>(null);
  const [isFromRequirement, setIsFromRequirement] = useState(false);
  const [creatorUser, setCreatorUser] = useState<any>(null);

  // TODO: add type
  const [formData, setFormData] = useState<QuotationFormData>({
    event_type: EventType.ALMUERZO_O_CENA,
    event_date: undefined,
    event_end_date: undefined,
    people_count: 1,
    subtotal_amount: 0,
    discount_percentage: 0,
    discount_amount: 0,
    total_amount: 0,
    quotation_status: QuotationStatus.SOLICITADA,
    request_type: QuotationRequestType.COTIZACION,
    observations: "",
    value_per_person: 0,
    fixed_value: 0,
    client_id: "",
    items: {
      variable_services: [],
      fixed_services: [],
    },
  });

  // Clientes desde el caché compartido de React Query (Etapa 2): el
  // formulario abre con la lista ya conocida y revalida por detrás.
  const queryClientRQ = useQueryClient();
  const { data: clients = [] } = useQuery(clientsQueryOptions);
  const [loading, setLoading] = useState(false);
  // Removed selectedServices state - now each service box has its own services
  const [selectedFixedServices, setSelectedFixedServices] = useState<
    SelectedFixedService[]
  >([]);
  const [serviceCategories, setServiceCategories] = useState<string[]>([]);
  // Mesa de trabajo ordenada (Felipe, 23-07): cada categoría se puede
  // PLEGAR (resumen en una línea) y ARRASTRAR para reordenar. El orden
  // se guarda con la cotización (variable_services serializa en orden);
  // el plegado es solo de la sesión — al abrir, todo parte desplegado.
  const [collapsedBoxes, setCollapsedBoxes] = useState<Set<string>>(new Set());
  const [serviceBoxes, setServiceBoxes] = useState<ServiceBox[]>([
    {
      id: "1",
      selectedCategory: "",
      selectedItem: "",
      services: [],
    },
  ]);
  // Descuento por porcentaje o por monto cerrado (mismo patrón que la
  // pestaña Servicios de Post Venta).
  const [discType, setDiscType] = useState<"%" | "$">("%");
  // Propina opcional sobre los servicios variables, DESPUÉS del IVA
  // (no lleva IVA, va directa al equipo).
  const [tipEnabled, setTipEnabled] = useState(false);
  const [tipPct, setTipPct] = useState<number>(10);
  const [tipAmountUI, setTipAmountUI] = useState(0);
  // Contactos del cliente elegido (lista minima; la cotizacion guarda el
  // nombre como foto en contact_name)
  const [clientContacts, setClientContacts] = useState<ClientContact[]>([]);
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  // Portero del mini-formulario (30-07): ni correos en el teléfono ni
  // teléfonos en el correo.
  const [newContactError, setNewContactError] = useState<string | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const [isEditingExisting, setIsEditingExisting] = useState(false);
  // Eliminar cotización (solo admin, solo editando): confirmación INLINE
  // en la esquina superior — patrón del sistema, cero popups nativos.
  const [confirmDeleteQ, setConfirmDeleteQ] = useState(false);
  const [deletingQ, setDeletingQ] = useState(false);
  const [deleteQError, setDeleteQError] = useState<string | null>(null);
  const [showClientModal, setShowClientModal] = useState(false);
  const [clientFormData, setClientFormData] = useState<ClientFormData>({
    name: "",
    email: "",
    phone: "",
    contact_person: "",
    client_type: DEFAULT_CLIENT_TYPE,
  });
  // Tipos de cliente por empresa (caché compartido; los 6 estándar son
  // el respaldo si el catálogo no responde)
  const { data: clientTypesData } = useQuery(clientTypesQueryOptions);
  const clientTypesList: string[] = clientTypesData?.map((t) => t.name) ?? [
    ...CLIENT_TYPES,
  ];
  const [clientLoading, setClientLoading] = useState(false);
  const [clientErrors, setClientErrors] = useState({
    name: "",
    email: "",
    phone: "",
    contact_person: "",
  });
  const [isFormValid, setIsFormValid] = useState(false);
  const [touchedFields, setTouchedFields] = useState({
    name: false,
    email: false,
    phone: false,
    contact_person: false,
  });

  // Aviso visible cuando el "último día" se limpia solo (inicio movido más
  // allá del fin): nada de borrados silenciosos.
  const [endDateCleared, setEndDateCleared] = useState(false);

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  // Confirmaciones inline (sin popups del navegador): paquete a
  // reemplazar/eliminar y menú guardado a eliminar.
  const [confirmPkg, setConfirmPkg] = useState<{
    id: number;
    action: "replace" | "delete";
  } | null>(null);
  const [confirmGroupDel, setConfirmGroupDel] = useState<number | null>(null);
  // In-memory search term to filter items inside the open service box dropdown.
  const [itemSearch, setItemSearch] = useState("");
  // Búsqueda del desplegable de Categoría (04-08): mismo patrón sticky
  // del buscador de ítems — con 12 categorías igual ayuda y uniforma.
  const [catSearch, setCatSearch] = useState("");
  // Desplegable de servicios FIJOS con secciones (30-07, calco del de
  // items de variables): botón + buscador pegajoso + rótulos.
  const [openFixedPicker, setOpenFixedPicker] = useState<number | null>(null);
  const [fixedSearch, setFixedSearch] = useState("");
  const { data: fixedSections = [] } = useQuery({
    queryKey: ["fixedSections"],
    queryFn: getFixedSections,
  });
  // Posición de cada servicio fijo según su sección en el catálogo
  // (sección en su orden, "Sin sección" al final; adentro, sort_order).
  const fixedOrderOf = (codigo: string): number => {
    const svc = fixedServices.find((f) => f.codigo === codigo);
    if (!svc) return Number.MAX_SAFE_INTEGER;
    const secIdx =
      svc.section_id != null
        ? fixedSections.findIndex((sec) => sec.id === svc.section_id)
        : -1;
    const secPos = secIdx >= 0 ? secIdx : fixedSections.length;
    return secPos * 100000 + (svc.sort_order ?? 99999);
  };
  const fixedSectionNameOf = (codigo: string): string => {
    const svc = fixedServices.find((f) => f.codigo === codigo);
    const sec =
      svc?.section_id != null
        ? fixedSections.find((x) => x.id === svc.section_id)
        : null;
    return sec ? sec.name : "Sin sección";
  };

  // Service groups (save/load a category + its items as a reusable group)
  const [groupModalBoxId, setGroupModalBoxId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);

  // Service group collections / "paquetes" (a group of service groups)
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [savingCollection, setSavingCollection] = useState(false);
  // Only one package can be active at a time; it overrides the current services.
  const [selectedCollection, setSelectedCollection] = useState<{
    id: number;
    name: string;
  } | null>(null);

  // Use custom hook for date availability checking
  const { hasConflicts: hasDateConflicts, isChecking: checkingConflicts } =
    useDateAvailability(formData.event_date, formData.event_end_date);

  // Secciones de categoría: la sección FIJA de una categoría hace que sus
  // servicios entren solos a la cotización al elegir la categoría, y no se
  // puedan quitar mientras la categoría siga en el evento (ej: pan y pebre).
  const [categorySections, setCategorySections] = useState<CategorySection[]>(
    [],
  );
  useEffect(() => {
    if (!company?.id) return;
    getCategorySections(Number(company.id)).then(setCategorySections);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  // Días del evento según el rango (1..N; sin "hasta" = 1). Con más de un
  // día, cada servicio lleva selector de día (variables parten en Día 1,
  // fijos en "Todo el evento").
  const eventDaysCount = (() => {
    if (!formData.event_date || !formData.event_end_date) return 1;
    const s = new Date(`${String(formData.event_date)}T00:00:00Z`).getTime();
    const e = new Date(
      `${String(formData.event_end_date)}T00:00:00Z`,
    ).getTime();
    if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return 1;
    return Math.min(60, Math.round((e - s) / 86400000) + 1);
  })();
  const dayLabel = (n: number) => {
    const base = new Date(`${String(formData.event_date)}T00:00:00Z`);
    if (!Number.isFinite(base.getTime())) return `Día ${n}`;
    const d = new Date(base.getTime() + (n - 1) * 86400000);
    return `Día ${n} (${d.toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "UTC",
    })})`;
  };

  // Niños/adultos: people_count sigue siendo el TOTAL de asistentes;
  // children_count dice cuántos son niños. Cada caja multiplica por su
  // audiencia (o por su ajuste manual de personas).
  const childrenCount = Number(formData.children_count || 0);
  const adultsCount = Math.max(
    0,
    Number(formData.people_count || 0) - childrenCount,
  );
  const audienceCount = (box: Pick<ServiceBox, "audience">) =>
    box.audience === "ninos" ? childrenCount : adultsCount;
  const boxPeople = (box: Pick<ServiceBox, "audience" | "people">) =>
    box.people ?? audienceCount(box);

  // La categoría del catálogo a la que apunta una caja: por id (foto
  // nueva) o por nombre (foto vieja). El id no cambia nunca — diseño de
  // Felipe 06-08 para que renombrar no rompa cotizaciones guardadas.
  const cajaDe = (box: { selectedCategory?: string; selectedCategoryId?: number | null }) => ({
    category: box.selectedCategory,
    category_id: box.selectedCategoryId ?? null,
  });
  const catDeCaja = (box: any) => buscarCategoria(orderedCategories, cajaDe(box));
  const nomCat = (box: any) => nombreVigente(orderedCategories, cajaDe(box));

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

  // Items de la sección fija listos para entrar al box (solo activos).
  const defaultServicesFor = (categoryName: string): SelectedService[] =>
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

  // Fetch quotation data if ID exists in URL
  useEffect(() => {
    const fetchQuotationData = async () => {
      if (id) {
        try {
          const { data, error } = await getQuotationById(id);
          if (error) {
            toast.error("No se pudo cargar la cotización.");
            navigate("/quotations");
            return;
          }
          if (data) {
            setQuotation(data);
            // Check if it's a requirement being converted to quotation
            if (data.request_type === QuotationRequestType.REQUERIMIENTO) {
              setIsFromRequirement(true);
            }
          }
        } catch (error) {
          console.error("Error fetching quotation:", error);
          toast.error("No se pudo cargar la cotización.");
          navigate("/quotations");
        }
      } else if (duplicateFrom) {
        // DUPLICAR: se hidrata el formulario con una copia SINTÉTICA de
        // la cotización origen — solo los campos del formulario, sin id
        // ni número (así el guardado CREA una nueva) y sin fecha (hay
        // que elegirla). El backend valida con whitelist estricta, por
        // eso no se copia el objeto completo.
        try {
          const { data } = await getQuotationById(duplicateFrom);
          if (!data) return;
          setQuotation({
            client_id: data.client_id,
            event_type: data.event_type,
            event_date: "", // la fecha del nuevo evento se elige
            event_end_date: null,
            people_count: data.people_count,
            children_count: data.children_count,
            subtotal_amount: data.subtotal_amount,
            discount_percentage: data.discount_percentage,
            discount_amount: data.discount_amount,
            total_amount: data.total_amount,
            quotation_status: QuotationStatus.SOLICITADA,
            request_type: QuotationRequestType.COTIZACION,
            observations: data.observations || "",
            value_per_person: data.value_per_person,
            fixed_value: data.fixed_value,
            items: data.items,
            tip_percentage: data.tip_percentage,
            contact_name: data.contact_name,
            has_contract: data.has_contract,
            requires_invoice: data.requires_invoice,
            payment_plan_type: data.payment_plan_type,
            // Los service boxes se cargan desde la cotización origen:
            __items_source_id: duplicateFrom,
          });
        } catch (error) {
          console.error("Error duplicando cotización:", error);
        }
      }
    };

    fetchQuotationData();
  }, [id, duplicateFrom, navigate]);

  // (Clientes y tipos los carga React Query automáticamente.)

  // Update form validity when client form data changes
  useEffect(() => {
    const validation = validateCompleteClientForm(clientFormData);
    setClientErrors(validation.errors);
    setIsFormValid(validation.isValid);
  }, [clientFormData]);

  // Helper function to check if a field should show error
  const shouldShowError = (fieldName: keyof typeof touchedFields) => {
    return touchedFields[fieldName] && clientErrors[fieldName];
  };

  useEffect(() => {
    if (quotation) {
      // __items_source_id es solo una instrucción interna del modo
      // "duplicar": NO debe viajar en el payload (whitelist estricta).
      const { __items_source_id, ...quotationFields } = quotation;
      setFormData({
        ...quotationFields,
        event_date: String(quotation.event_date || "").split("T")[0],
        event_end_date: quotation.event_end_date
          ? String(quotation.event_end_date).split("T")[0]
          : undefined,
      });
      setDiscType((quotation.discount_amount || 0) > 0 ? "$" : "%");
      // Propina guardada (null = sin propina)
      setTipEnabled(quotation.tip_percentage != null);
      setTipPct(quotation.tip_percentage ?? 10);
      setIsEditingExisting(!!quotation.id);

      // SIEMPRE cargar items desde la base de datos si tiene ID (o desde
      // la cotización origen cuando se está duplicando).
      // FASE VELOCIDAD (28-07): al EDITAR, la cotización recién traída
      // YA viene con sus items — volver a pedirla a la base era una
      // segunda llamada idéntica. Solo se viaja a la base al DUPLICAR
      // (los items vienen de otra cotización).
      const itemsSourceId = quotation.id || __items_source_id;
      if (itemsSourceId === quotation.id && quotation.id) {
        if (quotation.items) {
          const kids = Number(quotation.children_count || 0);
          const adults = Math.max(
            0,
            Number(quotation.people_count || 0) - kids,
          );
          loadExistingItemsFromJSON(quotation.items, adults, kids);
        } else {
          setSelectedFixedServices([]);
        }
      } else if (itemsSourceId) {
        loadItemsFromDatabase(itemsSourceId);
      }

      // Fetch user information if quotation has user_id
      if (quotation.user_id) {
        fetchCreatorUser(quotation.user_id);
      }
    }
  }, [quotation]);

  const fetchCreatorUser = async (userId: string) => {
    try {
      const { data, error } = await getUser(userId);
      if (!error && data) {
        setCreatorUser(data);
      }
    } catch (error) {
      console.error("Error fetching creator user:", error);
    }
  };

  // Ensure client_id is properly set when editing and clients are loaded
  useEffect(() => {
    if (quotation?.client_id && clients.length > 0) {
      // Ensure the client_id is set in formData
      setFormData((prev) => ({
        ...prev,
        client_id: quotation.client_id,
      }));
    }
  }, [quotation, clients]);

  // "Nueva cotización" desde la ficha 360°: cliente ya preseleccionado.
  useEffect(() => {
    if (!id && !duplicateFrom && navClientId && clients.length > 0) {
      setFormData((prev) => ({ ...prev, client_id: navClientId }));
    }
  }, [navClientId, clients, id, duplicateFrom]);

  useEffect(() => {
    // Obtener categorías únicas de productos
    const categories = [
      ...new Set(products.map((p) => p.categoria || "General")),
    ];
    setServiceCategories(categories);
  }, [products]);

  useEffect(() => {
    calculateTotals();
  }, [
    serviceBoxes,
    selectedFixedServices,
    formData.people_count,
    formData.children_count,
  ]);

  useEffect(() => {
    calculateTotals();
  }, [
    formData.discount_percentage,
    formData.discount_amount,
    discType,
    tipEnabled,
    tipPct,
  ]);

  // Handle clicking outside dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest(".dropdown-container")) {
        setOpenDropdown(null);
        setOpenFixedPicker(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const loadItemsFromDatabase = async (quotationId: string) => {
    try {
      const { data: quotationData } = await getQuotationById(quotationId);

      if (quotationData?.items) {
        // Los conteos de la cotización permiten distinguir "automático"
        // (personas = su audiencia) de un ajuste manual.
        const kids = Number(quotationData.children_count || 0);
        const adults = Math.max(
          0,
          Number(quotationData.people_count || 0) - kids,
        );
        loadExistingItemsFromJSON(quotationData.items, adults, kids);
      } else {
        // Limpiar servicios seleccionados si no hay items
        setSelectedFixedServices([]);
      }
    } catch (error) {
      console.error("Error cargando items desde JSON:", error);
    }
  };

  const loadExistingItemsFromJSON = (
    itemsData: any,
    adultsAtLoad?: number,
    kidsAtLoad?: number,
  ) => {
    // Cargar servicios variables (cada service box es una entidad separada)
    const serviceBoxesData: ServiceBox[] = [];

    if (
      itemsData.variable_services &&
      Array.isArray(itemsData.variable_services)
    ) {
      itemsData.variable_services.forEach((serviceBox: any, index: number) => {
        if (serviceBox.items && Array.isArray(serviceBox.items)) {
          // Create a service box for this group
          const boxId = `loaded-${index + 1}`;
          const boxServices: SelectedService[] = [];

          serviceBox.items.forEach((item: any) => {
            const service: SelectedService = {
              codigo: item.codigo,
              nombre: item.nombre,
              precio: item.precio,
              categoria: item.categoria || serviceBox.category,
              quantity: item.quantity || 1,
            };
            boxServices.push(service);
          });

          serviceBoxesData.push({
            id: boxId,
            selectedCategory: serviceBox.category,
            selectedCategoryId: serviceBox.category_id ?? null,
            selectedItem: "",
            services: boxServices,
            day: serviceBox.day || 1,
            // Audiencia y personas del servicio (cotizaciones antiguas:
            // adultos y automático). people guardado se respeta como
            // ajuste manual solo si difiere del total de su audiencia.
            audience: serviceBox.audience === "ninos" ? "ninos" : "adultos",
            people: (() => {
              if (typeof serviceBox.people !== "number") return undefined;
              const expected =
                serviceBox.audience === "ninos"
                  ? (kidsAtLoad ?? -1)
                  : (adultsAtLoad ?? -1);
              return serviceBox.people === expected
                ? undefined
                : serviceBox.people;
            })(),
          });
        }
      });
    }

    // Cargar servicios fijos
    const fixedServicesLoaded: SelectedFixedService[] = (
      itemsData.fixed_services || []
    ).map((item: any) => ({
      codigo: item.codigo,
      nombre: item.nombre,
      precio_calculado: item.precio,
      categoria: item.categoria || "General",
      quantity: item.quantity || 1,
      tipo_calculo: item.tipo_calculo || "fijo",
      min_precio: item.min_precio || 0,
      max_precio: item.max_precio || 0,
      precio_por_persona: item.precio_por_persona || 0,
      day: item.day || 0,
    }));

    setSelectedFixedServices(fixedServicesLoaded);

    // Set service boxes from loaded data
    if (serviceBoxesData.length > 0) {
      setServiceBoxes(serviceBoxesData);
    }
  };

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
    Math.round((formData.subtotal_amount * getMaxDiscountForRole()) / 100);

  // Monto del descuento según el modo activo (para totales y despliegue).
  const discountAmountUI =
    discType === "$"
      ? Math.min(
          formData.subtotal_amount,
          Math.round(formData.discount_amount || 0),
        )
      : Math.round(
          formData.subtotal_amount *
            ((formData.discount_percentage || 0) / 100),
        );
  const hasDiscount = discountAmountUI > 0;

  // ---------- MARGEN EN EL COTIZADOR (24-07, con Felipe) ----------
  // La foto de servicios que se guarda en la cotización. ANTES vivía
  // dentro de handleSubmit; se sacó acá SIN cambiarle nada para que el
  // cálculo de margen pueda armarla en cada tecla. La usan los dos: el
  // guardado (igual que siempre) y el cuadro de margen.
  const buildItemsSnapshot = (): QuotationFormData["items"] => ({
    variable_services: serviceBoxes
      .filter((box) => box.selectedCategory && box.services.length > 0)
      .map((box) => ({
        category: box.selectedCategory,
        // El id NO cambia nunca: con él la caja reencuentra su
        // categoría aunque se renombre en el catálogo.
        // El id ya guardado se respeta si el catálogo no resuelve (una
        // caída del catálogo NO puede borrar el vínculo — paridad con
        // ServiciosTab).
        category_id: catDeCaja(box)?.id ?? box.selectedCategoryId ?? null,
        day: Math.min(box.day || 1, eventDaysCount),
        // Audiencia y personas RESUELTAS del servicio: la foto queda
        // completa aunque después cambien los contadores del evento.
        audience: box.audience || "adultos",
        people: boxPeople(box),
        items: box.services.map((service) => ({
          codigo: service.codigo,
          nombre: service.nombre,
          precio: service.precio,
          categoria: service.categoria,
          quantity: service.quantity,
        })),
      })),
    fixed_services: [...selectedFixedServices]
      .filter((s) => s?.codigo)
      .sort((a, b) => fixedOrderOf(a.codigo) - fixedOrderOf(b.codigo))
      .map((service) => ({
        codigo: service.codigo,
        nombre: service.nombre,
        day: Math.min(service.day || 0, eventDaysCount),
        precio: service.precio_calculado,
        categoria: service.categoria,
        quantity: service.quantity,
        tipo_calculo: service.tipo_calculo || "fijo",
        min_precio: service.min_precio || 0,
        max_precio: service.max_precio || 0,
        precio_por_persona: service.precio_por_persona || 0,
      })),
  });

  // Solo operaciones y administrador ven el costo (decisión de Felipe).
  // El vendedor sigue pudiendo descontar, pero sin ver el margen.
  const puedeVerMargen =
    userRole === UserRole.ADMINISTRADOR || userRole === UserRole.OPERACIONES;

  // Misma llave que Compras y el Dashboard: si otra pantalla ya la pidió,
  // sale de caché y no cuesta nada.
  const marginBaseQuery = useQuery({
    queryKey: ["logistica", "compras", "base", company?.id],
    staleTime: 5 * 60 * 1000,
    enabled: !!user && !!company?.id && puedeVerMargen,
    queryFn: getBaseCatalogo,
  });

  // Costo ESTIMADO DE CATÁLOGO: recetas → insumos, más los costos fijos
  // del catálogo. Ojo: acá los costos fijos SÍ van del catálogo, al revés
  // del dashboard, porque el evento todavía no existe y no tiene recursos
  // asignados con precio negociado. Es una estimación previa a propósito.
  const margenCotizador = useMemo(() => {
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
      Number(formData.people_count) || 0,
      ctx,
      acc,
    );
    return {
      costo: r.costoInsumos + r.costoFijos,
      sinReceta: [...new Set(acc.noRecipe)],
    };
    // buildItemsSnapshot se rearma sola cuando cambia cualquiera de estos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    marginBaseQuery.data,
    serviceBoxes,
    selectedFixedServices,
    formData.people_count,
    childrenCount,
    eventDaysCount,
  ]);

  const addServiceBox = () => {
    const newBox: ServiceBox = {
      id: Date.now().toString(),
      selectedCategory: "",
      selectedItem: "",
      services: [],
    };
    setServiceBoxes((prev) => [...prev, newBox]);
  };

  const toggleBoxCollapsed = (boxId: string) =>
    setCollapsedBoxes((prev) => {
      const next = new Set(prev);
      if (next.has(boxId)) next.delete(boxId);
      else next.add(boxId);
      return next;
    });

  // Reorden con flechitas ▲▼ (04-08: el drag de cajas se jubiló, igual
  // que ayer el del catálogo). Estado local puro del formulario.
  const moveBox = (index: number, delta: number) => {
    setServiceBoxes((prev) => {
      const to = index + delta;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const removeServiceBox = (boxId: string) => {
    setServiceBoxes((prev) => prev.filter((box) => box.id !== boxId));
  };

  // Build a service box pre-filled from a saved group.
  // Prices/names are re-hydrated live from the group's joined variable services.
  const buildBoxFromGroup = (group: ServiceGroup): ServiceBox | null => {
    const services: SelectedService[] = (group.items || [])
      .filter((item) => item.service)
      .map((item) => ({
        codigo: item.service.id.toString(),
        nombre: item.service.name,
        precio: item.service.price,
        categoria: item.service.category,
        quantity: item.quantity,
      }));

    if (services.length === 0) return null;

    // Los servicios de la sección fija de la categoría van sí o sí, aunque el
    // grupo se haya guardado antes de definirla.
    const missing = defaultServicesFor(group.category).filter(
      (d) => !services.some((s) => s.codigo === d.codigo),
    );
    const all = [...services, ...missing];

    return {
      id: `group-${group.id}-${Date.now()}`,
      selectedCategory: group.category,
      selectedItem: "",
      services: all,
      groupName: group.name,
    };
  };

  // Aplica un menu guardado A UNA caja existente (mockup: el link vive
  // dentro de la caja). Conserva dia, audiencia y personas de la caja.
  const loadGroupIntoBox = (boxId: string, group: ServiceGroup) => {
    const built = buildBoxFromGroup(group);
    if (!built) return;
    setServiceBoxes((prev) =>
      prev.map((b) =>
        b.id === boxId
          ? {
              ...b,
              selectedCategory: built.selectedCategory,
              selectedItem: "",
              services: built.services,
              groupName: built.groupName,
            }
          : b,
      ),
    );
  };

  const openSaveGroupModal = (boxId: string) => {
    setGroupModalBoxId(boxId);
    setGroupName("");
  };

  const confirmSaveGroup = async () => {
    if (!groupModalBoxId || !groupName.trim()) return;
    const box = serviceBoxes.find((b) => b.id === groupModalBoxId);
    if (!box) return;

    // Map each box item (keyed by codigo) back to its variable_services row id.
    // New items are keyed by id; older saved items may still carry a legacy
    // `code`, so we match by id first and fall back to code for compatibility.
    const items = box.services
      .map((service) => {
        const match = variableServices.find(
          (vs) =>
            vs.id.toString() === service.codigo ||
            (vs.code && vs.code === service.codigo),
        );
        return match
          ? { variable_service_id: match.id, quantity: service.quantity }
          : null;
      })
      .filter(
        (item): item is { variable_service_id: number; quantity: number } =>
          item !== null,
      );

    if (items.length === 0) {
      toast.error("No se pudieron asociar los ítems con servicios válidos.");
      return;
    }

    setSavingGroup(true);
    try {
      await saveGroup({
        name: groupName.trim(),
        // Con el nombre VIGENTE: guardado con el viejo, el menú no
        // aparecería nunca en su propia caja.
        category: nomCat(box),
        items,
      });
      setGroupModalBoxId(null);
      setGroupName("");
      toast.success("Grupo guardado.");
    } catch (error) {
      // El servidor sabe POR QUÉ falló (nombre repetido, etc.): decirlo
      // en vez del "no se pudo" mudo (pillado 05-08 con un nombre ya
      // usado por un menú viejo).
      toast.error(`No se pudo guardar el menú: ${humanizeApiError(error)}`);
    } finally {
      setSavingGroup(false);
    }
  };

  // Selecting a package OVERRIDES the current services with one box per group.
  // Only one package can be active at a time.
  const loadCollectionAsBoxes = (collection: ServiceGroupCollection) => {
    const boxes = (collection.groups || [])
      .map((item) => (item.group ? buildBoxFromGroup(item.group) : null))
      .filter((box): box is ServiceBox => box !== null);

    if (boxes.length === 0) return;

    setServiceBoxes(boxes);
    setSelectedCollection({ id: collection.id, name: collection.name });
  };

  const openCollectionModal = () => {
    setSelectedGroupIds([]);
    setCollectionName("");
    setShowCollectionModal(true);
  };

  const toggleSelectedGroup = (groupId: number) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId],
    );
  };

  const confirmCreateCollection = async () => {
    if (!collectionName.trim() || selectedGroupIds.length === 0) return;

    setSavingCollection(true);
    try {
      await saveCollection({
        name: collectionName.trim(),
        items: selectedGroupIds.map((id) => ({ service_group_id: id })),
      });
      setShowCollectionModal(false);
      setCollectionName("");
      setSelectedGroupIds([]);
      toast.success("Paquete guardado.");
    } catch (error) {
      toast.error("No se pudo guardar el paquete.");
    } finally {
      setSavingCollection(false);
    }
  };

  const updateServiceBox = (boxId: string, field: string, value: string) => {
    // Al elegir categoría, sus servicios de sección fija entran de inmediato.
    const seeded =
      field === "selectedCategory" && value ? defaultServicesFor(value) : [];
    setServiceBoxes((prev) =>
      prev.map((box) =>
        box.id === boxId
          ? {
              ...box,
              [field]: value,
              // El botón del selector no se queda mostrando el último
              // ítem pinchado (04-08, "ensucia la vista"): tras sumar,
              // vuelve al placeholder. El agregado de abajo usa `value`
              // directo, así que nada se pierde.
              ...(field === "selectedItem" ? { selectedItem: "" } : {}),
              ...(field === "selectedCategory"
                ? {
                    selectedItem: "",
                    services: seeded,
                    // La caja nace atada al id del catálogo.
                    selectedCategoryId:
                      orderedCategories.find((c) => c.name === value)?.id ??
                      null,
                  }
                : {}),
            }
          : box,
      ),
    );

    // Si se selecciona un item, agregarlo al box específico
    if (field === "selectedItem" && value) {
      const product = products.find((p) => p.codigo === value);
      if (product) {
        setServiceBoxes((prev) =>
          prev.map((box) => {
            if (box.id === boxId) {
              // Check if item already exists in this box
              const existingServiceIndex = box.services.findIndex(
                (s) => s.codigo === value,
              );

              if (existingServiceIndex >= 0) {
                // Increment quantity of existing service
                const updatedServices = [...box.services];
                updatedServices[existingServiceIndex] = {
                  ...updatedServices[existingServiceIndex],
                  quantity: updatedServices[existingServiceIndex].quantity + 1,
                };
                return { ...box, services: updatedServices };
              } else {
                // Add new service to this box
                const newService: SelectedService = {
                  codigo: product.codigo,
                  nombre: product.nombre,
                  precio: product.precio,
                  categoria: product.categoria || "General",
                  quantity: 1,
                };
                return {
                  ...box,
                  services: [...box.services, newService],
                };
              }
            }
            return box;
          }),
        );
      }
    }
  };

  const getSelectedItemsForBox = (boxId: string) => {
    const box = serviceBoxes.find((b) => b.id === boxId);
    if (!box) return [];

    return box.services;
  };

  // (loadClients eliminado: la lista vive en el caché ["clients"].)

  // generateQuotationNumber function removed - quotation_number is now auto-generated in database

  // Contactos del cliente: se cargan al elegirlo (y al abrir una
  // cotizacion existente).
  useEffect(() => {
    if (!formData.client_id) {
      setClientContacts([]);
      return;
    }
    getClientContacts(formData.client_id).then(setClientContacts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.client_id]);

  const addClientContact = async () => {
    const name = newContactName.trim();
    if (!name || !formData.client_id || !company?.id) return;
    const problema =
      phoneProblem(newContactPhone) || emailProblem(newContactEmail);
    if (problema) {
      setNewContactError(problema);
      return;
    }
    setNewContactError(null);
    setSavingContact(true);
    const { data, error } = await createClientContact({
      company_id: company.id,
      client_id: formData.client_id,
      name,
      email: newContactEmail.trim() || null,
      phone: newContactPhone.trim() || null,
      // Si el cliente no tenia personas, la primera queda como principal
      is_primary: clientContacts.length === 0,
    });
    setSavingContact(false);
    if (!error && data) {
      setClientContacts((prev) =>
        [...prev, data].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setFormData((prev) => ({ ...prev, contact_name: data.name }));
      setNewContactOpen(false);
      setNewContactName("");
      setNewContactEmail("");
      setNewContactPhone("");
    }
  };

  const handleClientSelect = (clientId: string, clientData?: any) => {
    const selectedClient = clientData || clients.find((c) => c.id === clientId);
    if (selectedClient) {
      setFormData((prev) => ({
        ...prev,
        client_id: clientId,
        // el contacto pertenece al cliente anterior: se limpia
        contact_name: prev.client_id === clientId ? prev.contact_name : null,
      }));
    }
  };

  // Validation function for client form
  const validateClientFormData = (): boolean => {
    const validation = validateCompleteClientForm(clientFormData);
    setClientErrors(validation.errors);
    setIsFormValid(validation.isValid);
    return validation.isValid;
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Validate client form before submission
    if (!validateClientFormData()) {
      // Los campos con problema ya quedan marcados en rojo (aviso 8 de
      // la lista del destierro: la ventana repetía lo visible — fuera).
      return;
    }

    setClientLoading(true);

    try {
      const { data: newClient } = await createClient(clientFormData);

      if (newClient) {
        // El cliente nuevo entra al caché al instante (visible en el
        // selector) y se confirma con el servidor por detrás.
        queryClientRQ.setQueryData<any[]>(["clients"], (prev) => [
          ...(prev ?? []),
          newClient,
        ]);
        queryClientRQ.invalidateQueries({ queryKey: ["clients"] });

        // Auto-select the newly created client with its data
        handleClientSelect(newClient.id, newClient);
      }

      // Reset client form and close modal
      setClientFormData({
        name: "",
        email: "",
        phone: "",
        contact_person: "",
        client_type: DEFAULT_CLIENT_TYPE,
      });

      setShowClientModal(false);
      toast.success("Cliente creado.");
    } catch (error) {
      console.error("Error creating client:", error);
      toast.error("No se pudo crear el cliente.");
    } finally {
      setClientLoading(false);
    }
  };

  const getFilteredProducts = (categoria: string) => {
    return products.filter((p) => p.categoria === categoria);
  };

  const handleFixedServiceSelect = (serviceCodigo: string) => {
    if (!serviceCodigo) return;

    const service = fixedServices.find((s) => s.codigo === serviceCodigo);
    if (!service) return;

    const calculatedPrice = calculatePrice(service, formData.people_count);

    // Add new service
    setSelectedFixedServices((prev) => [
      ...prev,
      {
        codigo: service.codigo,
        nombre: service.nombre,
        precio_calculado: calculatedPrice,
        categoria: service.categoria || "General",
        quantity: 1,
        tipo_calculo: service.tipo_calculo || "fijo",
        min_precio: service.min_precio || 0,
        max_precio: service.max_precio || 0,
        precio_por_persona: service.precio_por_persona || 0,
      },
    ]);
  };

  const updateServiceQuantity = (
    codigo: string,
    newQuantity: number,
    boxId: string,
  ) => {
    if (!boxId) return;

    setServiceBoxes((prev) =>
      prev.map((box) => {
        if (box.id === boxId) {
          if (newQuantity <= 0) {
            // Los de la sección fija no se pueden quitar (quedan en 1).
            if (isLockedService(nomCat(box), codigo)) {
              return box;
            }
            // Remove service from this box
            return {
              ...box,
              services: box.services.filter((s) => s.codigo !== codigo),
            };
          } else {
            // Update quantity of service in this box
            return {
              ...box,
              services: box.services.map((s) =>
                s.codigo === codigo ? { ...s, quantity: newQuantity } : s,
              ),
            };
          }
        }
        return box;
      }),
    );
  };

  const removeFixedService = (index: number) => {
    setSelectedFixedServices((prev) => prev.filter((_, i) => i !== index));
  };

  // La ventanita de selección vive SIEMPRE al final (Felipe 30-07:
  // fuera el botón '+ Agregar servicio fijo'); este efecto garantiza
  // exactamente un slot vacío esperando elección.
  useEffect(() => {
    if (!selectedFixedServices.some((sv) => !sv?.codigo)) {
      addNewFixedServiceSlot();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFixedServices]);

  const addNewFixedServiceSlot = () => {
    setSelectedFixedServices((prev) => [
      ...prev,
      {
        codigo: "",
        nombre: "",
        precio_calculado: 0,
        categoria: "",
        quantity: 1,
        tipo_calculo: "fijo",
        min_precio: 0,
        max_precio: 0,
        precio_por_persona: 0,
      },
    ]);
  };

  // EL CÁLCULO DEVUELVE, NO GUARDA (25-07-2026).
  //
  // Antes toda esta cuenta vivía dentro de calculateTotals() y su único
  // resultado era escribir formData desde un useEffect — o sea, DESPUÉS
  // de pintar la pantalla. El porcentaje que el usuario escribía quedaba
  // al tiro en formData, pero el total recién se actualizaba un ciclo
  // más tarde. Si alguien tecleaba el descuento y apretaba Guardar en
  // ese hueco, se guardaba el PORCENTAJE NUEVO con el TOTAL VIEJO: una
  // cotización que dice "5% de descuento" y tiene el total sin descontar
  // (le pasó a la 248 de Valle del Sol, y a otras tres).
  //
  // La regla ahora: los números se calculan acá y se DEVUELVEN. La
  // pantalla los guarda en formData como siempre (calculateTotals, más
  // abajo), pero handleSubmit los vuelve a pedir en el momento de
  // guardar. Lo que se persiste ya no depende de que un efecto haya
  // alcanzado a correr.
  //
  // Si mañana se agrega otro número al total (otro recargo, otro
  // impuesto), va ACÁ ADENTRO y sale por el return. Calcularlo aparte en
  // handleSubmit es exactamente el bug que esto vino a cerrar.
  const computeTotals = () =>
    // FASE 1.2 (27-07-2026): la cuenta es UNA y vive en @dinero
    // (api-rest/src/quotations/utils/money.ts) — la misma que usa el
    // backend para verificar el guardado. Se calcula SOBRE LA FOTO de
    // los ítems (buildItemsSnapshot), que es exactamente lo que se
    // guarda: pantalla, payload y verificación no pueden discrepar.
    computeMoney({
      items: buildItemsSnapshot(),
      people_count: Number(formData.people_count || 0),
      children_count: childrenCount,
      // Solo el modo activo del descuento entra a la cuenta (igual que
      // en el payload: el otro viaja en 0).
      discount_percentage:
        discType === "%" ? formData.discount_percentage || 0 : 0,
      discount_amount: discType === "$" ? formData.discount_amount || 0 : 0,
      tip_percentage: tipEnabled ? tipPct || 0 : null,
    });

  // Lo que ve la pantalla. Misma cuenta de arriba, guardada en estado.
  const calculateTotals = () => {
    const t = computeTotals();

    setTipAmountUI(t.tipAmount);

    setFormData((prev) => ({
      ...prev,
      value_per_person: t.valuePerPerson,
      fixed_value: t.fixedTotal,
      subtotal_amount: t.subtotalAmount,
      total_amount: t.totalAmount,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);

    try {
      // Prepare items JSON structure - each service box is saved as a separate entity
      // (24-07: el armado se movió a buildItemsSnapshot, arriba, para que
      // el cuadro de margen use exactamente la misma foto. Sin cambios.)
      const itemsData: QuotationFormData["items"] = buildItemsSnapshot();

      // LOS TOTALES SE CALCULAN ACÁ, NO SE LEEN DE formData (25-07-2026).
      //
      // formData recién trae los totales buenos después de que corre el
      // useEffect que llama a calculateTotals. Si el usuario cambia el
      // descuento o la propina y guarda antes de eso, formData todavía
      // tiene el total anterior — y se guardaba el % nuevo con el total
      // viejo. Pidiéndolos de nuevo acá, el número que se persiste sale
      // siempre de la misma pasada que el porcentaje que lo acompaña.
      const t = computeTotals();

      const quotationData = {
        ...formData,
        event_type: formData.event_type,
        event_date: formData.event_date,
        event_end_date: formData.event_end_date || null,
        children_count: childrenCount,
        tip_percentage: tipEnabled ? tipPct || 0 : null,
        // El MONTO de la propina se guarda (migración 37). Sale del mismo
        // computeTotals que armó total_amount, así que es exactamente el
        // número que ya está sumado adentro. Con la propina apagada,
        // computeTotals ya devuelve 0: no hace falta preguntarlo dos veces.
        tip_amount: Math.round(t.tipAmount),
        request_type: isFromRequirement
          ? QuotationRequestType.COTIZACION
          : formData.request_type,
        // Solo el modo activo del descuento viaja con valor; el otro va en 0.
        // El MONTO sale de computeTotals porque ahí viene topado al
        // subtotal: así subtotal − descuento siempre da el total guardado,
        // aunque alguien escriba un descuento más grande que la cotización.
        discount_percentage:
          discType === "%" ? formData.discount_percentage || 0 : 0,
        discount_amount: discType === "$" ? Math.round(t.discountAmount) : 0,
        value_per_person: Math.round(t.valuePerPerson),
        fixed_value: Math.round(t.fixedTotal),
        subtotal_amount: Math.round(t.subtotalAmount),
        total_amount: Math.round(t.totalAmount),
        items: itemsData,
        quotation_status: isFromRequirement
          ? QuotationStatus.ENVIADA
          : formData.quotation_status,
      };

      // UNA sola lista de campos editables, compartida por crear y
      // actualizar. Si mañana se agrega un campo nuevo, se agrega AQUÍ y
      // viaja por ambos caminos — así no puede repetirse el bug de
      // children_count/tip/contacto perdidos al editar (20-07-2026).
      const editableFields: QuotationFormDataUpdate = {
        client_id: quotationData.client_id,
        event_type: quotationData.event_type,
        event_date: quotationData.event_date,
        event_end_date: quotationData.event_end_date || null,
        request_type: quotationData.request_type,
        value_per_person: quotationData.value_per_person,
        fixed_value: quotationData.fixed_value,
        subtotal_amount: quotationData.subtotal_amount,
        total_amount: quotationData.total_amount,
        items: quotationData.items,
        quotation_status: quotationData.quotation_status,
        people_count: quotationData.people_count,
        discount_percentage: quotationData.discount_percentage,
        discount_amount: quotationData.discount_amount,
        observations: quotationData.observations,
        children_count: quotationData.children_count,
        tip_percentage: quotationData.tip_percentage,
        // El monto de la propina viaja por los dos caminos, igual que el %:
        // si faltara acá, editar una cotización la dejaría en 0 (migración 37).
        tip_amount: quotationData.tip_amount,
        contact_name: quotationData.contact_name,
      };

      // if quotation already exists (from requirement or updating a quotation)
      if (quotation?.id || isFromRequirement) {
        // Actualizar cotización existente
        const targetId = quotation?.id;
        if (!targetId) {
          throw new Error(
            "No se puede actualizar: ID de cotización no encontrado",
          );
        }

        const { error } = await updateQuotation(editableFields, targetId);

        if (error) throw error;
      }
      // if quotation does not exist
      else {
        // Create new quotation
        const { error } = await createQuotation({
          ...quotationData,
          ...editableFields,
        });

        if (error) throw error;
      }

      toast.success(
        isEditingExisting ? "Cotización actualizada." : "Cotización guardada.",
      );
      // Al crear, el tablero olvida sus filtros: la tarjeta nueva
      // debe aparecer sí o sí al volver (una búsqueda vieja que la
      // esconde se lee como "la creación falló").
      if (!isEditingExisting) olvidarFiltrosTablero(user?.id);
      volver();
    } catch (error) {
      toast.error(
        `No se pudo guardar la cotización: ${humanizeApiError(error)}`,
      );
    } finally {
      setLoading(false);
    }
  };

  // Campos obligatorios que faltan (para deshabilitar Guardar Y decir por qué).
  const missingRequiredFields = () => {
    const missing: string[] = [];
    if (formData.client_id.trim() === "") missing.push("cliente");
    if (formData.event_type.trim() === "") missing.push("tipo de evento");
    // OJO: con ?. la fecha vacía (undefined) pasaba la validación — por eso
    // el backend devolvía un 400 críptico. Ahora se exige de verdad.
    if (!formData.event_date || String(formData.event_date).trim() === "") {
      missing.push("fecha del evento");
    }
    if (!Number(formData.people_count || 0)) missing.push("asistentes");
    return missing;
  };

  const isQuotationFormValid = () => {
    return (
      missingRequiredFields().length === 0 &&
      formData.client_id.trim() !== "" &&
      formData.event_type.trim() !== "" &&
      formData.event_date?.toString().trim() !== ""
    );
  };

  const isRestrictedEditing =
    quotation?.quotation_status === QuotationStatus.ACEPTADA &&
    !(userRole === UserRole.ADMINISTRADOR || userRole === UserRole.OPERACIONES);

  if (servicesLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Client Creation Modal */}
      {showClientModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Crear Nuevo Cliente
              </h3>
              <button
                onClick={() => {
                  setShowClientModal(false);
                  setClientErrors({
                    name: "",
                    email: "",
                    phone: "",
                    contact_person: "",
                  });
                  setIsFormValid(false);
                  setTouchedFields({
                    name: false,
                    email: false,
                    phone: false,
                    contact_person: false,
                  });
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del Cliente
                </label>
                <input
                  type="text"
                  required
                  value={clientFormData.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setClientFormData((prev) => ({ ...prev, name }));
                  }}
                  onBlur={() =>
                    setTouchedFields((prev) => ({ ...prev, name: true }))
                  }
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${shouldShowError("name") ? "border-red-500" : ""}`}
                  placeholder="Nombre completo o empresa"
                />
                {shouldShowError("name") && (
                  <p className="text-red-500 text-sm mt-1">
                    {clientErrors.name}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={clientFormData.email}
                  onChange={(e) => {
                    const email = e.target.value;
                    setClientFormData((prev) => ({ ...prev, email }));
                  }}
                  onBlur={() =>
                    setTouchedFields((prev) => ({ ...prev, email: true }))
                  }
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${shouldShowError("email") ? "border-red-500" : ""}`}
                  placeholder="correo@ejemplo.com"
                />
                {shouldShowError("email") && (
                  <p className="text-red-500 text-sm mt-1">
                    {clientErrors.email}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Teléfono
                </label>
                <input
                  type="tel"
                  value={clientFormData.phone}
                  onChange={(e) => {
                    const phone = e.target.value;
                    setClientFormData((prev) => ({ ...prev, phone }));
                  }}
                  onBlur={() => {
                    // Al salir del recuadro el número queda ordenado y a la
                    // vista, para que se note que quedó bien guardado.
                    setClientFormData((prev) => ({
                      ...prev,
                      phone: normalizePhone(prev.phone || ""),
                    }));
                    setTouchedFields((prev) => ({ ...prev, phone: true }));
                  }}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${shouldShowError("phone") ? "border-red-500" : ""}`}
                  placeholder={PHONE_PLACEHOLDER}
                />
                {shouldShowError("phone") && (
                  <p className="text-red-500 text-sm mt-1">
                    {clientErrors.phone}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Persona de Contacto
                </label>
                <input
                  type="text"
                  value={clientFormData.contact_person}
                  onChange={(e) => {
                    const contact_person = e.target.value;
                    setClientFormData((prev) => ({ ...prev, contact_person }));
                  }}
                  onBlur={() =>
                    setTouchedFields((prev) => ({
                      ...prev,
                      contact_person: true,
                    }))
                  }
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${shouldShowError("contact_person") ? "border-red-500" : ""}`}
                  placeholder="Nombre del contacto principal"
                />
                {shouldShowError("contact_person") && (
                  <p className="text-red-500 text-sm mt-1">
                    {clientErrors.contact_person}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Cliente
                </label>
                <SelectWithSearch
                  options={clientTypesList.map((type) => ({
                    value: type,
                    label: type,
                  }))}
                  value={clientFormData.client_type}
                  onChange={(v) =>
                    setClientFormData((prev) => ({
                      ...prev,
                      client_type: v,
                    }))
                  }
                  placeholder="Tipo de cliente"
                  searchPlaceholder="Buscar tipo…"
                  noResultsText="Sin resultados"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowClientModal(false);
                    setClientErrors({
                      name: "",
                      email: "",
                      phone: "",
                      contact_person: "",
                    });
                    setIsFormValid(false);
                    setTouchedFields({
                      name: false,
                      email: false,
                      phone: false,
                      contact_person: false,
                    });
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={clientLoading || !isFormValid}
                  className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
                    clientLoading || !isFormValid
                      ? "bg-gray-400 text-gray-600 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  <Plus size={16} />
                  <span>{clientLoading ? "Creando..." : "Crear Cliente"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Save Group Modal */}
      {groupModalBoxId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Guardar como grupo
              </h3>
              <button
                onClick={() => {
                  setGroupModalBoxId(null);
                  setGroupName("");
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Se guardará la categoría y todos sus items (con sus cantidades)
              como un grupo reutilizable.
            </p>

            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre del grupo
            </label>
            <input
              type="text"
              autoFocus
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Ej: Asado Premium"
            />

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setGroupModalBoxId(null);
                  setGroupName("");
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmSaveGroup}
                disabled={savingGroup || !groupName.trim()}
                className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
                  savingGroup || !groupName.trim()
                    ? "bg-gray-400 text-gray-600 cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                <Save size={16} />
                <span>{savingGroup ? "Guardando..." : "Guardar grupo"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Collection (paquete) Modal */}
      {showCollectionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Crear paquete
              </h3>
              <button
                onClick={() => setShowCollectionModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Un paquete agrupa varios grupos. Al seleccionarlo, el formulario
              se llena automáticamente con todos sus grupos.
            </p>

            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre del paquete
            </label>
            <input
              type="text"
              autoFocus
              value={collectionName}
              onChange={(e) => setCollectionName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
              placeholder="Ej: Paquete Matrimonio Full"
            />

            <label className="block text-sm font-medium text-gray-700 mb-1">
              Grupos incluidos
            </label>
            <div className="border border-gray-200 rounded-lg max-h-60 overflow-y-auto divide-y divide-gray-100">
              {serviceGroups.map((group) => (
                <label
                  key={group.id}
                  className="flex items-center space-x-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedGroupIds.includes(group.id)}
                    onChange={() => toggleSelectedGroup(group.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-900">{group.name}</span>
                  <span className="text-sm text-gray-500">
                    ({group.category})
                  </span>
                </label>
              ))}
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setShowCollectionModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmCreateCollection}
                disabled={
                  savingCollection ||
                  !collectionName.trim() ||
                  selectedGroupIds.length === 0
                }
                className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
                  savingCollection ||
                  !collectionName.trim() ||
                  selectedGroupIds.length === 0
                    ? "bg-gray-400 text-gray-600 cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                <Save size={16} />
                <span>
                  {savingCollection ? "Guardando..." : "Guardar paquete"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3 px-2">
          <button
            onClick={volver}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft size={20} />
            <span>Volver</span>
          </button>
          {isFromRequirement && (
            <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
              📋 Creando desde requerimiento
            </div>
          )}
          {isEditingExisting && !isFromRequirement && (
            <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
              ✏️ Editando cotización existente
            </div>
          )}
          {/* Modal: nueva persona de contacto (nombre obligatorio; correo y
          telefono opcionales — hay contactos solo-telefono o solo-correo) */}
          {newContactOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
                <h3 className="font-semibold text-gray-900 mb-4">
                  Nueva persona
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600">
                      Nombre *
                    </label>
                    <input
                      autoFocus
                      value={newContactName}
                      onChange={(e) => setNewContactName(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="Ej: Juanita Pérez"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600">
                      Correo
                    </label>
                    <input
                      type="email"
                      value={newContactEmail}
                      onChange={(e) => setNewContactEmail(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="correo@ejemplo.com"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600">
                      Teléfono
                    </label>
                    <input
                      value={newContactPhone}
                      onChange={(e) => setNewContactPhone(e.target.value)}
                      onBlur={() =>
                        setNewContactPhone((p) => normalizePhone(p || ""))
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder={PHONE_PLACEHOLDER}
                    />
                  </div>
                  {newContactError && (
                    <p className="text-xs text-red-600 font-medium pt-1">
                      {newContactError}
                    </p>
                  )}
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setNewContactOpen(false);
                        setNewContactName("");
                        setNewContactEmail("");
                        setNewContactPhone("");
                        setNewContactError(null);
                      }}
                      className="px-3 py-2 text-sm text-gray-600"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={addClientContact}
                      disabled={savingContact || !newContactName.trim()}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                    >
                      {savingContact ? "Guardando..." : "Guardar"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {isRestrictedEditing && (
            <div className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium">
              🔒 Solo Admin/Operaciones pueden editar cotizaciones aceptadas
            </div>
          )}
        </div>
        <div className="flex items-center space-x-3">
          {/* Eliminar (solo admin, solo cotización existente): mismas
              reglas de siempre, confirmación inline en la esquina. */}
          {isEditingExisting &&
            id &&
            userRole === UserRole.ADMINISTRADOR &&
            (confirmDeleteQ ? (
              <ConfirmInline
                question="¿Eliminar esta cotización? No se puede deshacer."
                busy={deletingQ}
                onYes={async () => {
                  setDeletingQ(true);
                  try {
                    await deleteQuotation(id);
                    queryClientRQ.invalidateQueries({
                      queryKey: ["quotations"],
                    });
                    queryClientRQ.invalidateQueries({
                      queryKey: ["requirements"],
                    });
                    navigate("/quotations");
                  } catch (error: any) {
                    setDeletingQ(false);
                    setConfirmDeleteQ(false);
                    // El backend sabe POR QUÉ no se pudo (plan de pagos,
                    // dinero registrado, reembolsos) y lo dice con la
                    // salida concreta. Mostrarlo tal cual. El texto de
                    // abajo es solo para cuando no llega respuesta:
                    // "intenta de nuevo" únicamente sirve si el problema
                    // de verdad puede desaparecer al reintentar.
                    setDeleteQError(
                      error?.response?.data?.message ||
                        "No se pudo eliminar la cotización. Revisa tu conexión e intenta de nuevo.",
                    );
                  }
                }}
                onNo={() => setConfirmDeleteQ(false)}
              />
            ) : (
              <span className="flex items-center gap-2">
                {/* El motivo puede ser una frase entera (viene del
                    backend con la salida concreta), así que se le da
                    ancho y se deja envolver en vez de estirar la fila. */}
                {deleteQError && (
                  <span className="text-xs text-red-600 max-w-xs text-right leading-snug">
                    {deleteQError}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmDeleteQ(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-lg"
                  title="Eliminar esta cotización (solo administradores)"
                >
                  <Trash2 size={15} />
                  Eliminar
                </button>
              </span>
            ))}
          <div className="relative dropdown-container">
            <button
              type="button"
              onClick={() =>
                setOpenDropdown(
                  openDropdown === "service-group-collections"
                    ? null
                    : "service-group-collections",
                )
              }
              disabled={
                isRestrictedEditing ||
                (serviceGroupCollections.length === 0 &&
                  serviceGroups.length === 0)
              }
              className="px-3 py-2 text-sm font-semibold border border-gray-300 rounded-lg flex items-center space-x-2 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
              title="Usar o crear un paquete (evento completo guardado)"
            >
              <Package size={16} />
              <span>Partir de un paquete</span>
            </button>

            {openDropdown === "service-group-collections" && (
              <div className="absolute right-0 z-10 w-72 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {serviceGroupCollections.map((collection) =>
                  confirmPkg?.id === collection.id ? (
                    <div key={collection.id} className="px-3 py-2">
                      <ConfirmInline
                        question={
                          confirmPkg.action === "replace"
                            ? "¿Reemplazar los servicios actuales?"
                            : `¿Eliminar "${collection.name}"?`
                        }
                        yesLabel={
                          confirmPkg.action === "replace"
                            ? "Sí, reemplazar"
                            : "Sí, eliminar"
                        }
                        onYes={async () => {
                          if (confirmPkg.action === "replace") {
                            loadCollectionAsBoxes(collection);
                            setConfirmPkg(null);
                            setOpenDropdown(null);
                          } else {
                            await removeServiceGroupCollection(collection.id);
                            if (selectedCollection?.id === collection.id) {
                              setSelectedCollection(null);
                            }
                            setConfirmPkg(null);
                          }
                        }}
                        onNo={() => setConfirmPkg(null)}
                      />
                    </div>
                  ) : (
                    <div
                      key={collection.id}
                      className="flex items-center justify-between px-3 py-2 hover:bg-gray-100"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const hasExistingServices = serviceBoxes.some(
                            (box) => box.services.length > 0,
                          );
                          if (hasExistingServices) {
                            setConfirmPkg({
                              id: collection.id,
                              action: "replace",
                            });
                          } else {
                            loadCollectionAsBoxes(collection);
                            setOpenDropdown(null);
                          }
                        }}
                        className="flex-1 text-left text-sm"
                      >
                        <span className="text-gray-900">{collection.name}</span>{" "}
                        <span className="text-gray-500">
                          ({collection.groups?.length || 0} grupos)
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmPkg({
                            id: collection.id,
                            action: "delete",
                          });
                        }}
                        className="ml-2 text-red-600 hover:text-red-800"
                        title="Eliminar paquete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ),
                )}
                {serviceGroupCollections.length === 0 && (
                  <p className="px-3 py-2 text-sm text-gray-400">
                    Aún no hay paquetes guardados.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setOpenDropdown(null);
                    openCollectionModal();
                  }}
                  disabled={serviceGroups.length === 0}
                  className="w-full border-t border-gray-200 px-3 py-2 text-left text-sm font-semibold text-blue-600 hover:bg-blue-50 disabled:text-gray-300 disabled:cursor-not-allowed"
                  title="Crear un paquete agrupando menús guardados"
                >
                  + Crear paquete nuevo…
                </button>
              </div>
            )}
          </div>
          <button
            onClick={handleSubmit}
            disabled={loading || !isQuotationFormValid()}
            className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
              loading || !isQuotationFormValid()
                ? "bg-gray-400 text-gray-600 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            <Save size={16} />
            <span>{loading ? "Guardando..." : "Guardar Cotización"}</span>
          </button>
          {!loading && missingRequiredFields().length > 0 && (
            <span className="text-xs text-amber-700 font-medium">
              Falta: {missingRequiredFields().join(" · ")}
            </span>
          )}
        </div>
      </div>

      {/* Número y autoría como información, no como cajas del formulario */}
      <p className="text-xs text-gray-400 px-2">
        {quotation?.quotation_number
          ? `Cotización #${quotation.quotation_number}`
          : "Cotización nueva — el número se asigna al guardar"}
        {" · creada por "}
        {creatorUser?.full_name ||
          creatorUser?.email ||
          user?.email ||
          "usuario actual"}
      </p>

      {isRestrictedEditing && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">
                <strong>Acceso Denegado:</strong> No tienes permisos para editar
                cotizaciones aceptadas. Solo usuarios con rol "Administrador" o
                "Operaciones" pueden editar cotizaciones aceptadas.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal - Formulario */}
        <div className="lg:col-span-2 space-y-6">
          {/* Información del cliente */}
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Información del evento
            </h3>

            {/* Cliente (número y autoría viven arriba, como información) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Cliente *
                </label>
                <SelectWithSearch
                  options={clients.map((client) => ({
                    value: client.id,
                    label: client.name,
                  }))}
                  value={formData.client_id || ""}
                  onChange={(value) => handleClientSelect(value)}
                />
                <button
                  type="button"
                  onClick={() => setShowClientModal(true)}
                  className="mt-1 text-xs font-semibold text-blue-600 hover:underline"
                >
                  + Nuevo cliente
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Persona de contacto
                </label>
                <SelectWithSearch
                  options={(() => {
                    // Contactos de la tabla + el contact_person historico
                    // del cliente (clientes creados despues del backfill),
                    // sin duplicar.
                    const names = clientContacts.map((c) => c.name);
                    const legacy = (
                      clients.find((c) => c.id === formData.client_id) as
                        | { contact_person?: string | null }
                        | undefined
                    )?.contact_person?.trim();
                    if (
                      legacy &&
                      !names.some(
                        (n) => n.toLowerCase() === legacy.toLowerCase(),
                      )
                    ) {
                      names.push(legacy);
                    }
                    return names
                      .sort((a, b) => a.localeCompare(b))
                      .map((n) => ({ value: n, label: n }));
                  })()}
                  value={formData.contact_name || ""}
                  onChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      contact_name: value || null,
                    }))
                  }
                  placeholder={
                    formData.client_id
                      ? "Sin contacto"
                      : "Elige un cliente primero"
                  }
                  searchPlaceholder="Buscar persona…"
                  noResultsText="Sin contactos para este cliente"
                  disabled={isRestrictedEditing || !formData.client_id}
                />
                <button
                  type="button"
                  onClick={() => setNewContactOpen(true)}
                  disabled={isRestrictedEditing || !formData.client_id}
                  className="mt-1 text-xs font-semibold text-blue-600 hover:underline disabled:text-gray-300"
                >
                  + Nueva persona
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Tipo de Evento *
                </label>
                <SelectWithSearch
                  options={Object.values(EventType).map((type) => ({
                    value: type,
                    label: type,
                  }))}
                  value={formData.event_type}
                  onChange={(v) =>
                    setFormData((prev) => ({
                      ...prev,
                      event_type: v as EventType,
                    }))
                  }
                  disabled={isRestrictedEditing}
                  placeholder="Seleccionar tipo"
                  searchPlaceholder="Buscar tipo…"
                  noResultsText="Sin resultados"
                />
              </div>
            </div>

            {/* Fila 2: fechas lado a lado; los avisos van DEBAJO a lo ancho
                para no desalinear las columnas */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-1">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Fecha del Evento *
                </label>
                <input
                  type="date"
                  value={formData.event_date}
                  onChange={(e) => {
                    setFormData((prev) => {
                      const clears = Boolean(
                        prev.event_end_date &&
                          String(prev.event_end_date) < e.target.value,
                      );
                      // si el "hasta" queda antes del nuevo inicio se limpia,
                      // pero AVISANDO (nada de borrados silenciosos)
                      setEndDateCleared(clears);
                      return {
                        ...prev,
                        event_date: e.target.value,
                        event_end_date: clears
                          ? undefined
                          : prev.event_end_date,
                      };
                    });
                  }}
                  disabled={isRestrictedEditing}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Último día (opcional)
                </label>
                <input
                  type="date"
                  value={formData.event_end_date || ""}
                  min={String(formData.event_date || "")}
                  onChange={(e) => {
                    setEndDateCleared(false);
                    setFormData((prev) => ({
                      ...prev,
                      event_end_date: e.target.value || undefined,
                    }));
                  }}
                  disabled={isRestrictedEditing || !formData.event_date}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
            </div>
            <div className="mb-4">
              {endDateCleared && (
                <p className="mt-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  El último día se quitó porque quedaba antes de la nueva fecha
                  de inicio. Si el evento sigue siendo de varios días, vuelve a
                  elegirlo.
                </p>
              )}
              {checkingConflicts && (
                <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                    <p className="text-xs text-blue-800">
                      Verificando disponibilidad...
                    </p>
                  </div>
                </div>
              )}
              {!checkingConflicts &&
                hasDateConflicts &&
                formData.event_date && (
                  <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-start space-x-2">
                      <span className="text-yellow-600 font-semibold text-xs">
                        ⚠️
                      </span>
                      <div className="flex-1">
                        <p className="text-xs text-yellow-800">
                          Hay más eventos programados en estas fechas.{" "}
                          <a
                            href={`/calendar?date=${formData.event_date}&filter=all`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold underline hover:text-yellow-900"
                          >
                            Ver en calendario
                          </a>
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              {!checkingConflicts &&
                !hasDateConflicts &&
                formData.event_date && (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-3 w-3 text-green-600" />
                      <p className="text-xs text-green-800">
                        Fecha disponible - No hay otros eventos programados
                      </p>
                    </div>
                  </div>
                )}
            </div>

            {/* Fila 3: contadores de asistentes, misma grilla que arriba */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="grid grid-cols-2 gap-4 md:col-span-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Adultos *
                  </label>
                  <NumberInput
                    value={adultsCount || undefined}
                    onChange={(value) => {
                      const adults = value ? Number(value) : 0;
                      // @ts-ignore -- people_count vacio mientras se edita
                      setFormData((prev) => ({
                        ...prev,
                        people_count: adults + childrenCount || undefined,
                      }));
                    }}
                    min={0}
                    disabled={isRestrictedEditing}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Niños
                  </label>
                  <NumberInput
                    value={childrenCount || undefined}
                    onChange={(value) => {
                      const kids = value ? Number(value) : 0;
                      // @ts-ignore -- people_count vacio mientras se edita
                      setFormData((prev) => ({
                        ...prev,
                        people_count: adultsCount + kids || undefined,
                        children_count: kids,
                      }));
                    }}
                    min={0}
                    disabled={isRestrictedEditing}
                    placeholder="0"
                  />
                </div>
              </div>
              <p className="pb-2 text-sm text-gray-400">
                = {adultsCount + childrenCount} asistente
                {adultsCount + childrenCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          {/* Servicios Variables */}
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-semibold text-gray-900">
                  Servicios
                </h3>
                {selectedCollection && (
                  <span className="flex items-center space-x-1 bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full text-sm font-medium">
                    <Package size={14} />
                    <span>{selectedCollection.name}</span>
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {serviceBoxes.map((box, index) => {
                const collapsed = collapsedBoxes.has(box.id);
                const boxItemCount = box.services.filter(
                  (sv) => sv.quantity > 0,
                ).length;
                const boxTotal =
                  box.services.reduce(
                    (sum, it) => sum + it.precio * it.quantity,
                    0,
                  ) * boxPeople(box);
                // "La esquina limpia" (04-08, opción A de Felipe): el
                // grip de 6 puntitos se jubiló con su drag; número y
                // plieguecito son UN botoncito compacto "N ⌄", y el
                // reorden vive en flechitas ▲▼ junto al basurero
                // (patrón del catálogo).
                const plieguecito = (
                  <button
                    type="button"
                    onClick={() => toggleBoxCollapsed(box.id)}
                    className="flex items-center gap-0.5 px-1 py-0.5 rounded text-xs font-bold text-gray-400 hover:bg-gray-100 hover:text-gray-600 shrink-0"
                    title={collapsed ? "Desplegar" : "Plegar"}
                  >
                    {index + 1}
                    {collapsed ? (
                      <ChevronRight size={13} />
                    ) : (
                      <ChevronDown size={13} />
                    )}
                  </button>
                );
                const flechas = (
                  <>
                    <button
                      type="button"
                      title="Subir servicio"
                      onClick={() => moveBox(index, -1)}
                      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"
                    >
                      <ChevronUp size={15} />
                    </button>
                    <button
                      type="button"
                      title="Bajar servicio"
                      onClick={() => moveBox(index, 1)}
                      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"
                    >
                      <ChevronDown size={15} />
                    </button>
                  </>
                );
                return (
                  <div
                    key={box.id}
                    className={`border rounded-lg ${collapsed ? "p-3" : "p-4"} ${
                      (box.audience || "adultos") === "ninos"
                        ? "border-amber-300 bg-amber-50/50"
                        : "border-gray-200"
                    }`}
                  >
                    {collapsed ? (
                      /* Plegada: resumen en una línea (nombre, personas,
                     ítems y subtotal siempre a la vista) */
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {plieguecito}
                        <span className="text-sm font-semibold text-gray-900">
                          {box.selectedCategory || "Sin categoría"}
                        </span>
                        {(box.audience || "adultos") === "ninos" && (
                          <span className="text-[10px] font-bold uppercase text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
                            Niños
                          </span>
                        )}
                        {eventDaysCount > 1 && (
                          <span className="text-xs font-semibold text-blue-900">
                            {dayLabel(Math.min(box.day || 1, eventDaysCount))}
                          </span>
                        )}
                        <span className="text-xs text-gray-500">
                          {boxItemCount} ítem{boxItemCount === 1 ? "" : "s"} ·{" "}
                          {boxPeople(box).toLocaleString("es-CL")} personas
                        </span>
                        <span className="ml-auto flex items-center gap-1">
                          <span className="text-sm font-bold text-gray-900">
                            ${boxTotal.toLocaleString("es-CL")}
                          </span>
                          {/* Reordenar también plegada: antes lo daba el
                          grip; ahora las mismas flechitas. */}
                          {!isRestrictedEditing && flechas}
                        </span>
                      </div>
                    ) : (
                      <>
                        {/* Cabecera de la caja (mockup): numero + Categoria +
                      Audiencia + Personas + Dia, todo etiquetado en una fila */}
                        <div className="flex items-end gap-3 flex-wrap mb-3">
                          <div className="flex-1 min-w-[200px]">
                            {/* El "N ⌄" vive en la fila del rótulo: así el
                          desplegable de Categoría parte pegado a la
                          izquierda, en la MISMA columna que el área de
                          ítems de abajo. */}
                            <div className="flex items-center gap-1.5 mb-1">
                              {plieguecito}
                              <label className="text-xs font-medium text-gray-600">
                                Categoría
                              </label>
                            </div>
                            {/* 28-07 (pedido de Felipe): antes era un <select>
                          nativo del navegador y desentonaba con los demás
                          desplegables. Mismo patrón custom de la casa. */}
                            <div className="relative dropdown-container">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenDropdown(
                                    openDropdown === `cat-${box.id}`
                                      ? null
                                      : `cat-${box.id}`,
                                  );
                                  setCatSearch("");
                                }}
                                disabled={
                                  box.selectedCategory !== "" ||
                                  isRestrictedEditing
                                }
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed text-left flex justify-between items-center bg-white"
                              >
                                <span
                                  className={
                                    box.selectedCategory
                                      ? "text-gray-900"
                                      : "text-gray-500"
                                  }
                                >
                                  {box.selectedCategory ||
                                    "Seleccionar categoría"}
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
                              {openDropdown === `cat-${box.id}` && (
                                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                                  {/* Buscador pegajoso (04-08): mismo patrón
                                del buscador de ítems. */}
                                  <div className="sticky top-0 bg-white p-2 border-b border-gray-200">
                                    <input
                                      type="text"
                                      autoFocus
                                      value={catSearch}
                                      onChange={(e) =>
                                        setCatSearch(e.target.value)
                                      }
                                      placeholder="Buscar categoría..."
                                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                  </div>
                                  {(() => {
                                    const cats = serviceCategories
                                      .filter(
                                        (category) =>
                                          !inactiveCategorySet.has(category) ||
                                          category === box.selectedCategory,
                                      )
                                      .filter((category) =>
                                        matchesSearch(catSearch, category),
                                      );
                                    if (cats.length === 0)
                                      return (
                                        <div className="px-3 py-2 text-sm text-gray-500">
                                          No se encontraron categorías
                                        </div>
                                      );
                                    return cats.map((category) => (
                                      <button
                                        key={category}
                                        type="button"
                                        onClick={() => {
                                          updateServiceBox(
                                            box.id,
                                            "selectedCategory",
                                            category,
                                          );
                                          // Lo escrito se borra solo al pinchar.
                                          setCatSearch("");
                                          setOpenDropdown(null);
                                        }}
                                        className="w-full px-3 py-2 text-sm text-left hover:bg-blue-50"
                                      >
                                        {category}
                                      </button>
                                    ));
                                  })()}
                                </div>
                              )}
                            </div>
                          </div>
                          {/* Nacimiento progresivo (04-08, Felipe: "no traer
                        los cubiertos antes de saber qué vas a comer"):
                        sin categoría, la caja muestra SOLO el selector
                        de Categoría y el basurero. */}
                          {box.selectedCategory !== "" && childrenCount > 0 && (
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Audiencia
                              </label>
                              <div
                                className="flex rounded-lg border border-gray-300 overflow-hidden"
                                title="Audiencia de este servicio"
                              >
                                {(["adultos", "ninos"] as const).map((aud) => {
                                  const on =
                                    (box.audience || "adultos") === aud;
                                  return (
                                    <button
                                      key={aud}
                                      type="button"
                                      disabled={isRestrictedEditing}
                                      onClick={() =>
                                        setServiceBoxes((prev) =>
                                          prev.map((b) =>
                                            b.id === box.id
                                              ? {
                                                  ...b,
                                                  audience: aud,
                                                  people: undefined,
                                                }
                                              : b,
                                          ),
                                        )
                                      }
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
                          {box.selectedCategory !== "" && (
                            <div className="relative">
                              <label
                                className="block text-xs font-medium text-gray-600 mb-1"
                                title="Personas de este servicio (por defecto, toda su audiencia)"
                              >
                                Personas
                              </label>
                              {/* NumberInput (Regla Única, migrado 23-07):
                          vacío o igual a la audiencia = automático */}
                              <NumberInput
                                value={boxPeople(box) || undefined}
                                onChange={(v) =>
                                  setServiceBoxes((prev) =>
                                    prev.map((b) =>
                                      b.id === box.id
                                        ? {
                                            ...b,
                                            people:
                                              v === undefined ||
                                              v === audienceCount(b)
                                                ? undefined
                                                : v,
                                          }
                                        : b,
                                    ),
                                  )
                                }
                                min={1}
                                disabled={isRestrictedEditing}
                                className={`w-12 text-sm text-right font-semibold ${
                                  box.people !== undefined
                                    ? "border-amber-400 bg-amber-50 text-amber-900"
                                    : ""
                                }`}
                              />
                              {/* COMPORTAMIENTO ACORDADO CON FELIPE — NO TOCAR EN
                          REDISEÑOS: el "de N" va ANCLADO bajo el campo SIN
                          ocupar espacio en la fila (absoluto). La casilla no
                          debe moverse ni un pixel al aparecer/desaparecer.
                          (Se regresionó el 20-07 al reconstruir el mockup;
                          restaurado el 22-07.) */}
                              {box.people !== undefined && (
                                <p className="absolute right-0 top-full mt-0.5 text-[10px] text-amber-700 whitespace-nowrap">
                                  de {audienceCount(box)}
                                </p>
                              )}
                            </div>
                          )}
                          {box.selectedCategory !== "" &&
                            eventDaysCount > 1 && (
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Día
                                </label>
                                <SectionChipSelect
                                  value={Math.min(box.day || 1, eventDaysCount)}
                                  options={Array.from(
                                    { length: eventDaysCount },
                                    (_, i) => ({
                                      id: i + 1,
                                      name: dayLabel(i + 1),
                                    }),
                                  )}
                                  onChange={(dia) =>
                                    setServiceBoxes((prev) =>
                                      prev.map((b) =>
                                        b.id === box.id
                                          ? { ...b, day: dia }
                                          : b,
                                      ),
                                    )
                                  }
                                  zeroLabel={null}
                                  size="md"
                                  disabled={isRestrictedEditing}
                                  title="Día del evento en que va este servicio"
                                />
                              </div>
                            )}
                          <div className="ml-auto pb-2 flex items-center gap-2">
                            {!isRestrictedEditing && flechas}
                            {serviceBoxes.length > 1 &&
                              !isRestrictedEditing && (
                                <button
                                  onClick={() => removeServiceBox(box.id)}
                                  className="text-red-500 hover:text-red-700"
                                  title="Quitar este servicio"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                          </div>
                        </div>

                        {box.selectedCategory && (
                          <div className="mt-4">
                            {/* Items agrupados por seccion, como la carta (mockup):
                          subtitulo azul marino, nombre, precio, cantidad por
                          persona y el total de porciones a la derecha. */}
                            {(() => {
                              const cat = orderedCategories.find(
                                (c) => c.name === nomCat(box),
                              );
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
                                        l.variable_service_id.toString() ===
                                          codigo,
                                    )?.section_id || 0
                                  : 0;
                              const items = getSelectedItemsForBox(box.id);
                              const groups = [
                                ...secs.map((s) => ({
                                  key: `s-${s.id}`,
                                  name: s.name,
                                  items: items.filter(
                                    (it) => sectionOf(it.codigo) === s.id,
                                  ),
                                })),
                                {
                                  key: "s-0",
                                  name: secs.length ? "Otros" : "",
                                  items: items.filter(
                                    (it) => sectionOf(it.codigo) === 0,
                                  ),
                                },
                              ].filter((g) => g.items.length > 0);
                              return groups.map((g) => (
                                <div key={g.key}>
                                  {g.name && (
                                    <div className="pt-2 pb-0.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-900 border-b border-blue-900/20">
                                      {g.name}
                                    </div>
                                  )}
                                  {g.items.map((service) => {
                                    const locked = isLockedService(
                                      nomCat(box),
                                      service.codigo,
                                    );
                                    return (
                                      <div
                                        key={service.codigo}
                                        className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-100 text-sm"
                                      >
                                        <span className="text-gray-800 flex items-center gap-2 min-w-0">
                                          <span className="truncate">
                                            {service.nombre}
                                          </span>
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
                                          <span className="text-gray-500">
                                            $
                                            {service.precio.toLocaleString(
                                              "es-CL",
                                            )}
                                          </span>
                                          <QuantitySelector
                                            value={service.quantity}
                                            onChange={(newQuantity) =>
                                              updateServiceQuantity(
                                                service.codigo,
                                                newQuantity,
                                                box.id,
                                              )
                                            }
                                            min={locked ? 1 : 0}
                                            disabled={isRestrictedEditing}
                                          />
                                          <span className="font-bold text-gray-900 w-14 text-right">
                                            ×
                                            {(
                                              service.quantity * boxPeople(box)
                                            ).toLocaleString("es-CL")}
                                          </span>
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              ));
                            })()}

                            {/* Selector de Item AL PIE de la lista armada
                          (04-08, pedido de Felipe): lo agregado se lee
                          primero y el panel se despliega hacia abajo
                          sin tapar nada — igual que en Post-Venta. */}
                            <div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Item
                                </label>
                                <div className="relative dropdown-container">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenDropdown(
                                        openDropdown === box.id ? null : box.id,
                                      );
                                      // Reset the in-memory search each time the dropdown toggles
                                      setItemSearch("");
                                    }}
                                    disabled={isRestrictedEditing}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed text-left flex justify-between items-center"
                                  >
                                    <span className="text-gray-500">
                                      Seleccionar item
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

                                  {openDropdown === box.id &&
                                    box.selectedCategory && (
                                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-[28rem] overflow-y-auto">
                                        {/* In-memory search to filter items by name */}
                                        <div className="sticky top-0 bg-white p-2 border-b border-gray-200">
                                          <input
                                            type="text"
                                            autoFocus
                                            value={itemSearch}
                                            onChange={(e) =>
                                              setItemSearch(e.target.value)
                                            }
                                            placeholder="Buscar item por nombre..."
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                          />
                                        </div>
                                        {(() => {
                                          const filteredProducts =
                                            getFilteredProducts(nomCat(box))
                                              // Hide deactivated items from the picker.
                                              // Already-selected items still render via the
                                              // button label above (full product list).
                                              .filter(
                                                (product) =>
                                                  product.is_active !== false,
                                              )
                                              // La sección FIJA no se ofrece en el
                                              // buscador: sus servicios entran solos a la
                                              // cotización y no se pueden quitar.
                                              .filter(
                                                (product) =>
                                                  !isLockedService(
                                                    nomCat(box),
                                                    product.codigo,
                                                  ),
                                              )
                                              .filter((product) =>
                                                matchesSearch(
                                                  itemSearch,
                                                  product.nombre,
                                                ),
                                              );

                                          if (filteredProducts.length === 0) {
                                            return (
                                              <div className="px-3 py-2 text-sm text-gray-500">
                                                No se encontraron items
                                              </div>
                                            );
                                          }

                                          const itemButton = (product: {
                                            codigo: string;
                                            nombre: string;
                                            precio: number;
                                          }) => (
                                            <button
                                              key={product.codigo}
                                              type="button"
                                              onClick={() => {
                                                updateServiceBox(
                                                  box.id,
                                                  "selectedItem",
                                                  product.codigo,
                                                );
                                                // El panel queda abierto y lo ESCRITO
                                                // se borra solo tras pinchar (04-08).
                                                setItemSearch("");
                                              }}
                                              className="w-full px-3 py-2 text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                                            >
                                              {product.nombre} - $
                                              {product.precio.toLocaleString(
                                                "es-CL",
                                              )}
                                            </button>
                                          );

                                          // Con secciones definidas, el listado se agrupa
                                          // como la carta (Entradas, Principales...); una
                                          // categoría sin secciones se ve igual que hoy.
                                          const cat = orderedCategories.find(
                                            (c) =>
                                              c.name === nomCat(box),
                                          );
                                          const secs = cat
                                            ? categorySections
                                                .filter(
                                                  (s) =>
                                                    s.category_id === cat.id,
                                                )
                                                .sort(
                                                  (a, b) =>
                                                    a.sort_order - b.sort_order,
                                                )
                                            : [];
                                          if (secs.length === 0) {
                                            return filteredProducts.map(
                                              itemButton,
                                            );
                                          }

                                          const sectionOf = (codigo: string) =>
                                            categoryLinks.find(
                                              (l) =>
                                                l.category_id === cat!.id &&
                                                l.variable_service_id.toString() ===
                                                  codigo,
                                            )?.section_id || 0;

                                          return [
                                            ...secs.map((s) => ({
                                              key: `s-${s.id}`,
                                              name: s.name,
                                              items: filteredProducts.filter(
                                                (p) =>
                                                  sectionOf(p.codigo) === s.id,
                                              ),
                                            })),
                                            {
                                              key: "s-0",
                                              name: "Sin sección",
                                              items: filteredProducts.filter(
                                                (p) =>
                                                  sectionOf(p.codigo) === 0,
                                              ),
                                            },
                                          ]
                                            .filter((g) => g.items.length > 0)
                                            .map((g) => (
                                              <div key={g.key}>
                                                <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400 bg-gray-50">
                                                  {g.name}
                                                </div>
                                                {g.items.map(itemButton)}
                                              </div>
                                            ));
                                        })()}
                                      </div>
                                    )}
                                </div>
                                {box.groupName && (
                                  <p className="mt-1 text-xs font-medium text-blue-600">
                                    Menú: {box.groupName}
                                  </p>
                                )}
                              </div>
                            </div>
                            {/* Menus guardados de esta categoria + guardar el actual */}
                            <div className="mt-2 flex items-center justify-between">
                              <div className="relative dropdown-container">
                                {(() => {
                                  const boxGroups = serviceGroups.filter(
                                    (g) =>
                                      !box.selectedCategory ||
                                      g.category === nomCat(box),
                                  );
                                  return (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setOpenDropdown(
                                            openDropdown === `groups-${box.id}`
                                              ? null
                                              : `groups-${box.id}`,
                                          )
                                        }
                                        disabled={
                                          isRestrictedEditing ||
                                          boxGroups.length === 0
                                        }
                                        className="text-xs font-semibold text-blue-600 hover:underline disabled:text-gray-300 disabled:no-underline"
                                      >
                                        Usar un menú guardado de esta categoría…
                                      </button>
                                      {openDropdown === `groups-${box.id}` &&
                                        boxGroups.length > 0 && (
                                          <div className="absolute left-0 z-10 w-64 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                            {boxGroups.map((group) =>
                                              confirmGroupDel === group.id ? (
                                                <div
                                                  key={group.id}
                                                  className="px-3 py-2"
                                                >
                                                  <ConfirmInline
                                                    question={`¿Eliminar "${group.name}"?`}
                                                    onYes={async () => {
                                                      await removeServiceGroup(
                                                        group.id,
                                                      );
                                                      setConfirmGroupDel(null);
                                                    }}
                                                    onNo={() =>
                                                      setConfirmGroupDel(null)
                                                    }
                                                  />
                                                </div>
                                              ) : (
                                                <div
                                                  key={group.id}
                                                  className="flex items-center justify-between px-3 py-2 hover:bg-gray-100"
                                                >
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      loadGroupIntoBox(
                                                        box.id,
                                                        group,
                                                      );
                                                      setOpenDropdown(null);
                                                    }}
                                                    className="flex-1 text-left text-sm"
                                                  >
                                                    <span className="text-gray-900">
                                                      {group.name}
                                                    </span>{" "}
                                                    <span className="text-gray-500">
                                                      ({group.category})
                                                    </span>
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setConfirmGroupDel(
                                                        group.id,
                                                      );
                                                    }}
                                                    className="ml-2 text-red-600 hover:text-red-800"
                                                    title="Eliminar menú guardado"
                                                  >
                                                    <Trash2 size={14} />
                                                  </button>
                                                </div>
                                              ),
                                            )}
                                          </div>
                                        )}
                                    </>
                                  );
                                })()}
                              </div>
                              {!box.groupName &&
                                box.services.length > 0 &&
                                !isRestrictedEditing && (
                                  <button
                                    type="button"
                                    onClick={() => openSaveGroupModal(box.id)}
                                    className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
                                    title="Guardar esta categoría y sus items como menú"
                                  >
                                    <Layers size={13} />
                                    Guardar como menú
                                  </button>
                                )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}

              <button
                onClick={addServiceBox}
                disabled={isRestrictedEditing}
                className="mt-2 text-sm font-semibold text-blue-600 hover:underline disabled:text-gray-300 disabled:no-underline"
              >
                + Agregar servicio
              </button>
            </div>
          </div>

          {/* Servicios fijos del evento (editable; el resumen los lista) */}
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Servicios fijos del evento
            </h3>
            <div>
              {(() => {
                const conCodigo = selectedFixedServices
                  .map((sv, i) => ({ sv, i }))
                  .filter((x) => x.sv?.codigo)
                  .sort(
                    (a, b) =>
                      fixedOrderOf(a.sv.codigo) - fixedOrderOf(b.sv.codigo),
                  );
                const vacias = selectedFixedServices
                  .map((sv, i) => ({ sv, i }))
                  .filter((x) => !x.sv?.codigo);
                let rotuloPrev = "";
                return [...conCodigo, ...vacias].map(
                  ({ sv: service, i: index }) => {
                    const rotulo =
                      service?.codigo && fixedSections.length > 0
                        ? fixedSectionNameOf(service.codigo)
                        : null;
                    const muestraRotulo = !!rotulo && rotulo !== rotuloPrev;
                    if (rotulo) rotuloPrev = rotulo;
                    return (
                      <div key={index}>
                        {muestraRotulo && (
                          <div className="pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-blue-900">
                            {rotulo}
                          </div>
                        )}
                        {service?.codigo ? (
                          /* Servicio elegido: fila limpia estilo mockup */
                          <div
                            key={index}
                            className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 text-sm"
                          >
                            <span className="text-gray-800 truncate">
                              {service.nombre}
                            </span>
                            <span className="flex items-center gap-2 shrink-0 text-gray-500">
                              <span className="font-medium text-gray-900">
                                $
                                {(
                                  service.precio_calculado * service.quantity
                                ).toLocaleString("es-CL")}
                              </span>
                              <span>×{service.quantity}</span>
                              {eventDaysCount > 1 && (
                                <SectionChipSelect
                                  value={Math.min(
                                    service.day || 0,
                                    eventDaysCount,
                                  )}
                                  options={Array.from(
                                    { length: eventDaysCount },
                                    (_, i) => ({
                                      id: i + 1,
                                      name: dayLabel(i + 1),
                                    }),
                                  )}
                                  onChange={(dia) =>
                                    setSelectedFixedServices((prev) =>
                                      prev.map((f, i) =>
                                        i === index ? { ...f, day: dia } : f,
                                      ),
                                    )
                                  }
                                  zeroLabel="todo el evento"
                                  size="md"
                                  disabled={isRestrictedEditing}
                                  title="Día del evento (o todo el evento)"
                                />
                              )}
                              {!isRestrictedEditing && (
                                <button
                                  onClick={() => removeFixedService(index)}
                                  className="text-gray-300 hover:text-red-600"
                                  title="Quitar"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </span>
                          </div>
                        ) : (
                          /* Fila en seleccion: solo el selector, sin ruido */
                          <div
                            key={index}
                            className="flex items-center gap-2 py-2 border-b border-gray-100"
                          >
                            <div className="relative dropdown-container flex-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenFixedPicker(
                                    openFixedPicker === index ? null : index,
                                  );
                                  setFixedSearch("");
                                }}
                                disabled={isRestrictedEditing}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed text-left flex justify-between items-center"
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
                              {openFixedPicker === index && (
                                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-[28rem] overflow-y-auto">
                                  <div className="sticky top-0 bg-white p-2 border-b border-gray-200">
                                    <input
                                      type="text"
                                      autoFocus
                                      value={fixedSearch}
                                      onChange={(e) =>
                                        setFixedSearch(e.target.value)
                                      }
                                      placeholder="Buscar servicio por nombre..."
                                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                  </div>
                                  {(() => {
                                    const disponibles = fixedServices
                                      .filter((f) => f.is_active !== false)
                                      .filter((f) =>
                                        matchesSearch(fixedSearch, f.nombre),
                                      )
                                      .sort(
                                        (a, b) =>
                                          fixedOrderOf(a.codigo) -
                                          fixedOrderOf(b.codigo),
                                      );
                                    if (disponibles.length === 0) {
                                      return (
                                        <div className="px-3 py-2 text-sm text-gray-500">
                                          No se encontraron servicios
                                        </div>
                                      );
                                    }
                                    const botonDe = (
                                      f: (typeof disponibles)[number],
                                    ) => (
                                      <button
                                        key={f.codigo}
                                        type="button"
                                        onClick={() => {
                                          // Agrega y deja la ventanita abierta,
                                          // como variables.
                                          handleFixedServiceSelect(f.codigo);
                                        }}
                                        className="w-full px-3 py-2 text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                                      >
                                        {f.nombre} - $
                                        {(f.precio || 0).toLocaleString(
                                          "es-CL",
                                        )}
                                      </button>
                                    );
                                    if (fixedSections.length === 0) {
                                      return disponibles.map(botonDe);
                                    }
                                    let prev = "";
                                    return disponibles.map((f) => {
                                      const nombre = fixedSectionNameOf(
                                        f.codigo,
                                      );
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
                        )}
                      </div>
                    );
                  },
                );
              })()}
            </div>
          </div>
        </div>

        {/* Columna lateral - Resúmenes */}
        <div className="space-y-6">
          {/* Resumen de la cotización: panel único, estilo mockup v1 */}
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="bg-blue-900 px-4 py-2.5">
              <span className="text-xs font-extrabold uppercase tracking-wider text-white">
                Resumen de la cotización
              </span>
            </div>
            <div className="divide-y divide-gray-200">
              {/* Una línea POR SERVICIO (nunca fusionadas): audiencia, día
                  si es multi-día, y personas. La hora se define en Cocina. */}
              {serviceBoxes.filter(
                (b) => b.selectedCategory && b.services.length > 0,
              ).length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-400">
                  Aún no hay servicios.
                </p>
              ) : (
                serviceBoxes
                  .filter((b) => b.selectedCategory && b.services.length > 0)
                  .map((box) => {
                    const perPerson = box.services.reduce(
                      (s, it) => s + it.precio * it.quantity,
                      0,
                    );
                    const people = boxPeople(box);
                    const aud = box.audience || "adultos";
                    const parts: string[] = [];
                    if (eventDaysCount > 1)
                      parts.push(
                        `Día ${Math.min(box.day || 1, eventDaysCount)}`,
                      );
                    parts.push(
                      box.people !== undefined
                        ? `${people} de ${audienceCount(box)} personas`
                        : `${people} personas`,
                    );
                    return (
                      <div key={box.id} className="px-4 py-2 text-sm">
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
                            {box.selectedCategory}
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
                  interrumpían la lectura; el desglose vive ahora dentro
                  del recuadro ámbar del Total con IVA. */}
            </div>

            {/* Fijos: solo lectura aquí (se editan en su tarjeta) */}
            {selectedFixedServices.filter((s) => s.codigo).length > 0 && (
              <div className="border-t border-gray-200">
                {selectedFixedServices
                  .filter((s) => s.codigo)
                  .map((service, i) => (
                    <div
                      key={`fs-${i}`}
                      className="flex justify-between px-4 py-2 text-sm bg-gray-50"
                    >
                      <span className="text-gray-700">{service.nombre}</span>
                      <span className="font-medium text-gray-900">
                        $
                        {(
                          service.precio_calculado * service.quantity
                        ).toLocaleString("es-CL")}
                      </span>
                    </div>
                  ))}
              </div>
            )}

            {hasDiscount && (
              <div className="bg-gray-100 px-4 py-2 border-b">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    Subtotal antes descuento
                  </span>
                  <span className="text-gray-600">
                    ${formData.subtotal_amount.toLocaleString("es-CL")}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-red-600">
                    Descuento{" "}
                    {discType === "%"
                      ? `(${formData.discount_percentage || 0}%)`
                      : "(monto cerrado)"}
                  </span>
                  <span className="text-red-600">
                    -${discountAmountUI.toLocaleString("es-CL")}
                  </span>
                </div>
              </div>
            )}

            {/* La propina NO lleva IVA: Neto e IVA se calculan sobre el
                total SIN propina, y la propina se suma al final. */}
            {(() => {
              const totalConIva = formData.total_amount - tipAmountUI;
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
                      <span>${totalConIva.toLocaleString("es-CL")}</span>
                    </div>
                    {/* Desglose (04-08, Felipe): SUMA EXACTO al total
                        ámbar porque sale de los MISMOS números de la
                        cuenta: variables = ámbar + descuento − fijos
                        (por construcción), adultos con la misma fórmula
                        de computeMoney y niños POR DIFERENCIA —
                        cualquier resto cae ahí y la suma nunca
                        descuadra. La apostilla "×N" solo cuando toda la
                        audiencia adulta/niña está completa. */}
                    {(() => {
                      const variablesTot =
                        totalConIva + discountAmountUI - formData.fixed_value;
                      const activos = serviceBoxes.filter(
                        (b) => b.selectedCategory && b.services.length > 0,
                      );
                      const deAdultos = activos.filter(
                        (b) => (b.audience || "adultos") !== "ninos",
                      );
                      const deNinos = activos.filter(
                        (b) => (b.audience || "adultos") === "ninos",
                      );
                      const perPersonOf = (b: (typeof activos)[number]) =>
                        b.services.reduce(
                          (s, it) => s + it.precio * it.quantity,
                          0,
                        );
                      const adultosCalc = deAdultos.reduce(
                        (s, b) => s + perPersonOf(b) * boxPeople(b),
                        0,
                      );
                      const adultosVar =
                        childrenCount > 0 ? adultosCalc : variablesTot;
                      const ninosVar =
                        childrenCount > 0 ? variablesTot - adultosCalc : 0;
                      const adultosExacto =
                        adultsCount > 0 &&
                        deAdultos.length > 0 &&
                        deAdultos.every((b) => boxPeople(b) === adultsCount);
                      const ninosExacto =
                        childrenCount > 0 &&
                        deNinos.length > 0 &&
                        deNinos.every((b) => boxPeople(b) === childrenCount);
                      const vppNinos = ninosExacto
                        ? deNinos.reduce((s, b) => s + perPersonOf(b), 0)
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
                                  — {fmtA(formData.value_per_person)} ×{" "}
                                  {adultsCount.toLocaleString("es-CL")} adultos
                                </span>
                              )}
                            </span>
                            <span>{fmtA(adultosVar)}</span>
                          </div>
                          {childrenCount > 0 && (
                            <div className="flex justify-between gap-2">
                              <span>
                                Variables (niños)
                                {ninosExacto && (
                                  <span className="text-amber-700">
                                    {" "}
                                    — {fmtA(vppNinos)} ×{" "}
                                    {childrenCount.toLocaleString("es-CL")}{" "}
                                    niños
                                  </span>
                                )}
                              </span>
                              <span>{fmtA(ninosVar)}</span>
                            </div>
                          )}
                          <div className="flex justify-between gap-2">
                            <span>Servicios fijos</span>
                            <span>{fmtA(formData.fixed_value)}</span>
                          </div>
                          {hasDiscount && (
                            <div className="flex justify-between gap-2">
                              <span>Descuento</span>
                              <span>−{fmtA(discountAmountUI)}</span>
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
                          disabled={isRestrictedEditing}
                          onChange={(e) => setTipEnabled(e.target.checked)}
                          className="w-4 h-4 accent-blue-600"
                        />
                        <span className="text-gray-700">Propina equipo</span>
                        {tipEnabled && (
                          <span className="flex items-center gap-1">
                            {/* NumberInput (Regla Única, 23-07): el
                                clamp silencioso se fue — fuera de rango
                                vibra y avisa, no se ajusta solo */}
                            <NumberInput
                              value={tipPct || undefined}
                              disabled={isRestrictedEditing}
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
                          ${tipAmountUI.toLocaleString("es-CL")}
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
                      <span>
                        ${formData.total_amount.toLocaleString("es-CL")}
                      </span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Descuento — columna comercial (orden acordado con Felipe el
              22-07: Resumen → Descuento → Observaciones). Compacto: el
              monto descontado y el total viven en el Resumen de arriba. */}
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
                      onClick={() => setDiscType(t)}
                      disabled={isRestrictedEditing}
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
                  {discType === "%" ? (
                    <NumberInput
                      id="discount_percentage"
                      name="discount_percentage"
                      value={formData.discount_percentage}
                      onChange={(value) => {
                        // @ts-ignore
                        setFormData((prev) => ({
                          ...prev,
                          discount_percentage: value
                            ? Number(value)
                            : undefined,
                        }));
                      }}
                      min={0}
                      max={getMaxDiscountForRole()}
                      disabled={isRestrictedEditing}
                    />
                  ) : (
                    <NumberInput
                      id="discount_amount"
                      name="discount_amount"
                      value={formData.discount_amount || undefined}
                      onChange={(value) => {
                        // @ts-ignore
                        setFormData((prev) => ({
                          ...prev,
                          discount_amount: value ? Number(value) : 0,
                        }));
                      }}
                      min={0}
                      max={getMaxDiscountAmount()}
                      formatThousands
                      placeholder="0"
                      disabled={isRestrictedEditing}
                    />
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {discType === "%"
                  ? `Máximo: ${getMaxDiscountForRole()}% (${userRole})`
                  : `Máximo: $${getMaxDiscountAmount().toLocaleString("es-CL")} — equivale al ${getMaxDiscountForRole()}% (${userRole})`}
              </p>
            </div>
          )}

          {/* Margen y costos (24-07) — debajo del Descuento, para verlo
              ANTES de ofrecerlo. Solo operaciones y administrador. */}
          {puedeVerMargen && (
            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                Margen y costos
              </h3>
              {!margenCotizador ? (
                <p className="text-xs text-gray-500">Calculando…</p>
              ) : (
                (() => {
                  const venta = formData.total_amount - tipAmountUI;
                  const ventaSinDesc = venta + discountAmountUI;
                  const costo = margenCotizador.costo;
                  const margen = venta - costo;
                  const pct = venta > 0 ? (margen / venta) * 100 : 0;
                  const margenSinDesc = ventaSinDesc - costo;
                  const pctSinDesc =
                    ventaSinDesc > 0 ? (margenSinDesc / ventaSinDesc) * 100 : 0;
                  const money = (n: number) =>
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
                          <span className="text-gray-900">{money(venta)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Costo estimado</span>
                          <span className="text-gray-900">{money(costo)}</span>
                        </div>
                        <div className="flex justify-between border-t pt-1 font-semibold">
                          <span className="text-gray-700">Margen</span>
                          <span
                            className={
                              margen >= 0 ? "text-emerald-600" : "text-red-600"
                            }
                          >
                            {money(margen)} ({pct.toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                      {hasDiscount && (
                        <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs">
                          <div className="flex justify-between text-gray-600">
                            <span>Margen sin descuento</span>
                            <span>
                              {money(margenSinDesc)} ({pctSinDesc.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                      )}
                      {margenCotizador.sinReceta.length > 0 && (
                        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          ⚠ {margenCotizador.sinReceta.length} servicio
                          {margenCotizador.sinReceta.length > 1 ? "s" : ""} sin
                          receta, no suma
                          {margenCotizador.sinReceta.length > 1 ? "n" : ""} al
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

          {/* Observaciones — al pie de la columna comercial */}
          <div className="bg-white rounded-xl shadow p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              Observaciones
            </h3>
            <textarea
              value={formData.observations}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  observations: e.target.value,
                }))
              }
              rows={4}
              disabled={isRestrictedEditing}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="Detalles adicionales, requerimientos especiales, etc."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
