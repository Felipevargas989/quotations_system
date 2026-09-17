import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { estadoDelPlan } from "../../services/pagos.service";
import { NOMBRE_DEL_PLAN } from "../../constants/permissions";

// "ESTAMOS CONFIRMANDO TU PAGO" (16-09-2026, sprint B del paso 4+5).
//
// El cliente vuelve de Mercado Pago a esta pantalla. La verdad del
// pago NO viene con él: llega por el aviso del proveedor al motor
// (plan §3.2, punto 9 — la versión anterior de esta pantalla marcaba
// premium sin verificar nada y el motor la apagó con un 410). Así que
// acá se pregunta el estado cada 3 segundos hasta que el aviso llegue,
// y se es honesto si tarda.
//
// El botón del final recarga la aplicación entera (location.href, no
// navigate): el perfil y los candados del plan viven en la sesión y
// tienen que nacer de nuevo con el plan recién activado.

const CADA_CUANTO_MS = 3000;
const INTENTOS_MAX = 40; // ≈ 2 minutos

export default function ConfirmationPage() {
  const [estado, setEstado] = useState<"esperando" | "activo" | "tarda">(
    "esperando",
  );
  const [plan, setPlan] = useState<string | null>(null);
  const intentos = useRef(0);
  // Al SUBIR de plan (18-09) la empresa ya estaba activa: lo que se
  // espera no es el estado, sino que el plan nuevo (?plan=…) rija.
  const planEsperado = new URLSearchParams(window.location.search).get(
    "plan",
  );

  useEffect(() => {
    let vivo = true;
    const preguntar = async () => {
      try {
        const r = await estadoDelPlan();
        if (!vivo) return;
        const listo = planEsperado
          ? r.estado_plan === "activo" && r.plan === planEsperado
          : r.estado_plan === "activo";
        if (listo) {
          setPlan(r.plan);
          setEstado("activo");
          return;
        }
      } catch {
        // La red puede parpadear justo al volver del pago: se insiste.
      }
      intentos.current += 1;
      if (intentos.current >= INTENTOS_MAX) {
        if (vivo) setEstado("tarda");
        return;
      }
      setTimeout(() => {
        if (vivo) void preguntar();
      }, CADA_CUANTO_MS);
    };
    void preguntar();
    return () => {
      vivo = false;
    };
  }, [planEsperado]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 max-w-md w-full p-8 text-center">
        {estado === "esperando" && (
          <>
            <Loader2 className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Estamos confirmando tu pago
            </h1>
            <p className="text-gray-600 text-sm">
              Mercado Pago nos avisa apenas se procese — suele tomar unos
              segundos. No cierres esta pantalla.
            </p>
          </>
        )}

        {estado === "activo" && (
          <>
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              ¡Listo! Tu plan está activo
            </h1>
            <p className="text-gray-600 text-sm mb-6">
              {plan && NOMBRE_DEL_PLAN[plan as keyof typeof NOMBRE_DEL_PLAN]
                ? `Bienvenido a ${NOMBRE_DEL_PLAN[plan as keyof typeof NOMBRE_DEL_PLAN]}. `
                : ""}
              Desde ahora se paga solo, mes a mes. El comprobante te llega
              de Mercado Pago.
            </p>
            <button
              onClick={() => {
                window.location.href = "/dashboard";
              }}
              className="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-xl hover:bg-blue-700 transition-colors"
            >
              Entrar a mi panel
            </button>
          </>
        )}

        {estado === "tarda" && (
          <>
            <Loader2 className="h-12 w-12 text-amber-500 animate-spin mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Está tardando más de lo normal
            </h1>
            <p className="text-gray-600 text-sm mb-6">
              Tu pago puede estar en camino igual: a veces Mercado Pago
              demora unos minutos en avisar. Puedes seguir trabajando
              tranquilo — apenas llegue, tu plan se activa solo.
            </p>
            <button
              onClick={() => {
                window.location.href = "/dashboard";
              }}
              className="w-full bg-gray-900 text-white font-semibold py-3 px-4 rounded-xl hover:bg-gray-800 transition-colors"
            >
              Ir a mi panel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
