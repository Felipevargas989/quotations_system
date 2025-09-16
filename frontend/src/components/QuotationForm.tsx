import { useState, useEffect } from "react";
import { Save, RotateCcw, ArrowLeft, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  useGoogleSheets,
  useGoogleSheetsFixed,
} from "../hooks/useGoogleSheets";
import { validateCompleteClientForm } from "../utils/validation";
import { CLIENT_TYPES, DEFAULT_CLIENT_TYPE } from "../constants/clientTypes";
import {
  createQuotation,
  getQuotationById,
  updateQuotation,
} from "../services/quotations.service";
import { createClient, getClients } from "../services/clients.service";
import { ClientFormData } from "../types/clients.types";
import {
  EventType,
  QuotationFormData,
  QuotationFormDataUpdate,
  QuotationRequestType,
  QuotationStatus,
} from "../types/quotations.types";

interface QuotationFormProps {
  quotation?: any;
  onSave?: () => void;
  isFromRequirement?: boolean;
}

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

export default function QuotationForm({
  quotation,
  onSave,
  isFromRequirement = false,
}: QuotationFormProps) {
  const { user, userRole } = useAuth();
  const { products, loading: productsLoading } = useGoogleSheets();
  const { fixedServices, calculatePrice } = useGoogleSheetsFixed();

  // TODO: add type
  const [formData, setFormData] = useState<QuotationFormData>({
    event_type: EventType.ALMUERZO_O_CENA,
    event_date: new Date(),
    people_count: 1,
    subtotal_amount: 0,
    discount_percentage: 0,
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

  // State for original services (for restricted editing)
  const [originalVariableServices, setOriginalVariableServices] = useState<
    SelectedService[]
  >([]);
  const [originalFixedServices, setOriginalFixedServices] = useState<
    SelectedFixedService[]
  >([]);
  const [originalTotalPrice, setOriginalTotalPrice] = useState<number>(0);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Check if we're editing an accepted quotation
  const isRestrictedEditing = quotation?.quotation_status === "aceptada";

  // Check if all original fixed services are present (for restricted editing)
  const areOriginalFixedServicesPresent = () => {
    if (!isRestrictedEditing) return true;

    return originalFixedServices.every((originalService) =>
      selectedFixedServices.some(
        (currentService) => currentService.codigo === originalService.codigo,
      ),
    );
  };

  // Check if all original variable services are present (for restricted editing)
  const areOriginalVariableServicesPresent = () => {
    if (!isRestrictedEditing) return true;

    const allCurrentServices = serviceBoxes.flatMap((box) => box.services);
    return originalVariableServices.every((originalService) =>
      allCurrentServices.some(
        (currentService) => currentService.codigo === originalService.codigo,
      ),
    );
  };

  // Check if current price is sufficient (for restricted editing)
  const isPriceSufficient = () => {
    if (!isRestrictedEditing) return true;

    return Math.round(formData.total_amount) >= Math.round(originalTotalPrice);
  };

  // Validation for quotation form
  const isQuotationFormValid = () => {
    const basicValidation =
      formData.client_id.trim() !== "" &&
      formData.event_type.trim() !== "" &&
      formData.event_date.toString().trim() !== "";

    // For restricted editing, also check that original services are present and price is sufficient
    if (isRestrictedEditing) {
      return (
        basicValidation &&
        areOriginalFixedServicesPresent() &&
        areOriginalVariableServicesPresent() &&
        isPriceSufficient()
      );
    }

    return basicValidation;
  };

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
        event_date: new Date(quotation.event_date),
      });
      setIsEditingExisting(!!quotation.id);

      // SIEMPRE cargar items desde la base de datos si tiene ID
      if (quotation.id) {
        loadItemsFromDatabase(quotation.id);
      }
    }
  }, [quotation]);

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
  }, [formData.discount_percentage]);

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

    // Save original services for restricted editing mode
    const allVariableServices = serviceBoxesData.flatMap((box) => box.services);
    setOriginalVariableServices([...allVariableServices]);
    setOriginalFixedServices([...fixedServicesLoaded]);
    setOriginalTotalPrice(quotation.total_amount); // Save original total amount from quotation

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

  const updateServiceBox = (boxId: string, field: string, value: string) => {
    setServiceBoxes((prev) =>
      prev.map((box) =>
        box.id === boxId
          ? {
              ...box,
              [field]: value,
              ...(field === "selectedCategory"
                ? { selectedItem: "", selectedItems: [], services: [] }
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
            // In restricted mode, don't allow removing original services completely
            if (isRestrictedEditing) {
              const isOriginalService = originalVariableServices.some(
                (original) => original.codigo === codigo,
              );
              if (isOriginalService) {
                alert(
                  "No se pueden eliminar servicios originales en modo de edición restringida",
                );
                return box;
              }
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

    // Aplicar descuento usando el valor del formData
    const discountAmount = Math.round(
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
        event_date: new Date(formData.event_date),
        request_type: isFromRequirement
          ? QuotationRequestType.COTIZACION
          : formData.request_type,
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
          event_date: new Date(quotationData.event_date),
          request_type: quotationData.request_type,
          value_per_person: Math.round(quotationData.value_per_person),
          fixed_value: Math.round(quotationData.fixed_value),
          subtotal_amount: Math.round(quotationData.subtotal_amount),
          total_amount: Math.round(quotationData.total_amount),
          items: quotationData.items,
          quotation_status: quotationData.quotation_status,
          people_count: quotationData.people_count,
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
      if (onSave) onSave();
    } catch (error) {
      alert(
        `Error al guardar la cotización: ${error instanceof Error ? error.message : "Error desconocido"}`,
      );
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
    setDiscountPercentage(0);
    setIsEditingExisting(false);
    setFormData({
      event_type: EventType.ALMUERZO_O_CENA,
      event_date: new Date(),
      people_count: 1,
      subtotal_amount: 0,
      discount_percentage: 0,
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

  if (productsLoading) {
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
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3 px-2">
          <button
            onClick={() => onSave && onSave()}
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
            <div className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm font-medium">
              🔒 Editando una cotización aceptada
            </div>
          )}
          {isRestrictedEditing &&
            formData.total_amount > originalTotalPrice && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4 shadow-sm">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <svg
                        className="w-5 h-5 text-green-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-green-800 mb-1">
                      Aumento de Precio Detectado
                    </h4>
                    <p className="text-sm text-green-700">
                      Diferencia:{" "}
                      <span className="font-semibold">
                        $
                        {(
                          formData.total_amount - originalTotalPrice
                        ).toLocaleString()}
                      </span>
                    </p>
                    <p className="text-xs text-green-600 mt-1">
                      Este monto se agregará automáticamente a un pago existente
                      o se creará uno nuevo.
                    </p>
                  </div>
                </div>
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
        </div>
      </div>

      <div>
        {/* Error message for missing original services */}
        {isRestrictedEditing &&
          (!areOriginalFixedServicesPresent() ||
            !areOriginalVariableServicesPresent()) && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4">
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
                    <strong>Error:</strong> No se pueden eliminar servicios
                    originales. Todos los servicios originales (variables y
                    fijos) deben estar presentes.
                  </p>
                </div>
              </div>
            </div>
          )}

        {/* Error message for insufficient price */}
        {isRestrictedEditing && !isPriceSufficient() && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4">
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
                  <strong>Error:</strong> El precio total no puede ser menor al
                  original. Precio actual: $
                  {Math.round(formData.total_amount).toLocaleString()} | Precio
                  original: ${Math.round(originalTotalPrice).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal - Formulario */}
        <div className="lg:col-span-2 space-y-6">
          {/* Información del cliente */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">
              Información del Cliente
            </h3>

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
                  <select
                    value={formData.client_id || ""}
                    onChange={(e) => handleClientSelect(e.target.value)}
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent w-full"
                  >
                    <option value="">Seleccionar cliente existente</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name} ({client.client_type})
                      </option>
                    ))}
                  </select>
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
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
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
                  value={formData.event_date.toISOString().split("T")[0]}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      event_date: new Date(e.target.value),
                    }))
                  }
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Número de Personas *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={formData.people_count}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      people_count: parseInt(e.target.value),
                    }))
                  }
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Servicios Variables */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Servicios Variables
              </h3>
              <button
                onClick={addServiceBox}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
              >
                <Plus size={16} />
                <span>Agregar Servicio</span>
              </button>
            </div>

            <div className="space-y-4">
              {serviceBoxes.map((box, index) => (
                <div
                  key={box.id}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900">
                      Servicio {index + 1}
                    </h4>
                    {serviceBoxes.length > 1 && (
                      <button
                        onClick={() => removeServiceBox(box.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
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
                        disabled={box.selectedCategory !== ""}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Seleccionar categoría</option>
                        {serviceCategories.map((category) => (
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
                          onClick={() =>
                            setOpenDropdown(
                              openDropdown === box.id ? null : box.id,
                            )
                          }
                          disabled={!box.selectedCategory}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 text-left flex justify-between items-center"
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
                            {getFilteredProducts(box.selectedCategory).map(
                              (product) => (
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
                              ),
                            )}
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
                          const isOriginalService =
                            originalVariableServices.some(
                              (original) => original.codigo === service.codigo,
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
                                {isOriginalService && isRestrictedEditing && (
                                  <span className="text-xs text-purple-600 bg-purple-100 px-1 py-0.5 rounded">
                                    🔒 Original
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="text-sm font-medium">
                                  ${service.precio.toLocaleString()}
                                </span>
                                <div className="flex items-center space-x-1">
                                  <button
                                    onClick={() =>
                                      updateServiceQuantity(
                                        service.codigo,
                                        service.quantity - 1,
                                        box.id,
                                      )
                                    }
                                    className={`w-6 h-6 rounded text-xs ${
                                      isRestrictedEditing &&
                                      isOriginalService &&
                                      service.quantity <= 1
                                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                        : "bg-gray-200 hover:bg-gray-300"
                                    }`}
                                    disabled={
                                      isRestrictedEditing &&
                                      isOriginalService &&
                                      service.quantity <= 1
                                    }
                                  >
                                    -
                                  </button>
                                  <span className="w-8 text-center text-sm">
                                    {service.quantity}
                                  </span>
                                  <button
                                    onClick={() =>
                                      updateServiceQuantity(
                                        service.codigo,
                                        service.quantity + 1,
                                        box.id,
                                      )
                                    }
                                    className="w-6 h-6 bg-gray-200 rounded text-xs hover:bg-gray-300"
                                  >
                                    +
                                  </button>
                                </div>
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
                    Porcentaje de Descuento
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={getMaxDiscountForRole()}
                      step={1}
                      value={formData.discount_percentage || ""}
                      onChange={(e) => {
                        const inputValue = e.target.value;
                        const maxDiscount = getMaxDiscountForRole();

                        // Handle empty input
                        if (inputValue === "") {
                          setFormData((prev) => ({
                            ...prev,
                            discount_percentage: 0,
                          }));
                          return;
                        }

                        const value = parseInt(inputValue);

                        // Handle invalid numbers
                        if (isNaN(value)) {
                          return;
                        }

                        if (value <= maxDiscount) {
                          setFormData((prev) => ({
                            ...prev,
                            discount_percentage: value,
                          }));
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
                      placeholder="0"
                    />
                    <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                      %
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Máximo: {getMaxDiscountForRole()}% ({userRole})
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Monto del Descuento
                  </label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg">
                    <span className="text-red-600 font-medium">
                      -$
                      {Math.round(
                        formData.subtotal_amount *
                          ((formData.discount_percentage || 0) / 100),
                      ).toLocaleString()}
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

              {(formData.discount_percentage || 0) > 0 && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center">
                    <span className="text-yellow-800 text-sm">
                      💡 <strong>Descuento aplicado:</strong>{" "}
                      {formData.discount_percentage || 0}% ($
                      {Math.round(
                        formData.subtotal_amount *
                          ((formData.discount_percentage || 0) / 100),
                      ).toLocaleString()}{" "}
                      de descuento)
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
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
              {selectedFixedServices.map((service, index) => {
                const isOriginalService = originalFixedServices.some(
                  (original) => original.codigo === service.codigo,
                );

                return (
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
                        className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:border-transparent"
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
                      {isOriginalService && isRestrictedEditing && (
                        <span className="text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded">
                          🔒 Original
                        </span>
                      )}
                      {(!isOriginalService || !isRestrictedEditing) && (
                        <button
                          onClick={() => removeFixedService(index)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Add more services button */}
              <button
                onClick={addNewFixedServiceSlot}
                className="w-full py-2 px-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center space-x-2"
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
            {(formData.discount_percentage || 0) > 0 && (
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
                    Descuento ({formData.discount_percentage || 0}%)
                  </span>
                  <span className="text-red-600">
                    -$
                    {Math.round(
                      formData.subtotal_amount *
                        ((formData.discount_percentage || 0) / 100),
                    ).toLocaleString()}
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
