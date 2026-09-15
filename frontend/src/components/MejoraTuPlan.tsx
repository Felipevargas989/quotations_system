import { Lock, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Derecho,
  NOMBRE_DEL_DERECHO,
  NOMBRE_DEL_PLAN,
  PLAN_MINIMO,
} from "../constants/permissions";

// LA PANTALLA DE "MEJORA TU PLAN" (14-09-2026, paso 3.2 del roadmap).
//
// Es la que ve alguien cuando entra a una función que su plan no incluye.
// Se muestra en vez de esconder, porque enseñar lo que se está perdiendo
// es lo que hace que suba de plan: es la palanca de venta, no un error.
//
// Los dos módulos propios (Personal y Marketing) no se venden, así que
// para ellos no ofrece ninguna mejora: solo dice que no está disponible.

type Props = {
  derecho: Derecho;
  /** Pantalla completa (una sección entera) o recuadro (una pestaña). */
  variante?: "pantalla" | "recuadro";
};

export default function MejoraTuPlan({
  derecho,
  variante = "pantalla",
}: Props) {
  const navigate = useNavigate();
  const plan = PLAN_MINIMO[derecho];
  const que = NOMBRE_DEL_DERECHO[derecho];
  const seVende = Boolean(plan);

  const titulo = seVende
    ? `${que} ${que.startsWith("Los") || que.startsWith("Las") ? "están" : "está"} en el plan ${NOMBRE_DEL_PLAN[plan!]}`
    : "Esta función no está disponible";

  const detalle = seVende
    ? "Tus datos siguen guardados. Al cambiar de plan aparece todo donde lo dejaste."
    : "No forma parte de los planes de Eventia.";

  if (variante === "recuadro") {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center">
        <Lock className="mx-auto mb-2 h-5 w-5 text-gray-400" />
        <p className="text-sm font-medium text-gray-900">{titulo}</p>
        <p className="mt-1 text-xs text-gray-600">{detalle}</p>
        {seVende && (
          <button
            onClick={() => navigate("/plans")}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Ver los planes
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="mx-auto max-w-md px-4 text-center">
        <div className="rounded-lg bg-white p-8 shadow-lg">
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
              <Lock className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <h1 className="mb-4 text-2xl font-bold text-gray-900">{titulo}</h1>
          <p className="mb-6 text-gray-600">{detalle}</p>
          {seVende && (
            <button
              onClick={() => navigate("/plans")}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Sparkles className="h-4 w-4" />
              Ver los planes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
