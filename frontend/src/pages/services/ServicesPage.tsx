import { CreateServicesBulkDto } from "../../types/services.types";
import { createServicesBulk } from "../../services/services.service";

export default function ServicesPage() {
  const handleCreateServicesBulk = async () => {
    // TODO: implement real services
    const servicesData: CreateServicesBulkDto = {
      variable_services: [
        {
          code: "P001",
          name: "Té, café, aguas saborizadas de libre consumo",
          price: 1100,
          category: "Desayuno",
        },
      ],
      fixed_services: [
        {
          code: "SF001",
          name: "Salón Auditorio",
          price: 210000,
          calculation_type: "variable_con_limites",
          min_price: 210000,
          max_price: 400000,
          price_per_person: 7500,
        },
      ],
    };

    const response = await createServicesBulk(servicesData);
  };

  return (
    <div>
      <h1>Services</h1>
      <button onClick={() => handleCreateServicesBulk()}>
        Create Services
      </button>
    </div>
  );
}
