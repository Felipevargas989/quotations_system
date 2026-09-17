import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CreditCard,
  Loader2,
} from "lucide-react";
import { Link } from "react-router-dom";
import ConfirmInline from "../../components/ConfirmInline";
import Modal from "../../components/Modal";
import { toast } from "../../components/toast/Toast";
import { NOMBRE_DEL_PLAN } from "../../constants/permissions";
import { useAuth } from "../../contexts/AuthContext";
import {
  cambiarPlan,
  cancelarPlan,
  cotizarCambio,
  CotizacionDeCambio,
  estadoDelPlan,
  PlanContratable,
} from "../../services/pagos.service";
import { humanizeApiError } from "../../utils/apiErrors";

// LA PESTAÑA DEL PLAN (18-09-2026, sprint "Mi cuenta / Mi empresa").
//
// Muestra la verdad de la BASE (no la memoria de la sesión): qué plan
// tiene la empresa, en qué estado y hasta cuándo corre.
//
// Y desde el mismo día, el CAMBIO DE PLAN (decisión de Felipe del
// 17-09, el estándar de la industria):
//   SUBIR  → se cobra hoy el proporcional de la diferencia por los
//            días que quedan del mes pagado, y rige al instante.
//   BAJAR  → rige cuando termine el mes ya pagado; nada se borra.
// Siempre en dos tiempos: primero se muestra el cálculo y recién con
// la confirmación se cambia. Solo para empresas que pagan por Mercado
// Pago; las demás ven el botón a /plans o el WhatsApp.

const ORDEN: PlanContratable[] = ["cotiza", "gestiona", "crece"];

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

const pesos = (n: number) => `$${n.toLocaleString("es-CL")}`;

const nombre = (plan: string | null | undefined) =>
  plan && NOMBRE_DEL_PLAN[plan as keyof typeof NOMBRE_DEL_PLAN]
    ? NOMBRE_DEL_PLAN[plan as keyof typeof NOMBRE_DEL_PLAN]
    : "Sin plan";

