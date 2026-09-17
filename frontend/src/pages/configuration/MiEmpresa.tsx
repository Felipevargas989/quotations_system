import { Building } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import UserManagementPage from "../UserManagementPage";
import CompanyConfiguration from "./companyConfiguration/CompanyConfiguration";
import CorreosDeLaEmpresa from "./CorreosDeLaEmpresa";
import PestanaPlan from "./PestanaPlan";

// MI EMPRESA (18-09-2026, sprint "Mi cuenta / Mi empresa").
//
// Felipe: "hacer LA configuración de la cuenta y configuración de la
// empresa y separar todo, hoy está revuelto". Esta es la casa de TODO
// lo que es de la empresa, en pestañas:
//   Marca    → logo, colores, redes (la antigua Configuración de la
//              Compañía, embebida tal cual)
//   Correos  → las casillas de notificaciones (vivían dentro de la
//              pantalla personal, mudadas acá)
//   Usuarios → la gestión de usuarios (antes suelta en el menú)
//   Plan     → qué plan tiene la empresa y hasta cuándo corre
//
// La pestaña viaja en la URL (?tab=) para poder llegar directo, igual
// que Personas con su ?dia=. Toda la página es de administrador: la
// ruta la cierra PermissionGuard con company_configuration.

const PESTANAS = [
  { id: "marca", nombre: "Marca" },
  { id: "correos", nombre: "Correos" },
  { id: "usuarios", nombre: "Usuarios" },
  { id: "plan", nombre: "Plan" },
] as const;

type PestanaId = (typeof PESTANAS)[number]["id"];

export default function MiEmpresa() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab");
  const activa: PestanaId = PESTANAS.some((p) => p.id === tab)
    ? (tab as PestanaId)
    : "marca";

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <div className="bg-blue-100 p-2 rounded-lg">
          <Building className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mi empresa</h1>
          <p className="text-gray-600">
            La marca, los correos, el equipo y el plan
          </p>
        </div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              onClick={() => setSearchParams({ tab: p.id })}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activa === p.id
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {p.nombre}
            </button>
          ))}
        </nav>
      </div>

      {activa === "marca" && <CompanyConfiguration />}
      {activa === "correos" && <CorreosDeLaEmpresa />}
      {activa === "usuarios" && <UserManagementPage />}
      {activa === "plan" && <PestanaPlan />}
    </div>
  );
}
