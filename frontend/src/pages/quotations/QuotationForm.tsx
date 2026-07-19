import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Save,
  RotateCcw,
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
import {
  createQuotation,
  getQuotationById,
  updateQuotation,
} from "../../services/quotations.service";
import { createClient, getClients } from "../../services/clients.service";
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
import { getCategorySections } from "../../services/sections.service";
import { CategorySection } from "../../types/services.types";
import QuantitySelector from "../../components/QuantitySelector";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
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
}

export default function QuotationForm() {
  const { id } = useParams<{ id?: string }>();
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

  const [clients, setClients] = useState<any[]>([]);
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
  const [isEditingExisting, setIsEditingExisting] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [clientFormData, setClientFormData] = useState<ClientFormData>({
    name: "",
    email: "",
    phone: "",
    contact_person: "",
    client_type: DEFAULT_CLIENT_TYPE,
  });
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

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
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
      }
    };

    fetchQuotationData();
  }, [id, navigate]);

  useEffect(() => {
    loadClients();
  }, []);

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
      setFormData({
        ...quotation,
        event_date: quotation.event_date.split("T")[0],
        event_end_date: quotation.event_end_date
          ? String(quotation.event_end_date).split("T")[0]
          : undefined,
      });
      setDiscType((quotation.discount_amount || 0) > 0 ? "$" : "%");
      setIsEditingExisting(!!quotation.id);

      // SIEMPRE cargar items desde la base de datos si tiene ID
      if (quotation.id) {
        loadItemsFromDatabase(quotation.id);
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

  useEffect(() => {
    // Obtener categorías únicas de productos
    const categories = [
      ...new Set(products.map((p) => p.categoria || "General")),
    ];
    setServiceCategories(categories);
  }, [products]);

  useEffect(() => {
    calculateTotals();
  }, [serviceBoxes, selectedFixedServices, formData.people_count]);

  useEffect(() => {
    calculateTotals();
  }, [formData.discount_percentage, formData.discount_amount, discType]);

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
        loadExistingItemsFromJSON(quotationData.items);
      } else {
        // Limpiar servicios seleccionados si no hay items
        setSelectedFixedServices([]);
      }
    } catch (error) {
      console.error("Error cargando items desde JSON:", error);
    }
  };

  const loadExistingItemsFromJSON = (itemsData: any) => {
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
          formData.subtotal_amount * ((formData.discount_percentage || 0) / 100),
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

    // Warn before discarding existing services
    const hasExistingServices = serviceBoxes.some(
      (box) => box.services.length > 0,
    );
    if (
      hasExistingServices &&
      !window.confirm(
        `Esto reemplazará los servicios actuales con el paquete "${collection.name}". ¿Continuar?`,
      )
    ) {
      return;
    }

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

  const loadClients = async () => {
    try {
      const { data } = await getClients();

      setClients(data);
    } catch (error) {
      setClients([]);
    }
  };

  // generateQuotationNumber function removed - quotation_number is now auto-generated in database

  const handleClientSelect = (clientId: string, clientData?: any) => {
    const selectedClient = clientData || clients.find((c) => c.id === clientId);
    if (selectedClient) {
      setFormData((prev) => ({
        ...prev,
        client_id: clientId,
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
        // Add the new client to the local state immediately
        setClients((prev) => [...prev, newClient]);

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
    // Calculate total from all services in all boxes
    const variableTotal = Math.round(
      serviceBoxes.reduce(
        (sum, box) =>
          sum +
          box.services.reduce(
            (boxSum, service) => boxSum + service.precio * service.quantity,
            0,
          ),
        0,
      ),
    );

    const fixedTotal = Math.round(
      selectedFixedServices.reduce(
        (sum, service) => sum + service.precio_calculado * service.quantity,
        0,
      ),
    );

    // El valor por persona es el total de servicios variables
    const valuePerPerson = variableTotal;

    // Subtotal = (valor por persona × número de personas) + servicios fijos
    const subtotalAmount = Math.round(
      valuePerPerson * Number(formData.people_count) + fixedTotal,
    );

    // Calcular subtotal antes del descuento para UI
    setSubtotalBeforeDiscount(subtotalAmount);

    // Aplicar descuento: por % o por monto cerrado, según el toggle
    const discountAmount =
      discType === "$"
        ? Math.min(subtotalAmount, Math.round(formData.discount_amount || 0))
        : Math.round(
            subtotalAmount * ((formData.discount_percentage || 0) / 100),
          );
    const finalTotal = Math.round(subtotalAmount - discountAmount);

    setFormData((prev) => ({
      ...prev,
      value_per_person: valuePerPerson,
      fixed_value: fixedTotal,
      subtotal_amount: subtotalAmount,
      total_amount: finalTotal,
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

      // if quotation already exists (from requirement or updating a quotation)
      if (quotation?.id || isFromRequirement) {
        // Actualizar cotización existente
        const targetId = quotation?.id;
        if (!targetId) {
          throw new Error(
            "No se puede actualizar: ID de cotización no encontrado",
          );
        }

        const updatedQuotation: QuotationFormDataUpdate = {
          client_id: quotationData.client_id,
          event_type: quotationData.event_type,
          event_date: quotationData.event_date,
          event_end_date: quotationData.event_end_date || null,
          request_type: quotationData.request_type,
          value_per_person: Math.round(quotationData.value_per_person),
          fixed_value: Math.round(quotationData.fixed_value),
          subtotal_amount: Math.round(quotationData.subtotal_amount),
          total_amount: Math.round(quotationData.total_amount),
          items: quotationData.items,
          quotation_status: quotationData.quotation_status,
          people_count: quotationData.people_count,
          discount_percentage: quotationData.discount_percentage,
          discount_amount: quotationData.discount_amount,
          observations: quotationData.observations,
        };
        const { error } = await updateQuotation(updatedQuotation, targetId);

        if (error) throw error;
      }
      // if quotation does not exist
      else {
        // Create new quotation
        const { error } = await createQuotation(quotationData);

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

  const handleClear = () => {
    setServiceBoxes([
      {
        id: "1",
        selectedCategory: "",
        selectedItem: "",
        selectedItems: [],
        services: [],
      },
    ]);
    setSelectedFixedServices([]);
    setSelectedCollection(null);
    setDiscountPercentage(0);
    setIsEditingExisting(false);
    setFormData({
      event_type: EventType.ALMUERZO_O_CENA,
      event_date: undefined,
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
                      client_type: e.target.value as typeof DEFAULT_CLIENT_TYPE,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {CLIENT_TYPES.map((type) => (
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
          {isRestrictedEditing && (
            <div className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium">
              🔒 Solo Admin/Operaciones pueden editar cotizaciones aceptadas
            </div>
          )}
        </div>
        <div className="flex items-center space-x-3">
          {!isRestrictedEditing && (
            <button
              onClick={handleClear}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 flex items-center space-x-2"
            >
              <RotateCcw size={16} />
              <span>Limpiar Cotización</span>
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={loading || !isQuotationFormValid()}
            className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
              loading || !isQuotationFormValid()
                ? "bg-gray-400 text-gray-600 cursor-not-allowed"
                : "bg-green-600 text-white hover:bg-green-700"
            }`}
          >
            <Save size={16} />
            <span>
              {loading
                ? "Guardando..."
                : isEditingExisting
                  ? "Actualizar Cotización"
                  : isFromRequirement
                    ? "Crear Cotización"
                    : "Guardar Cotización"}
            </span>
          </button>
          {!loading && missingRequiredFields().length > 0 && (
            <span className="text-xs text-amber-700 font-medium">
              Falta: {missingRequiredFields().join(" · ")}
            </span>
          )}
        </div>
      </div>

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
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">
              Información del evento
            </h3>

            {/* Creado por - New Row */}
            <div className="grid grid-cols-1 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Cotización creada por
                </label>
                <div className="w-fit px-2 py-1 text-sm border border-gray-300 rounded bg-gray-50 text-gray-600">
                  {creatorUser ? (
                    <span title={creatorUser.email}>
                      {creatorUser.full_name || creatorUser.email}
                    </span>
                  ) : quotation?.user_id ? (
                    <span className="text-gray-400">Cargando...</span>
                  ) : (
                    <span className="text-gray-400">
                      {user?.email || "Usuario actual"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Número de Cotización and Cliente - Second Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Número de Cotización
                </label>
                <div className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-gray-50 text-gray-600">
                  {quotation?.quotation_number || "Auto-generado"}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Cliente Existente *
                </label>
                <div className="flex space-x-2">
                  <SelectWithSearch
                    options={clients.map((client) => ({
                      value: client.id,
                      label: `${client.name} (${client.client_type})`,
                    }))}
                    value={formData.client_id || ""}
                    onChange={(value) => handleClientSelect(value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowClientModal(true)}
                    className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center space-x-1"
                    title="Crear nuevo cliente"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Nombre del Cliente
                </label>
                <input
                  type="text"
                  required
                  value={formData.client_name}
                  readOnly
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-gray-100 cursor-not-allowed"
                  placeholder="Seleccione un cliente"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.client_email}
                  readOnly
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-gray-100 cursor-not-allowed"
                  placeholder="Seleccione un cliente"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Teléfono
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  readOnly
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-gray-100 cursor-not-allowed"
                  placeholder="Seleccione un cliente"
                />
              </div>
            </div> */}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
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
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">Seleccionar tipo</option>
                  {Object.values(EventType).map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Fecha del Evento *
                </label>
                <input
                  type="date"
                  value={formData.event_date}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      event_date: e.target.value,
                      // si el "hasta" quedó antes del nuevo inicio, se limpia
                      event_end_date:
                        prev.event_end_date &&
                        String(prev.event_end_date) < e.target.value
                          ? undefined
                          : prev.event_end_date,
                    }));
                  }}
                  disabled={isRestrictedEditing}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
                <label className="block text-xs font-medium text-gray-600 mb-1 mt-2">
                  Último día (opcional, para eventos de varios días)
                </label>
                <input
                  type="date"
                  value={formData.event_end_date || ""}
                  min={String(formData.event_date || "")}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      event_end_date: e.target.value || undefined,
                    }));
                  }}
                  disabled={isRestrictedEditing || !formData.event_date}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
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

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Número de Personas *
                </label>
                <NumberInput
                  id="people_count"
                  name="people_count"
                  value={formData.people_count}
                  onChange={(value) => {
                    // @ts-ignore
                    setFormData((prev) => ({
                      ...prev,
                      people_count: value ? Number(value) : undefined,
                    }));
                  }}
                  min={1}
                  disabled={isRestrictedEditing}
                />
              </div>
            </div>
          </div>

          {/* Servicios Variables */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-semibold text-gray-900">
                  Servicios Variables
                </h3>
                {selectedCollection && (
                  <span className="flex items-center space-x-1 bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full text-sm font-medium">
                    <Package size={14} />
                    <span>{selectedCollection.name}</span>
                  </span>
                )}
              </div>
              <div className="flex items-center flex-wrap gap-2">
                {/* Cargar / administrar grupos guardados */}
                <div className="relative dropdown-container">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenDropdown(
                        openDropdown === "service-groups"
                          ? null
                          : "service-groups",
                      )
                    }
                    disabled={isRestrictedEditing || serviceGroups.length === 0}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg flex items-center space-x-2 hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    title="Cargar un grupo guardado"
                  >
                    <Layers size={16} />
                    <span>
                      {serviceGroups.length === 0
                        ? "Sin grupos guardados"
                        : "Cargar grupo"}
                    </span>
                  </button>

                  {openDropdown === "service-groups" &&
                    serviceGroups.length > 0 && (
                      <div className="absolute right-0 z-10 w-64 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {serviceGroups.map((group) => (
                          <div
                            key={group.id}
                            className="flex items-center justify-between px-3 py-2 hover:bg-gray-100"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                loadGroupAsBox(group);
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
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (
                                  window.confirm(
                                    `¿Eliminar el grupo "${group.name}"?`,
                                  )
                                ) {
                                  await removeServiceGroup(group.id);
                                }
                              }}
                              className="ml-2 text-red-600 hover:text-red-800"
                              title="Eliminar grupo"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                </div>

                {/* Cargar / administrar paquetes (grupos de grupos) */}
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
                      serviceGroupCollections.length === 0
                    }
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg flex items-center space-x-2 hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    title="Cargar un paquete guardado"
                  >
                    <Package size={16} />
                    <span>
                      {serviceGroupCollections.length === 0
                        ? "Sin paquetes guardados"
                        : "Cargar paquete"}
                    </span>
                  </button>

                  {openDropdown === "service-group-collections" &&
                    serviceGroupCollections.length > 0 && (
                      <div className="absolute right-0 z-10 w-72 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {serviceGroupCollections.map((collection) => (
                          <div
                            key={collection.id}
                            className="flex items-center justify-between px-3 py-2 hover:bg-gray-100"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                loadCollectionAsBoxes(collection);
                                setOpenDropdown(null);
                              }}
                              className="flex-1 text-left text-sm"
                            >
                              <span className="text-gray-900">
                                {collection.name}
                              </span>{" "}
                              <span className="text-gray-500">
                                ({collection.groups?.length || 0} grupos)
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (
                                  window.confirm(
                                    `¿Eliminar el paquete "${collection.name}"?`,
                                  )
                                ) {
                                  await removeServiceGroupCollection(
                                    collection.id,
                                  );
                                  if (
                                    selectedCollection?.id === collection.id
                                  ) {
                                    setSelectedCollection(null);
                                  }
                                }
                              }}
                              className="ml-2 text-red-600 hover:text-red-800"
                              title="Eliminar paquete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                </div>

                {/* Crear paquete a partir de grupos guardados */}
                <button
                  type="button"
                  onClick={openCollectionModal}
                  disabled={isRestrictedEditing || serviceGroups.length === 0}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg flex items-center space-x-2 hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  title="Crear un paquete agrupando varios grupos"
                >
                  <Package size={16} />
                  <span>Crear paquete</span>
                </button>

                <button
                  onClick={addServiceBox}
                  disabled={isRestrictedEditing}
                  className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
                    isRestrictedEditing
                      ? "bg-gray-400 text-gray-600 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  <Plus size={16} />
                  <span>Agregar Servicio</span>
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {serviceBoxes.map((box, index) => (
                <div
                  key={box.id}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-medium text-gray-900">
                        Servicio {index + 1}
                      </h4>
                      {box.groupName && (
                        <p className="mt-0.5 flex items-center space-x-1 text-sm font-medium text-blue-600">
                          <Layers size={14} />
                          <span>
                            {box.groupName} · {box.selectedCategory}
                          </span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center space-x-3">
                      {!box.groupName &&
                        box.selectedCategory &&
                        box.services.length > 0 &&
                        !isRestrictedEditing && (
                          <button
                            type="button"
                            onClick={() => openSaveGroupModal(box.id)}
                            className="flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-800"
                            title="Guardar esta categoría y sus items como grupo"
                          >
                            <Layers size={16} />
                            <span>Guardar como grupo</span>
                          </button>
                        )}
                      {serviceBoxes.length > 1 && !isRestrictedEditing && (
                        <button
                          onClick={() => removeServiceBox(box.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                      >
                        <option value="">Seleccionar categoría</option>
                        {serviceCategories
                          .filter(
                            (category) =>
                              // Hide deactivated categories from the picker, but
                              // keep the one already selected on an existing box.
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

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
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
                                .filter((product) =>
                                  product.nombre
                                    .toLowerCase()
                                    .includes(itemSearch.trim().toLowerCase()),
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
                                    .sort(
                                      (a, b) => a.sort_order - b.sort_order,
                                    )
                                : [];
                              if (secs.length === 0) {
                                return filteredProducts.map(itemButton);
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
                    </div>
                  </div>

                  {box.selectedCategory && (
                    <div className="mt-4">
                      <h5 className="text-sm font-medium text-gray-700 mb-2">
                        Items seleccionados:
                      </h5>
                      <div className="space-y-2">
                        {getSelectedItemsForBox(box.id).map((service) => {
                          // Sección fija: va sí o sí con la categoría, no se
                          // puede quitar (cantidad mínima 1).
                          const locked = isLockedService(
                            box.selectedCategory,
                            service.codigo,
                          );
                          return (
                            <div
                              key={service.codigo}
                              className="flex items-center justify-between bg-gray-50 p-2 rounded"
                            >
                              <div className="flex items-center space-x-2">
                                <span className="text-sm">
                                  {service.nombre}
                                </span>
                                {locked && (
                                  <span
                                    title="Va siempre con esta categoría (sección fija)"
                                    className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5"
                                  >
                                    <Lock size={10} /> fijo
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="text-sm font-medium">
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
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Descuento */}
          {userRole && getMaxDiscountForRole() > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">
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

          {/* Observaciones */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">
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
          {/* Resumen por persona */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="bg-yellow-400 px-4 py-2">
              <div className="flex justify-between">
                <span className="font-bold text-black">
                  Servicios Variables
                </span>
              </div>
            </div>
            <div className="divide-y divide-gray-200">
              {serviceCategories.map((category) => {
                // Get all services from all boxes for this category
                const categoryServices = serviceBoxes.flatMap((box) =>
                  box.services.filter((s) => s.categoria === category),
                );
                if (categoryServices.length === 0) return null;

                return (
                  <div
                    key={category}
                    className="flex justify-between px-4 py-2 text-sm"
                  >
                    <span className="text-gray-700">{category}</span>
                    <span className="font-medium text-gray-900">
                      $
                      {categoryServices
                        .reduce(
                          (sum, service) =>
                            sum + service.precio * service.quantity,
                          0,
                        )
                        .toLocaleString()}
                    </span>
                  </div>
                );
              })}

              {/* Servicios cargados */}
              {serviceBoxes
                .flatMap((box) => box.services)
                .filter((s) => s.categoria === "Cargado").length > 0 && (
                <div className="flex justify-between px-4 py-2 text-sm">
                  <span className="text-blue-700">Servicios Cargados</span>
                  <span className="font-medium text-blue-900">
                    $
                    {serviceBoxes
                      .flatMap((box) => box.services)
                      .filter((s) => s.categoria === "Cargado")
                      .reduce(
                        (sum, service) =>
                          sum + service.precio * service.quantity,
                        0,
                      )
                      .toLocaleString()}
                  </span>
                </div>
              )}

              {/* Líneas vacías para completar */}
              {Array.from({
                length: Math.max(
                  0,
                  6 -
                    serviceCategories.filter((category) =>
                      serviceBoxes
                        .flatMap((box) => box.services)
                        .some((s) => s.categoria === category),
                    ).length -
                    (serviceBoxes
                      .flatMap((box) => box.services)
                      .filter((s) => s.categoria === "Cargado").length > 0
                      ? 1
                      : 0),
                ),
              }).map((_, index) => (
                <div
                  key={`empty-${index}`}
                  className="flex justify-between px-4 py-2 text-sm"
                >
                  <span className="text-gray-400">-</span>
                  <span className="text-gray-400">$0</span>
                </div>
              ))}

              <div className="bg-yellow-300 px-4 py-2">
                <div className="flex justify-between font-bold text-black">
                  <span>Total por persona</span>
                  <span>${formData.value_per_person.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Servicios Fijos - Selección */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="bg-yellow-400 px-4 py-2">
              <div className="flex justify-between">
                <span className="font-bold text-black">Servicios Fijos</span>
              </div>
            </div>

            <div className="p-4 space-y-3">
              {selectedFixedServices.map((service, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between border border-gray-200 rounded-lg p-3"
                >
                  <div className="flex-1">
                    <select
                      value={service?.codigo || ""}
                      onChange={(e) =>
                        handleFixedServiceSelect(e.target.value, index)
                      }
                      disabled={isRestrictedEditing}
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                    >
                      <option value="">Seleccionar servicio fijo</option>
                      {fixedServices.map((fixedService) => (
                        <option
                          key={fixedService.codigo}
                          value={fixedService.codigo}
                        >
                          {fixedService.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-gray-900 w-20 text-right">
                      $
                      {service
                        ? (
                            service.precio_calculado * service.quantity
                          ).toLocaleString()
                        : "0"}
                    </span>
                    {!isRestrictedEditing && (
                      <button
                        onClick={() => removeFixedService(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Add more services button */}
              <button
                onClick={addNewFixedServiceSlot}
                disabled={isRestrictedEditing}
                className={`w-full py-2 px-3 border-2 border-dashed rounded-lg transition-colors flex items-center justify-center space-x-2 ${
                  isRestrictedEditing
                    ? "border-gray-200 text-gray-400 cursor-not-allowed"
                    : "border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600"
                }`}
              >
                <span className="text-sm">+ Agregar más servicios</span>
              </button>
            </div>

            <div className="bg-yellow-300 px-4 py-2">
              <div className="flex justify-between font-bold text-black">
                <span>Total Fijo</span>
                <span>
                  $
                  {selectedFixedServices
                    .reduce(
                      (sum, service) =>
                        sum + service.precio_calculado * service.quantity,
                      0,
                    )
                    .toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Total Final */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
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

            <div className="bg-orange-300 px-4 py-2">
              <div className="flex justify-between font-bold text-black">
                <span>Total IVA incluido cotización</span>
                <span>${formData.total_amount.toLocaleString()}</span>
              </div>
            </div>

            <div className="divide-y divide-gray-200">
              <div className="flex justify-between px-4 py-2 text-sm bg-yellow-200">
                <span className="font-medium text-black">Neto</span>
                <span className="font-medium text-black">
                  ${Math.round(formData.total_amount / 1.19).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between px-4 py-2 text-sm bg-yellow-200">
                <span className="font-medium text-black">IVA</span>
                <span className="font-medium text-black">
                  $
                  {Math.round(
                    formData.total_amount - formData.total_amount / 1.19,
                  ).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