export default function PestanaPlan() {
  const { company, user } = useAuth();
  const qc = useQueryClient();
  const estadoQuery = useQuery({
    queryKey: ["pagos", "estado"],
    queryFn: estadoDelPlan,
  });

  const plan = estadoQuery.data?.plan ?? company?.plan ?? null;
  const estado = estadoQuery.data?.estado_plan ?? company?.estado_plan ?? null;
  const pagadoHasta = fechaLarga(estadoQuery.data?.pagado_hasta);
  const pruebaVence = fechaLarga(company?.prueba_vence);
  const bajadaAgendada = estadoQuery.data?.plan_programado ?? null;
  const infoEstado = (estado && ESTADOS[estado]) || null;
  const cancelada = estadoQuery.data?.cancelada === true;
  const suscripcionViva = estadoQuery.data?.suscripcion_viva === true;
  const puedeCambiar =
    estado === "activo" &&
    estadoQuery.data?.pago_proveedor === "mercadopago" &&
    !cancelada;
  // "Cancelar mi plan" (18-09, términos §9): por el mismo medio por el
  // que se contrató. Solo con una suscripción viva y ya cobrando; en
  // prueba no hay nada que cancelar, la prueba simplemente termina.
  const puedeCancelar =
    suscripcionViva && (estado === "activo" || estado === "moroso");

  // El cambio de plan en dos tiempos.
  const [cotizacion, setCotizacion] = useState<CotizacionDeCambio | null>(null);
  const [cotizando, setCotizando] = useState<PlanContratable | null>(null);
  const [correoMp, setCorreoMp] = useState("");
  const [cambiando, setCambiando] = useState(false);
  const [preguntandoCancelar, setPreguntandoCancelar] = useState(false);
  const [cancelandoPlan, setCancelandoPlan] = useState(false);
  // Cancelar manda siempre (Felipe, 18-09): cerrar a media preparación
  // y que el enlace tardío se ignore.
  const cancelado = useRef(false);

  // Al volver con el botón de atrás desde el pago del proporcional, la
  // página revive congelada con "Un momento…" puesto (mismo caso que
  // Plans, 18-09): pageshow con `persisted` la despierta limpia.
  useEffect(() => {
    const despertar = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setCambiando(false);
        setCotizacion(null);
        setCotizando(null);
      }
    };
    window.addEventListener("pageshow", despertar);
    return () => window.removeEventListener("pageshow", despertar);
  }, []);

  const cancelar = () => {
    cancelado.current = true;
    setCambiando(false);
    setCotizacion(null);
  };

  const pedirCotizacion = async (planNuevo: PlanContratable) => {
    cancelado.current = false;
    setCotizando(planNuevo);
    try {
      const c = await cotizarCambio(planNuevo);
      setCorreoMp(user?.email ?? "");
      setCotizacion(c);
    } catch (error) {
      toast.error(humanizeApiError(error));
    } finally {
      setCotizando(null);
    }
  };

  const confirmar = async () => {
    if (!cotizacion || cambiando) return;
    const correo = correoMp.trim();
    if (cotizacion.modo === "subir" && cotizacion.proporcional > 0) {
      if (!correo.includes("@")) {
        toast.warn("Escribe el correo de tu cuenta de Mercado Pago");
        return;
      }
    }
    setCambiando(true);
    try {
      const r = await cambiarPlan(cotizacion.plan_nuevo, correo || undefined);
      if (cancelado.current) return;
      if (r.modo === "subir" && r.enlace) {
        // A pagar el proporcional; vuelve a /plans/confirmation?plan=…
        window.location.assign(r.enlace);
        return;
      }
      if (r.modo === "subir") {
        toast.success(`Listo: ya estás en ${nombre(cotizacion.plan_nuevo)}.`);
      } else {
        toast.success(
          `Agendado: bajas a ${nombre(cotizacion.plan_nuevo)} el ${fechaLarga(r.rige_desde) ?? "fin de tu mes pagado"}.`,
        );
      }
      setCotizacion(null);
      await qc.invalidateQueries({ queryKey: ["pagos", "estado"] });
    } catch (error) {
      if (!cancelado.current) toast.error(humanizeApiError(error));
    } finally {
      setCambiando(false);
    }
  };

  const cancelarPlanDeVerdad = async () => {
    setCancelandoPlan(true);
    try {
      const r = await cancelarPlan();
      toast.success(
        r.sigue_hasta
          ? `Plan cancelado. Sigues con todo hasta el ${fechaLarga(r.sigue_hasta)}; no se cobra el mes siguiente.`
          : "Plan cancelado: no se cobra el mes siguiente.",
      );
      setPreguntandoCancelar(false);
      await qc.invalidateQueries({ queryKey: ["pagos", "estado"] });
    } catch (error) {
      toast.error(humanizeApiError(error));
    } finally {
      setCancelandoPlan(false);
    }
  };

  const otrosPlanes = ORDEN.filter((p) => p !== plan);
  const posicion = (p: string | null) => ORDEN.indexOf(p as PlanContratable);

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
            {nombre(plan)}
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
        {estado === "activo" && pagadoHasta && !cancelada && (
          <p className="text-sm text-gray-700">
            Pagado hasta el <strong>{pagadoHasta}</strong>. El próximo cobro es
            automático.
          </p>
        )}
        {cancelada && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Cancelaste tu plan: sigues con todo lo de{" "}
            <strong>{nombre(plan)}</strong>
            {pagadoHasta
              ? ` hasta el ${pagadoHasta}`
              : " hasta el fin de tu mes pagado"}
            . No se cobrará el mes siguiente y nada se borra.
          </p>
        )}
        {bajadaAgendada && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Tienes agendada la bajada a{" "}
            <strong>{nombre(bajadaAgendada)}</strong>
            {pagadoHasta ? ` para el ${pagadoHasta}` : ""}: hasta entonces
            sigues con todo lo de {nombre(plan)}.
          </p>
        )}

        {puedeCambiar && !bajadaAgendada && (
          <div className="pt-2">
            <p className="text-sm font-medium text-gray-700 mb-2">
              Cambiar de plan
            </p>
            <div className="flex flex-wrap gap-2">
              {otrosPlanes.map((p) => {
                const sube = posicion(p) > posicion(plan);
                return (
                  <button
                    key={p}
                    onClick={() => void pedirCotizacion(p)}
                    disabled={cotizando !== null}
                    className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 ${
                      sube
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {cotizando === p ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : sube ? (
                      <ArrowUp className="h-4 w-4" />
                    ) : (
                      <ArrowDown className="h-4 w-4" />
                    )}
                    {sube ? "Subir a" : "Bajar a"} {nombre(p)}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Subir rige al instante (pagas solo los días que faltan del mes);
              bajar rige cuando termine tu mes ya pagado.
            </p>
          </div>
        )}

        {puedeCancelar && (
          <div className="pt-4 border-t border-gray-100">
            {preguntandoCancelar ? (
              <ConfirmInline
                question={`¿Cancelar tu plan? Sigues con todo${
                  pagadoHasta
                    ? ` hasta el ${pagadoHasta}`
                    : " hasta el fin de tu mes pagado"
                } y no se cobra el mes siguiente. Nada se borra.`}
                yesLabel="Sí, cancelar mi plan"
                onYes={() => void cancelarPlanDeVerdad()}
                onNo={() => setPreguntandoCancelar(false)}
                busy={cancelandoPlan}
              />
            ) : (
              <button
                type="button"
                onClick={() => setPreguntandoCancelar(true)}
                className="text-sm text-gray-500 hover:text-red-600 underline underline-offset-2"
              >
                Cancelar mi plan
              </button>
            )}
          </div>
        )}

        {estado !== "gratis" && !puedeCambiar && (
          <Link
            to="/plans"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            Ver los planes <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      {cotizacion && (
        <Modal
          titulo={`${cotizacion.modo === "subir" ? "Subir a" : "Bajar a"} ${nombre(cotizacion.plan_nuevo)}`}
          subtitulo="Revisa antes de confirmar"
          ancho="max-w-md"
          onCerrar={cancelar}
          pie={
            <div className="flex justify-end gap-3">
              <button
                onClick={cancelar}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
              >
                Cancelar
              </button>
              <button
                onClick={() => void confirmar()}
                disabled={cambiando}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
              >
                {cambiando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Un momento…
                  </>
                ) : cotizacion.modo === "subir" &&
                  cotizacion.proporcional > 0 ? (
                  `Pagar ${pesos(cotizacion.proporcional)} y subir`
                ) : cotizacion.modo === "subir" ? (
                  "Subir ahora"
                ) : (
                  "Confirmar bajada"
                )}
              </button>
            </div>
          }
        >
          <div className="space-y-3 text-sm text-gray-700">
            {cotizacion.modo === "subir" ? (
              <>
                <p>
                  Pasas de <strong>{nombre(cotizacion.plan_actual)}</strong> (
                  {pesos(cotizacion.precio_actual)}/mes) a{" "}
                  <strong>{nombre(cotizacion.plan_nuevo)}</strong> (
                  {pesos(cotizacion.precio_nuevo)}/mes).
                </p>
                {cotizacion.proporcional > 0 ? (
                  <p className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    Hoy pagas <strong>{pesos(cotizacion.proporcional)}</strong>:
                    la diferencia por los{" "}
                    <strong>{cotizacion.dias_restantes} días</strong> que faltan
                    de tu mes ya pagado. El plan nuevo rige al instante y desde
                    el próximo cobro pagas {pesos(cotizacion.precio_nuevo)} al
                    mes.
                  </p>
                ) : (
                  <p className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    Tu mes está por renovarse: no hay nada que cobrar hoy. El
                    plan nuevo rige al instante y el próximo cobro sale con{" "}
                    {pesos(cotizacion.precio_nuevo)}.
                  </p>
                )}
                {cotizacion.proporcional > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ¿Con qué correo entras a Mercado Pago?
                    </label>
                    <input
                      type="email"
                      value={correoMp}
                      onChange={(e) => setCorreoMp(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <p>
                  Sigues con <strong>{nombre(cotizacion.plan_actual)}</strong>{" "}
                  hasta el{" "}
                  <strong>
                    {fechaLarga(cotizacion.rige_desde) ??
                      "fin de tu mes pagado"}
                  </strong>
                  , que ya está pagado.
                </p>
                <p className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  Desde entonces pasas a{" "}
                  <strong>{nombre(cotizacion.plan_nuevo)}</strong> y pagas{" "}
                  {pesos(cotizacion.precio_nuevo)} al mes. Nada se borra: lo que
                  quede fuera del plan se guarda por si vuelves a subir.
                </p>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
