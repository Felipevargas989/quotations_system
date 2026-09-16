import { ArrowRight, Check, Sparkles } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { NOMBRE_DEL_PLAN } from "../../constants/permissions";

// LA PANTALLA DE PLANES (reescrita el 16-09-2026, paso 4 del roadmap).
//
// La versión anterior mostraba UN plan de $10.000 que contradecía a la
// landing y a la tabla de derechos: quedó de una época con precio único.
// Ahora muestra los tres planes firmados el 14-09, con los mismos textos
// y precios que publica la landing (netos, más IVA), y marca cuál tiene
// contratado la empresa.
//
// El botón de contratar, POR AHORA, abre WhatsApp con el plan y la
// empresa ya escritos: el cobro automático con Mercado Pago es el sprint
// B de PLAN_VENTA_AUTOMATICA.md, y mientras no exista, lo honesto es que
// contratar sea una conversación con Felipe y no un enlace que no sabe
// quién pagó. Cuando llegue el sprint B, este botón pasa a pedir la
// suscripción propia de la empresa.

type PlanId = "cotiza" | "gestiona" | "crece";

const PLANES: Array<{
  id: PlanId;
  nombre: string;
  para: string;
  precio: string;
  limites: string;
  incluye: string[];
  destacado?: boolean;
}> = [
  {
    id: "cotiza",
    nombre: "Cotiza",
    para: "Para dejar el Excel y vender profesional.",
    precio: "$19.900",
    limites: "Hasta 20 cotizaciones/mes · 1 usuario · eventos de un día",
    incluye: [
      "Cotizador con tu marca y PDF",
      "Catálogo de servicios y precios",
      "Formulario público de solicitud y hoja de cotización en línea",
      "Panel comercial",
    ],
  },
  {
    id: "gestiona",
    nombre: "Gestiona y Cobra",
    para: "Para el que ya vende y necesita cobrar sin perder cuentas.",
    precio: "$49.900",
    limites: "Cotizaciones ilimitadas · 3 usuarios",
    incluye: [
      "Todo lo de Cotiza",
      "Eventos de varios días",
      "Pagos, saldos y semáforo de cobranza",
      "Portal del cliente: saldo y comprobantes",
      "Calendario de eventos",
      "Clientes 360° y múltiples contactos",
      "Panel comercial + de caja",
    ],
    destacado: true,
  },
  {
    id: "crece",
    nombre: "Opera y Crece",
    para: "Para la operación que quiere márgenes y controlarlo todo.",
    precio: "$119.900",
    limites: "Todo ilimitado · equipo completo",
    incluye: [
      "Todo lo de Gestiona y Cobra",
      "Logística: compras, insumos, mobiliario",
      "Recetas, costos y ficha de cocina",
      "Márgenes por evento y por mes",
      "Consultas con brochure automático",
      "Correos automáticos y encuestas",
      "App móvil de terreno",
    ],
  },
];

export default function Plans() {
  const { company } = useAuth();
  const planActual = (company?.plan ?? null) as PlanId | null;
  const enPrueba = company?.estado_plan === "prueba";

  const contratar = (plan: (typeof PLANES)[number]) => {
    const texto = encodeURIComponent(
      `Hola, quiero contratar el plan ${plan.nombre} de Eventia para ${
        company?.name ?? "mi empresa"
      }.`,
    );
    window.open(
      `https://wa.me/56940589151?text=${texto}`,
      "_blank",
      "noopener",
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Los planes de Eventia
          </h1>
          <p className="text-gray-600">
            {enPrueba
              ? "Estás probando todo Eventia gratis. Elige tu plan y sigue sin cortes."
              : "Cambia de plan cuando quieras: tus datos siempre se conservan."}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {PLANES.map((plan) => {
            const esElActual = !enPrueba && planActual === plan.id;
            return (
              <div
                key={plan.id}
                className={`relative bg-white rounded-2xl border p-6 flex flex-col ${
                  plan.destacado
                    ? "border-blue-500 shadow-xl"
                    : "border-gray-200 shadow"
                }`}
              >
                {plan.destacado && !esElActual && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Más popular
                  </span>
                )}
                {esElActual && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-600 text-white text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Tu plan actual
                  </span>
                )}

                <h2 className="text-xl font-bold text-gray-900">
                  {plan.nombre}
                </h2>
                <p className="text-sm text-gray-500 mt-1">{plan.para}</p>

                <div className="mt-4">
                  <span className="text-4xl font-bold text-gray-900">
                    {plan.precio}
                  </span>
                  <span className="text-gray-500 text-sm"> + IVA / mes</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{plan.limites}</p>

                <ul className="mt-5 space-y-2 flex-1">
                  {plan.incluye.map((linea) => (
                    <li key={linea} className="flex items-start text-sm">
                      <Check className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700">{linea}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => contratar(plan)}
                  disabled={esElActual}
                  className={`mt-6 w-full font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center group ${
                    esElActual
                      ? "bg-gray-100 text-gray-400 cursor-default"
                      : plan.destacado
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : "bg-gray-900 text-white hover:bg-gray-800"
                  }`}
                >
                  {esElActual ? (
                    "Este es tu plan"
                  ) : (
                    <>
                      <span className="mr-2">
                        Contratar {NOMBRE_DEL_PLAN[plan.id]}
                      </span>
                      <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <p className="text-center text-sm text-gray-500 mt-8">
          Precios en pesos chilenos, netos, más IVA. Se paga mes a mes con
          Mercado Pago. Bajar de plan no borra nada: lo que quede fuera se
          guarda por si vuelves a subir.
        </p>
      </div>
    </div>
  );
}
