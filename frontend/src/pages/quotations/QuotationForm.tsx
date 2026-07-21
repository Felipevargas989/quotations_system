import { useState, useEffect } from "react";
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
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useServices } from "../../hooks/useServices";
import { useServiceGroups } from "../../hooks/useServiceGroups";
import { useServiceGroupCollections } from "../../hooks/useServiceGroupCollections";
import { ServiceGroup } from "../../types/serviceGroups.types";
import { ServiceGroupCollection } from "../../types/serviceGroupCollections.types";
import { useDateAvailability } from "../../hooks/useDateAvailability";
import { validateCompleteClientForm } from "../../utils/validation";
import { CLIENT_TYPES, DEFAULT_CLIENT_TYPE } from "../../constants/clientTypes";
import { clientTypesQueryOptions } from "../../services/clientTypes.service";
import {
  createQuotation,
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
import { matchesSearch } from "../../utils/searchMatch";
import { UserRole } from "../../constants/users";
import { humanizeApiError } from "../../utils/apiErrors";

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
  selectedItem: string;
  selectedItems: string[];
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
    quotation_status: isFromRequirement
      ? QuotationStatus.ENVIADA
      : QuotationStatus.SOLICITADA,
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
  const [serviceBoxes, setServiceBoxes] = useState<ServiceBox[]>([
    {
      id: "1",
      selectedCategory: "",
      selectedItem: "",
      selectedItems: [],
      services: [],
    },
  ]);
  const [fixedServiceSlots, setFixedServiceSlots] = useState(3);
  const [discountPercentage, setDiscountPercentage] = useState(0);
  // Descuento por porcentaje o por monto cerrado (mismo patrón que la
  // pestaña Servicios de Post Venta).
  const [discType, setDiscType] = useState<"%" | "$">("%");
  const [subtotalBeforeDiscount, setSubtotalBeforeDiscount] = useState(0);
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
  const [savingContact, setSavingContact] = useState(false);
  const [isEditingExisting, setIsEditingExisting] = useState(false);
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
            alert("Error al cargar la cotización");
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
          alert("Error al cargar la cotización");
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
      // la cotización origen cuando se está duplicando)
      const itemsSourceId = quotation.id || __items_source_id;
      if (itemsSourceId) {
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
          const boxItems: string[] = [];
          const boxServices: SelectedService[] = [];

          serviceBox.items.forEach((item: any) => {
            const service: SelectedService = {
              codigo: item.codigo,
              nombre: item.nombre,
              precio: item.precio,
              categoria: item.categoria || serviceBox.category,
              quantity: item.quantity || 1,
            };
            boxItems.push(item.codigo);
            boxServices.push(service);
          });

          serviceBoxesData.push({
            id: boxId,
            selectedCategory: serviceBox.category,
            selectedItem: "",
            selectedItems: boxItems,
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

    // Actualizar slots de servicios fijos si es necesario
    if (fixedServicesLoaded.length > fixedServiceSlots) {
      setFixedServiceSlots(fixedServicesLoaded.length + 1);
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

  const addServiceBox = () => {
    const newBox: ServiceBox = {
      id: Date.now().toString(),
      selectedCategory: "",
      selectedItem: "",
      selectedItems: [],
      services: [],
    };
    setServiceBoxes((prev) => [...prev, newBox]);
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
      selectedItems: all.map((s) => s.codigo),
      services: all,
      groupName: group.name,
    };
  };

  // Append a single group as a new box (does not affect the selected package).
  const loadGroupAsBox = (group: ServiceGroup) => {
    const newBox = buildBoxFromGroup(group);
    if (newBox) setServiceBoxes((prev) => [...prev, newBox]);
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
              selectedItems: built.selectedItems,
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
      alert("No se pudieron asociar los items con servicios válidos.");
      return;
    }

    setSavingGroup(true);
    try {
      await saveGroup({
        name: groupName.trim(),
        category: box.selectedCategory,
        items,
      });
      setGroupModalBoxId(null);
      setGroupName("");
      alert("Grupo guardado exitosamente");
    } catch (error) {
      alert("Error al guardar el grupo");
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
      alert("Paquete guardado exitosamente");
    } catch (error) {
      alert("Error al guardar el paquete");
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
              ...(field === "selectedCategory"
                ? {
                    selectedItem: "",
                    selectedItems: seeded.map((s) => s.codigo),
                    services: seeded,
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
                  selectedItems: [...box.selectedItems, value],
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

  const getSelectedItemsForCategory = (category: string) => {
    return serviceBoxes
      .flatMap((box) => box.services)
      .filter((service) => service.categoria === category);
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
      alert("Por favor corrija los errores en los campos de email y teléfono");
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
      alert("Cliente creado exitosamente");
    } catch (error) {
      console.error("Error creating client:", error);
      alert("Error al crear el cliente");
    } finally {
      setClientLoading(false);
    }
  };

  const getFilteredProducts = (categoria: string) => {
    return products.filter((p) => p.categoria === categoria);
  };

  const handleFixedServiceSelect = (serviceCodigo: string, index?: number) => {
    if (!serviceCodigo) return;

    const service = fixedServices.find((s) => s.codigo === serviceCodigo);
    if (!service) return;

    const calculatedPrice = calculatePrice(service, formData.people_count);

    if (index !== undefined) {
      // Update existing service at specific index
      setSelectedFixedServices((prev) =>
        prev.map((item, i) =>
          i === index
            ? {
                codigo: service.codigo,
                nombre: service.nombre,
                precio_calculado: calculatedPrice,
                categoria: service.categoria || "General",
                quantity: 1,
                tipo_calculo: service.tipo_calculo || "fijo",
                min_precio: service.min_precio || 0,
                max_precio: service.max_precio || 0,
                precio_por_persona: service.precio_por_persona || 0,
                // preservar el día elegido: cambiar el servicio de la fila
                // no debe resetear el selector de día
                day: item.day,
              }
            : item,
        ),
      );
    } else {
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
    }
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
            if (isLockedService(box.selectedCategory, codigo)) {
              return box;
            }
            // Remove service from this box
            return {
              ...box,
              services: box.services.filter((s) => s.codigo !== codigo),
              selectedItems: box.selectedItems.filter(
                (item) => item !== codigo,
              ),
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

  const calculateTotals = () => {
    // Cotizador 2.0: cada caja multiplica por SU audiencia (adultos o
    // niños) o por su ajuste manual de personas — ya no por el total.
    const variableGrandTotal = Math.round(
      serviceBoxes.reduce((sum, box) => {
        const perPerson = box.services.reduce(
          (boxSum, service) => boxSum + service.precio * service.quantity,
          0,
        );
        return sum + perPerson * boxPeople(box);
      }, 0),
    );

    const fixedTotal = Math.round(
      selectedFixedServices.reduce(
        (sum, service) => sum + service.precio_calculado * service.quantity,
        0,
      ),
    );

    // value_per_person (columna histórica) = valor por ADULTO de los
    // servicios que cubren a todos los adultos.
    const valuePerPerson = Math.round(
      serviceBoxes.reduce((sum, box) => {
        if ((box.audience || "adultos") !== "adultos") return sum;
        if (boxPeople(box) !== adultsCount) return sum;
        return (
          sum +
          box.services.reduce((boxSum, s) => boxSum + s.precio * s.quantity, 0)
        );
      }, 0),
    );

    const subtotalAmount = Math.round(variableGrandTotal + fixedTotal);

    // Calcular subtotal antes del descuento para UI
    setSubtotalBeforeDiscount(subtotalAmount);

    // Aplicar descuento: por % o por monto cerrado, según el toggle
    const discountAmount =
      discType === "$"
        ? Math.min(subtotalAmount, Math.round(formData.discount_amount || 0))
        : Math.round(
            subtotalAmount *
              (Math.min(formData.discount_percentage || 0, 100) / 100),
          );
    const finalTotal = Math.round(subtotalAmount - discountAmount);

    // Propina: % sobre los servicios variables, DESPUÉS del IVA (no
    // lleva IVA). Se suma al total a pagar.
    const tipAmount = tipEnabled
      ? Math.round(variableGrandTotal * (Math.min(tipPct || 0, 100) / 100))
      : 0;
    setTipAmountUI(tipAmount);

    setFormData((prev) => ({
      ...prev,
      value_per_person: valuePerPerson,
      fixed_value: fixedTotal,
      subtotal_amount: subtotalAmount,
      total_amount: finalTotal + tipAmount,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);

    try {
      // Prepare items JSON structure - each service box is saved as a separate entity
      const itemsData: QuotationFormData["items"] = {
        variable_services: serviceBoxes
          .filter((box) => box.selectedCategory && box.services.length > 0)
          .map((box) => ({
            category: box.selectedCategory,
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
        fixed_services: selectedFixedServices.map((service) => ({
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
      };

      const quotationData = {
        ...formData,
        event_type: formData.event_type,
        event_date: formData.event_date,
        event_end_date: formData.event_end_date || null,
        children_count: childrenCount,
        tip_percentage: tipEnabled ? tipPct || 0 : null,
        request_type: isFromRequirement
          ? QuotationRequestType.COTIZACION
          : formData.request_type,
        // Solo el modo activo del descuento viaja con valor; el otro va en 0
        discount_percentage:
          discType === "%" ? formData.discount_percentage || 0 : 0,
        discount_amount:
          discType === "$" ? Math.round(formData.discount_amount || 0) : 0,
        value_per_person: Math.round(formData.value_per_person),
        fixed_value: Math.round(formData.fixed_value),
        subtotal_amount: Math.round(formData.subtotal_amount),
        total_amount: Math.round(formData.total_amount),
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

      alert(
        isEditingExisting
          ? "Cotización actualizada exitosamente"
          : "Cotización guardada exitosamente",
      );
      navigate("/quotations");
    } catch (error) {
      alert(`No se pudo guardar la cotización: ${humanizeApiError(error)}`);
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
                  onBlur={() =>
                    setTouchedFields((prev) => ({ ...prev, phone: true }))
                  }
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${shouldShowError("phone") ? "border-red-500" : ""}`}
                  placeholder="+569XXXXXXXX"
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
                <select
                  value={clientFormData.client_type}
                  onChange={(e) =>
                    setClientFormData((prev) => ({
                      ...prev,
                      client_type: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {clientTypesList.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
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
            onClick={() => navigate("/quotations")}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft size={20} />
            <span>Volver a la lista</span>
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
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="+56 9 ..."
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setNewContactOpen(false);
                        setNewContactName("");
                        setNewContactEmail("");
                        setNewContactPhone("");
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
                <select
                  required
                  value={formData.event_type}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      event_type: e.target.value as EventType,
                    }))
                  }
                  disabled={isRestrictedEditing}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">Seleccionar tipo</option>
                  {Object.values(EventType).map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
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
              {serviceBoxes.map((box, index) => (
                <div
                  key={box.id}
                  className={`border rounded-lg p-4 ${
                    (box.audience || "adultos") === "ninos"
                      ? "border-amber-300 bg-amber-50/50"
                      : "border-gray-200"
                  }`}
                >
                  {/* Cabecera de la caja (mockup): numero + Categoria +
                      Audiencia + Personas + Dia, todo etiquetado en una fila */}
                  <div className="flex items-end gap-3 flex-wrap mb-3">
                    <span className="text-xs font-bold text-gray-400 pb-3">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Categoría
                      </label>
                      <select
                        value={box.selectedCategory}
                        onChange={(e) =>
                          updateServiceBox(
                            box.id,
                            "selectedCategory",
                            e.target.value,
                          )
                        }
                        disabled={
                          box.selectedCategory !== "" || isRestrictedEditing
                        }
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                      >
                        <option value="">Seleccionar categoría</option>
                        {serviceCategories
                          .filter(
                            (category) =>
                              !inactiveCategorySet.has(category) ||
                              category === box.selectedCategory,
                          )
                          .map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                      </select>
                    </div>
                    {childrenCount > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Audiencia
                        </label>
                        <div
                          className="flex rounded-lg border border-gray-300 overflow-hidden"
                          title="Audiencia de este servicio"
                        >
                          {(["adultos", "ninos"] as const).map((aud) => {
                            const on = (box.audience || "adultos") === aud;
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
                    <div>
                      <label
                        className="block text-xs font-medium text-gray-600 mb-1"
                        title="Personas de este servicio (por defecto, toda su audiencia)"
                      >
                        Personas
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={boxPeople(box) || ""}
                        onChange={(e) => {
                          const v = parseInt(
                            e.target.value.replace(/\./g, ""),
                            10,
                          );
                          setServiceBoxes((prev) =>
                            prev.map((b) =>
                              b.id === box.id
                                ? {
                                    ...b,
                                    people:
                                      !Number.isFinite(v) ||
                                      v === audienceCount(b)
                                        ? undefined
                                        : v,
                                  }
                                : b,
                            ),
                          );
                        }}
                        disabled={isRestrictedEditing}
                        className={`w-24 border rounded-lg px-3 py-2 text-sm text-right font-semibold ${
                          box.people !== undefined
                            ? "border-amber-400 bg-amber-50 text-amber-900"
                            : "border-gray-300"
                        }`}
                      />
                      {box.people !== undefined && (
                        <p className="mt-0.5 text-[10px] text-amber-700">
                          de {audienceCount(box)}
                        </p>
                      )}
                    </div>
                    {eventDaysCount > 1 && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Día
                        </label>
                        <select
                          value={Math.min(box.day || 1, eventDaysCount)}
                          onChange={(e) =>
                            setServiceBoxes((prev) =>
                              prev.map((b) =>
                                b.id === box.id
                                  ? { ...b, day: Number(e.target.value) }
                                  : b,
                              ),
                            )
                          }
                          disabled={isRestrictedEditing}
                          className="px-3 py-2 text-sm border border-gray-300 rounded-lg font-semibold text-blue-900"
                          title="Día del evento en que va este servicio"
                        >
                          {Array.from({ length: eventDaysCount }, (_, i) => (
                            <option key={i + 1} value={i + 1}>
                              {dayLabel(i + 1)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="ml-auto pb-2 flex items-center gap-2">
                      {serviceBoxes.length > 1 && !isRestrictedEditing && (
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
                          disabled={
                            !box.selectedCategory || isRestrictedEditing
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed text-left flex justify-between items-center"
                        >
                          <span
                            className={
                              box.selectedItem
                                ? "text-gray-900"
                                : "text-gray-500"
                            }
                          >
                            {box.selectedItem
                              ? getFilteredProducts(box.selectedCategory).find(
                                  (p) => p.codigo === box.selectedItem,
                                )?.nombre || "Seleccionar item"
                              : "Seleccionar item"}
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

                        {openDropdown === box.id && box.selectedCategory && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                            {/* In-memory search to filter items by name */}
                            <div className="sticky top-0 bg-white p-2 border-b border-gray-200">
                              <input
                                type="text"
                                autoFocus
                                value={itemSearch}
                                onChange={(e) => setItemSearch(e.target.value)}
                                placeholder="Buscar item por nombre..."
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                            </div>
                            {(() => {
                              const filteredProducts = getFilteredProducts(
                                box.selectedCategory,
                              )
                                // Hide deactivated items from the picker.
                                // Already-selected items still render via the
                                // button label above (full product list).
                                .filter(
                                  (product) => product.is_active !== false,
                                )
                                // La sección FIJA no se ofrece en el
                                // buscador: sus servicios entran solos a la
                                // cotización y no se pueden quitar.
                                .filter(
                                  (product) =>
                                    !isLockedService(
                                      box.selectedCategory,
                                      product.codigo,
                                    ),
                                )
                                .filter((product) =>
                                  matchesSearch(itemSearch, product.nombre),
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
                                    // Keep dropdown open after selection
                                  }}
                                  className="w-full px-3 py-2 text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                                >
                                  {product.nombre} - $
                                  {product.precio.toLocaleString()}
                                </button>
                              );

                              // Con secciones definidas, el listado se agrupa
                              // como la carta (Entradas, Principales...); una
                              // categoría sin secciones se ve igual que hoy.
                              const cat = orderedCategories.find(
                                (c) => c.name === box.selectedCategory,
                              );
                              const secs = cat
                                ? categorySections
                                    .filter((s) => s.category_id === cat.id)
                                    .sort((a, b) => a.sort_order - b.sort_order)
                                : [];
                              if (secs.length === 0) {
                                return filteredProducts.map(itemButton);
                              }

                              const sectionOf = (codigo: string) =>
                                categoryLinks.find(
                                  (l) =>
                                    l.category_id === cat!.id &&
                                    l.variable_service_id.toString() === codigo,
                                )?.section_id || 0;

                              return [
                                ...secs.map((s) => ({
                                  key: `s-${s.id}`,
                                  name: s.name,
                                  items: filteredProducts.filter(
                                    (p) => sectionOf(p.codigo) === s.id,
                                  ),
                                })),
                                {
                                  key: "s-0",
                                  name: "Sin sección",
                                  items: filteredProducts.filter(
                                    (p) => sectionOf(p.codigo) === 0,
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

                  {box.selectedCategory && (
                    <div className="mt-4">
                      {/* Items agrupados por seccion, como la carta (mockup):
                          subtitulo azul marino, nombre, precio, cantidad por
                          persona y el total de porciones a la derecha. */}
                      {(() => {
                        const cat = orderedCategories.find(
                          (c) => c.name === box.selectedCategory,
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
                                  l.variable_service_id.toString() === codigo,
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
                                box.selectedCategory,
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
                                      ${service.precio.toLocaleString()}
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

                      {/* Menus guardados de esta categoria + guardar el actual */}
                      <div className="mt-2 flex items-center justify-between">
                        <div className="relative dropdown-container">
                          {(() => {
                            const boxGroups = serviceGroups.filter(
                              (g) =>
                                !box.selectedCategory ||
                                g.category === box.selectedCategory,
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
                                                loadGroupIntoBox(box.id, group);
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
                                                setConfirmGroupDel(group.id);
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
                </div>
              ))}

              <button
                onClick={addServiceBox}
                disabled={isRestrictedEditing}
                className="mt-2 text-sm font-semibold text-blue-600 hover:underline disabled:text-gray-300 disabled:no-underline"
              >
                + Agregar servicio
              </button>
            </div>
          </div>

          {/* Descuento */}
          {userRole && getMaxDiscountForRole() > 0 && (
            <div className="bg-white rounded-xl shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Descuento
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descuento
                  </label>
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
                      : `Máximo: $${getMaxDiscountAmount().toLocaleString()} — equivale al ${getMaxDiscountForRole()}% (${userRole})`}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Monto del Descuento
                  </label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg">
                    <span className="text-red-600 font-medium">
                      -${discountAmountUI.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Total con Descuento
                  </label>
                  <div className="px-3 py-2 bg-green-50 border border-green-300 rounded-lg">
                    <span className="text-green-700 font-bold">
                      ${formData.total_amount.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {hasDiscount && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center">
                    <span className="text-yellow-800 text-sm">
                      💡 <strong>Descuento aplicado:</strong>{" "}
                      {discType === "%"
                        ? `${formData.discount_percentage || 0}% ($${discountAmountUI.toLocaleString()} de descuento)`
                        : `$${discountAmountUI.toLocaleString()} (monto cerrado)`}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Servicios fijos del evento (editable; el resumen los lista) */}
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Servicios fijos del evento
            </h3>
            <div>
              {selectedFixedServices.map((service, index) =>
                service?.codigo ? (
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
                        ).toLocaleString()}
                      </span>
                      <span>×{service.quantity}</span>
                      {eventDaysCount > 1 && (
                        <select
                          value={Math.min(service.day || 0, eventDaysCount)}
                          onChange={(e) =>
                            setSelectedFixedServices((prev) =>
                              prev.map((f, i) =>
                                i === index
                                  ? { ...f, day: Number(e.target.value) }
                                  : f,
                              ),
                            )
                          }
                          disabled={isRestrictedEditing}
                          className="text-sm text-gray-500 bg-transparent border-0 focus:ring-0 cursor-pointer"
                          title="Día del evento (o todo el evento)"
                        >
                          <option value={0}>todo el evento</option>
                          {Array.from({ length: eventDaysCount }, (_, i) => (
                            <option key={i + 1} value={i + 1}>
                              {dayLabel(i + 1)}
                            </option>
                          ))}
                        </select>
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
                    <select
                      value=""
                      onChange={(e) =>
                        handleFixedServiceSelect(e.target.value, index)
                      }
                      disabled={isRestrictedEditing}
                      autoFocus
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                    >
                      <option value="">Seleccionar servicio fijo…</option>
                      {fixedServices.map((fixedService) => (
                        <option
                          key={fixedService.codigo}
                          value={fixedService.codigo}
                        >
                          {fixedService.nombre}
                        </option>
                      ))}
                    </select>
                    {!isRestrictedEditing && (
                      <button
                        onClick={() => removeFixedService(index)}
                        className="text-gray-300 hover:text-red-600"
                        title="Cancelar"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ),
              )}

              <button
                onClick={addNewFixedServiceSlot}
                disabled={
                  isRestrictedEditing ||
                  selectedFixedServices.some((s) => !s.codigo)
                }
                className="mt-2 text-sm font-semibold text-blue-600 hover:underline disabled:text-gray-300 disabled:no-underline"
              >
                + Agregar servicio fijo
              </button>
            </div>
          </div>

          {/* Observaciones */}
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
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
                            ${(perPerson * people).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400">
                          {parts.join(" · ")}
                        </p>
                      </div>
                    );
                  })
              )}

              <div className="bg-gray-50 px-4 py-2 space-y-0.5 border-t border-gray-200">
                <div className="flex justify-between text-xs font-semibold text-gray-600">
                  <span>Por adulto (servicios completos)</span>
                  <span>${formData.value_per_person.toLocaleString()}</span>
                </div>
                {childrenCount > 0 && (
                  <div className="flex justify-between text-xs font-semibold text-gray-600">
                    <span>Por niño</span>
                    <span>
                      $
                      {Math.round(
                        serviceBoxes.reduce((sum, box) => {
                          if ((box.audience || "adultos") !== "ninos")
                            return sum;
                          if (boxPeople(box) !== childrenCount) return sum;
                          return (
                            sum +
                            box.services.reduce(
                              (s, it) => s + it.precio * it.quantity,
                              0,
                            )
                          );
                        }, 0),
                      ).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
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
                        ).toLocaleString()}
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
                    ${formData.subtotal_amount.toLocaleString()}
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
                    -${discountAmountUI.toLocaleString()}
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
                        ${Math.round(totalConIva / 1.19).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between px-4 py-1.5 text-sm">
                      <span className="text-gray-500">IVA (19%)</span>
                      <span className="text-gray-700">
                        $
                        {Math.round(
                          totalConIva - totalConIva / 1.19,
                        ).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="bg-amber-100 px-4 py-2">
                    <div className="flex justify-between font-bold text-black">
                      <span>Total con IVA</span>
                      <span>${totalConIva.toLocaleString()}</span>
                    </div>
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
                            <input
                              type="text"
                              inputMode="numeric"
                              value={tipPct || ""}
                              disabled={isRestrictedEditing}
                              onChange={(e) => {
                                const v = parseInt(e.target.value, 10);
                                setTipPct(
                                  Number.isFinite(v)
                                    ? Math.min(100, Math.max(0, v))
                                    : 0,
                                );
                              }}
                              className="w-12 border border-gray-300 rounded-md px-1.5 py-0.5 text-xs text-right"
                            />
                            <span className="text-xs text-gray-500">%</span>
                          </span>
                        )}
                      </label>
                      {tipEnabled && (
                        <span className="font-bold text-gray-900">
                          ${tipAmountUI.toLocaleString()}
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
                      <span>${formData.total_amount.toLocaleString()}</span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
