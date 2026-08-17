import { useAuth } from "../../contexts/AuthContext";
import MobiliarioTab from "../logistica/components/MobiliarioTab";

// INVENTARIO — lo que YA es nuestro y solo se cuenta y cuida.
//
// Nació el 15-08 (Felipe): el mobiliario no calzaba en Proveedores, que
// es todo lo que se le COMPRA a alguien. La pestaña de mobiliario es la
// misma pieza que vivía en Logística — solo cambió de casa.
export default function InventarioPage() {
  const { company } = useAuth();
  const companyId = company?.id ? Number(company.id) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
        <p className="text-sm text-gray-500">
          El mobiliario de la casa: stock, fotos y estado
        </p>
      </div>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {companyId === null ? (
          <div className="py-14 flex justify-center">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600" />
          </div>
        ) : (
          <MobiliarioTab companyId={companyId} />
        )}
      </div>
    </div>
  );
}
