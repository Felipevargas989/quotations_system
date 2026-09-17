import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CreditCard } from "lucide-react";
import { Link } from "react-router-dom";
import { NOMBRE_DEL_PLAN } from "../../constants/permissions";
import { useAuth } from "../../contexts/AuthContext";
import { estadoDelPlan } from "../../services/pagos.service";

// LA PESTAÑA DEL PLAN (18-09-2026, sprint "Mi cuenta / Mi empresa").
//
// Muestra la verdad de la BASE (no la memoria de la sesión): qué plan
// tiene la empresa, en qué estado y hasta cuándo corre. El botón lleva
// a /plans, donde se contrata. Subir con proporcional y bajar
// agendado es el sprint siguiente (pedido por Felipe el 17-09) — esta
// pestaña es su casa futura.

const ESTADOS: Record<
  string,
  { texto: string; clase: string; detalle: string }
> = {
  prueba: {
    texto: "En prueba",
    clase: "bg-blue-100 text-blue-800",
    detalle: "Estás probando todo Eventia gratis.",
  },
  activo: {
    texto: "Activo",
    clase: "bg-green-100 text-green-800",
    detalle: "Tu plan se paga solo, mes a mes, con Mercado Pago.",
  },
  gratis: {
    texto: "Cortesía",
    clase: "bg-purple-100 text-purple-800",
    detalle: "Tu cuenta es una cortesía de la casa: no paga.",
  },
  moroso: {
    texto: "Pago pendiente",
    clase: "bg-amber-100 text-amber-800",
    detalle:
      "El último cobro no pasó. Revisa tu tarjeta en Mercado Pago: tienes unos días de gracia.",
  },
  bloqueado: {
    texto: "Pausada",
    clase: "bg-red-100 text-red-800",
    detalle:
      "La cuenta está pausada. Tus datos siguen guardados: contrata un plan para volver a entrar.",
  },
};

const fechaLarga = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("es-CL", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "America/Santiago",
      })
    : null;

export default function PestanaPlan() {
  const { company } = useAuth();
  const estadoQuery = useQuery({
    queryKey: ["pagos", "estado"],
    queryFn: estadoDelPlan,
  });

  const plan = estadoQuery.data?.plan ?? company?.plan ?? null;
  const estado = estadoQuery.data?.estado_plan ?? company?.estado_plan ?? null;
  const pagadoHasta = fechaLarga(estadoQuery.data?.pagado_hasta);
  const pruebaVence = fechaLarga(company?.prueba_vence);
  const infoEstado = (estado && ESTADOS[estado]) || null;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Tu plan</h2>
        <p className="text-sm text-gray-600 mt-1">
          Lo que tu empresa tiene contratado en Eventia
        </p>
      </div>
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="bg-blue-100 p-2 rounded-lg">
            <CreditCard className="h-6 w-6 text-blue-600" />
          </div>
          <span className="text-2xl font-bold text-gray-900">
            {plan && NOMBRE_DEL_PLAN[plan as keyof typeof NOMBRE_DEL_PLAN]
              ? NOMBRE_DEL_PLAN[plan as keyof typeof NOMBRE_DEL_PLAN]
              : "Sin plan"}
          </span>
          {infoEstado && (
            <span
              className={`text-xs font-semibold px-3 py-1 rounded-full ${infoEstado.clase}`}
            >
              {infoEstado.texto}
            </span>
          )}
        </div>

        {infoEstado && (
          <p className="text-sm text-gray-600">{infoEstado.detalle}</p>
        )}

        {estado === "prueba" && pruebaVence && (
          <p className="text-sm text-gray-700">
            Tu prueba gratis termina el <strong>{pruebaVence}</strong>.
          </p>
        )}
        {estado === "activo" && pagadoHasta && (
          <p className="text-sm text-gray-700">
            Pagado hasta el <strong>{pagadoHasta}</strong>. El próximo cobro
            es automático.
          </p>
        )}

        {estado !== "gratis" && (
          <Link
            to="/plans"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            Ver los planes{" "}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
