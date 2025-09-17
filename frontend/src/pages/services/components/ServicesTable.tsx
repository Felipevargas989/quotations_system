import { Edit, Trash2, DollarSign, Tag } from "lucide-react";
import { VariableService, FixedService } from "../../../types/services.types";
import { ServiceType } from "../constants";

interface ServicesTableProps {
  readonly variableServices: VariableService[];
  readonly fixedServices: FixedService[];
  readonly onEditService?: (
    service: VariableService | FixedService,
    type: ServiceType,
  ) => void;
  readonly onDeleteService?: (serviceId: number, type: ServiceType) => void;
}

export default function ServicesTable({
  variableServices,
  fixedServices,
  onEditService,
  onDeleteService,
}: ServicesTableProps) {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
    }).format(price);
  };

  return (
    <div className="space-y-8">
      {/* Variable Services Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900 flex items-center space-x-2">
              <Tag className="h-5 w-5 text-blue-600" />
              <span>Servicios Variables</span>
            </h3>
            <span className="text-sm text-gray-500">
              {variableServices.length} servicios
            </span>
          </div>
        </div>

        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Código
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nombre
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Categoría
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Precio
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {variableServices.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-4 text-center text-gray-500"
                  >
                    No hay servicios variables registrados
                  </td>
                </tr>
              ) : (
                variableServices.map((service) => (
                  <tr key={service.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {service.code || "N/A"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div
                        className="text-sm text-gray-900 max-w-xs truncate"
                        title={service.name}
                      >
                        {service.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        {service.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-900">
                        {formatPrice(service.price)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        {onEditService && (
                          <button
                            onClick={() =>
                              onEditService(service, ServiceType.VARIABLE)
                            }
                            className="text-blue-600 hover:text-blue-900"
                            title="Editar servicio"
                          >
                            <Edit size={16} />
                          </button>
                        )}
                        {onDeleteService && (
                          <button
                            onClick={() =>
                              onDeleteService(service.id, ServiceType.VARIABLE)
                            }
                            className="text-red-600 hover:text-red-900"
                            title="Eliminar servicio"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fixed Services Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900 flex items-center space-x-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <span>Servicios Fijos</span>
            </h3>
            <span className="text-sm text-gray-500">
              {fixedServices.length} servicios
            </span>
          </div>
        </div>

        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Código
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nombre
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tipo de Cálculo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Precio Base
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rango de Precios
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Precio por Persona
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {fixedServices.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-4 text-center text-gray-500"
                  >
                    No hay servicios fijos registrados
                  </td>
                </tr>
              ) : (
                fixedServices.map((service) => (
                  <tr key={service.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {service.code || "N/A"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div
                        className="text-sm text-gray-900 max-w-xs truncate"
                        title={service.name}
                      >
                        {service.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800`}
                      >
                        {service.calculation_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-900">
                        {formatPrice(service.price)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {service.min_price && service.max_price ? (
                          <span>
                            {formatPrice(service.min_price)} -{" "}
                            {formatPrice(service.max_price)}
                          </span>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {service.price_per_person ? (
                          <div className="flex items-center">
                            {formatPrice(service.price_per_person)}
                          </div>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        {onEditService && (
                          <button
                            onClick={() =>
                              onEditService(service, ServiceType.FIXED)
                            }
                            className="text-blue-600 hover:text-blue-900"
                            title="Editar servicio"
                          >
                            <Edit size={16} />
                          </button>
                        )}
                        {onDeleteService && (
                          <button
                            onClick={() =>
                              onDeleteService(service.id, ServiceType.FIXED)
                            }
                            className="text-red-600 hover:text-red-900"
                            title="Eliminar servicio"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
