import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Landmark,
  CalendarDays,
  Users,
  MessageCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { api, apiRequest } from "../../services/api";
import { API_ROUTES } from "../../constants/api.routes";
import { NumberInput } from "../../components/inputs";

// PORTAL DEL MANDANTE (30-07-2026, diseño de Felipe). Página PÚBLICA:
// el contacto llega por su enlace secreto y ve TODAS sus cotizaciones
// — y solo las suyas. Misma familia visual que los correos.

interface CuotaPortal {
  id: string;
  numero: number;
  monto: number;
  vence: string | null;
  estado: string;
  abonado: number;
  pagadaEl?: string | null;
  // Fase 2b: hay un comprobante subido esperando confirmación.
  enRevision?: boolean;
}
interface EventoPortal {
  numero: number;
  tipo?: string | null;
  fecha?: string | null;
  personas?: number | null;
  total: number;
  estado: string;
  cuotas?: CuotaPortal[];
  pagado?: number;
  saldo?: number;
}
interface PortalData {
  empresa: {
    nombre: string;
    tagline?: string | null;
    logo_url?: string | null;
    color?: string | null;
    datos_cobro?: {
      titular?: string;
      rut?: string;
      banco?: string;
      tipo_cuenta?: string;
      numero?: string;
      correo_pagos?: string;
    } | null;
  };
  mandante: { nombre: string; clienteEmpresa?: string | null };
  saldoTotal: number;
  confirmados: EventoPortal[];
  enConversacion: EventoPortal[];
  historial: EventoPortal[];
}

const clp = (n: number) => "$" + Number(n || 0).toLocaleString("es-CL");
const fecha = (d?: string | null) => {
  if (!d) return "por definir";
  try {
    return new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "por definir";
  }
};
const mix = (hex: string, w: number): string => {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const c = (i: number) =>
    Math.round(parseInt(h.slice(i, i + 2), 16) * w + 255 * (1 - w))
      .toString(16)
      .padStart(2, "0");
  return `#${c(0)}${c(2)}${c(4)}`;
};

const CHIP: Record<string, string> = {
  pagado: "bg-green-100 text-green-700",
  pendiente: "bg-gray-100 text-gray-600",
  vencido: "bg-amber-100 text-amber-700",
  enviada: "bg-blue-100 text-blue-700",
  en_negociacion: "bg-purple-100 text-purple-700",
  aceptada: "bg-green-100 text-green-700",
  realizada: "bg-emerald-100 text-emerald-700",
};
const ESTADO_LABEL: Record<string, string> = {
  enviada: "enviada",
  en_negociacion: "en conversación",
  aceptada: "confirmado",
  realizada: "realizado",
};

const Seccion = ({ titulo }: { titulo: string }) => (
  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
    {titulo}
  </p>
);

export default function PortalPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState(false);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);
  // Fase 2b — "Ya transferí": formulario por cuota.
  const [compCuotaId, setCompCuotaId] = useState<string | null>(null);
  const [compMonto, setCompMonto] = useState<number | undefined>(undefined);
  const [compMax, setCompMax] = useState<number>(0);
  const [compArchivo, setCompArchivo] = useState<File | null>(null);
  const [compEnviando, setCompEnviando] = useState(false);
  const [compError, setCompError] = useState<string | null>(null);

  const cargar = () => {
    if (!token) return;
    apiRequest(`${API_ROUTES.PORTAL}/${token}`, "GET")
      .then((d) => setData(d as PortalData))
      .catch(() => setError(true));
  };
  useEffect(cargar, [token]);

  const enviarComprobante = async () => {
    if (!token || !compCuotaId || !compArchivo) return;
    const monto = Math.round(compMonto || 0);
    if (!monto || monto <= 0) {
      setCompError("Indica el monto que transferiste");
      return;
    }
    if (compMax > 0 && monto > compMax) {
      setCompError(
        `El monto supera lo pendiente de esta cuota (${clp(compMax)})`,
      );
      return;
    }
    setCompEnviando(true);
    setCompError(null);
    try {
      const form = new FormData();
      form.append("file", compArchivo);
      form.append("payment_id", compCuotaId);
      form.append("declared_amount", String(monto));
      await api.request({
        url: `${API_ROUTES.PORTAL}/${token}/comprobante`,
        method: "POST",
        data: form,
        headers: { "Content-Type": undefined },
      });
      setCompCuotaId(null);
      setCompArchivo(null);
      setCompMonto(undefined);
      cargar();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      setCompError(msg || "No se pudo enviar. Inténtalo de nuevo.");
    } finally {
      setCompEnviando(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow p-8 max-w-md text-center">
          <p className="text-lg font-bold text-gray-800 mb-2">
            Este enlace no es válido
          </p>
          <p className="text-sm text-gray-500">
            Puede haber cambiado o expirado. Contacta a tu empresa de eventos
            para pedir uno nuevo.
          </p>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-400" />
      </div>
    );
  }

  const primary = data.empresa.color || "#134686";
  const banco = data.empresa.datos_cobro;
  const tieneBanco = !!(banco && (banco.numero || banco.banco));

  const datosCobro = tieneBanco && (
    <div
      className="rounded-xl p-4 text-sm text-gray-700 mt-3"
      style={{
        background: mix(primary, 0.04),
        border: `1px dashed ${mix(primary, 0.35)}`,
      }}
    >
      <p
        className="font-bold mb-1 flex items-center gap-1.5"
        style={{ color: primary }}
      >
        <Landmark size={15} /> Datos para transferir
      </p>
      <p>
        {[banco!.titular, banco!.rut ? `RUT ${banco!.rut}` : ""]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <p>
        {[banco!.banco, banco!.tipo_cuenta, banco!.numero]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {banco!.correo_pagos && <p>{banco!.correo_pagos}</p>}
    </div>
  );

  const cardEvento = (
    ev: EventoPortal,
    expandible: boolean,
    compacta = false,
  ) => {
    const abiertoEste = abierto === ev.numero;
    // Historial de UNA cuota: el plan repetiría el mismo monto — la
    // fecha de pago va en la línea y el desplegable desaparece.
    const unaCuotaSaldada =
      compacta && (ev.cuotas || []).length === 1;
    if (unaCuotaSaldada) expandible = false;
    const togglePlan = expandible && (
      <button
        onClick={() => setAbierto(abiertoEste ? null : ev.numero)}
        className="text-sm font-semibold flex items-center gap-1"
        style={{ color: primary }}
      >
        {abiertoEste ? "Ocultar plan" : "Ver plan de pagos"}
        {abiertoEste ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
    );
    return (
      <div
        key={ev.numero}
        className="border border-gray-200 shadow-sm rounded-xl overflow-hidden bg-white"
        style={
          // Riel de color: los eventos VIVOS llevan el color de la
          // empresa al costado; el historial descansa sin riel.
          compacta ? undefined : { borderLeft: `4px solid ${primary}` }
        }
      >
        <div className="px-4 py-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="font-bold text-gray-900">
                {ev.tipo || "Evento"} · N° {ev.numero}
              </p>
              <p className="text-sm text-gray-500 flex flex-wrap gap-3 mt-0.5">
                <span className="flex items-center gap-1">
                  <CalendarDays size={14} /> {fecha(ev.fecha)}
                </span>
                {ev.personas ? (
                  <span className="flex items-center gap-1">
                    <Users size={14} /> {ev.personas} personas
                  </span>
                ) : null}
              </p>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-bold ${CHIP[ev.estado] || CHIP.pendiente}`}
            >
              {ESTADO_LABEL[ev.estado] || ev.estado}
            </span>
          </div>

          {typeof ev.saldo === "number" ? (
            compacta ? (
              // Historial: saldado y compacto — sin barra ni redundancia.
              <div className="mt-2 flex items-baseline justify-between flex-wrap gap-2">
                <p className="text-sm">
                  <b className="text-green-700">Pagado {clp(ev.total)} ✓</b>
                  {unaCuotaSaldada && ev.cuotas?.[0]?.pagadaEl && (
                    <span className="text-gray-500 font-normal">
                      {" "}
                      · {fecha(ev.cuotas[0].pagadaEl)}
                    </span>
                  )}
                </p>
                {togglePlan}
              </div>
            ) : (
              <div className="mt-3">
                <div className="flex items-baseline justify-between flex-wrap gap-2">
                  <p className="text-sm text-gray-600">
                    {ev.saldo > 0 ? (
                      <>
                        saldo{" "}
                        <b style={{ color: primary }}>{clp(ev.saldo)}</b> de{" "}
                        {clp(ev.total)}
                      </>
                    ) : (
                      <b className="text-green-700">Totalmente pagado ✓</b>
                    )}
                  </p>
                  {togglePlan}
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${ev.total ? Math.min(100, Math.round(((ev.pagado || 0) / ev.total) * 100)) : 0}%`,
                      background: primary,
                    }}
                  />
                </div>
              </div>
            )
          ) : (
            <p className="mt-2 text-sm text-gray-600">
              valor cotizado: <b>{clp(ev.total)}</b>
            </p>
          )}
        </div>

        {expandible && abiertoEste && (
          <div
            className="px-4 py-3"
            style={{
              background: mix(primary, 0.035),
              borderTop: `2px solid ${mix(primary, 0.2)}`,
            }}
          >
            {(ev.cuotas || []).map((c) => (
              <div key={c.numero} className="py-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-gray-700">
                    Cuota {c.numero} · <b>{clp(c.monto)}</b>
                    {c.abonado > 0 && c.abonado < c.monto
                      ? ` · abonado ${clp(c.abonado)}`
                      : ""}
                  </span>
                  {/* UNA sola señal por cuota: el chip lo dice todo. */}
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                      c.enRevision && c.estado !== "pagado"
                        ? "bg-blue-100 text-blue-700"
                        : CHIP[c.estado] || CHIP.pendiente
                    }`}
                  >
                    {c.estado === "pagado"
                      ? `pagada${c.pagadaEl ? ` · ${fecha(c.pagadaEl)}` : ""}`
                      : c.enRevision
                        ? "comprobante en revisión"
                        : c.estado === "vencido"
                          ? `vencida · ${fecha(c.vence)}`
                          : `vence ${fecha(c.vence)}`}
                  </span>
                </div>
                {/* Fase 2b: "Ya transferí" en cuotas sin pagar. */}
                {c.estado !== "pagado" && !c.enRevision && (
                  <div className="mt-1.5">
                    {compCuotaId === c.id ? (
                      <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                        <p className="text-xs font-bold text-gray-600">
                          Envíanos tu comprobante y lo confirmamos
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex-1 min-w-36">
                            <NumberInput
                              value={compMonto}
                              onChange={(v) => setCompMonto(v)}
                              currency
                              min={1}
                              max={compMax || undefined}
                              placeholder="Monto transferido"
                              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                            />
                          </div>
                          <label
                            className="px-3 py-1.5 text-sm font-semibold rounded-lg cursor-pointer border"
                            style={{
                              color: primary,
                              borderColor: mix(primary, 0.4),
                              background: mix(primary, 0.06),
                            }}
                          >
                            Adjuntar comprobante
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              className="hidden"
                              onChange={(e) =>
                                setCompArchivo(e.target.files?.[0] || null)
                              }
                            />
                          </label>
                        </div>
                        {/* El nombre del archivo va ABAJO, azulito, a la
                            usanza de los sistemas (pedido de Felipe). */}
                        {compArchivo && (
                          <p className="text-xs text-blue-600 truncate">
                            {compArchivo.name}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <button
                            disabled={compEnviando || !compArchivo}
                            onClick={enviarComprobante}
                            className="px-3 py-1.5 text-white text-xs rounded-lg font-semibold disabled:opacity-50"
                            style={{ background: primary }}
                          >
                            {compEnviando ? "Enviando…" : "Enviar comprobante"}
                          </button>
                          <button
                            onClick={() => {
                              setCompCuotaId(null);
                              setCompError(null);
                            }}
                            className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg font-semibold"
                          >
                            Cancelar
                          </button>
                        </div>
                        {compError && (
                          <p className="text-xs text-red-600">{compError}</p>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setCompCuotaId(c.id);
                          setCompMonto(c.monto - c.abonado);
                          setCompMax(c.monto - c.abonado);
                          setCompArchivo(null);
                          setCompError(null);
                        }}
                        className="text-xs font-semibold underline"
                        style={{ color: primary }}
                      >
                        Ya transferí — enviar mi comprobante
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {datosCobro}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow overflow-hidden">
        <div style={{ background: primary, height: 6 }} />
        <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-gray-100">
          <div>
            <p className="text-xl font-extrabold" style={{ color: primary }}>
              {data.empresa.nombre}
            </p>
            {data.empresa.tagline && (
              <p className="text-sm text-gray-500">{data.empresa.tagline}</p>
            )}
          </div>
          {data.empresa.logo_url && (
            <img
              src={data.empresa.logo_url}
              alt=""
              className="h-14 max-w-[140px] object-contain"
            />
          )}
        </div>

        <div className="px-6 sm:px-8 py-6 space-y-7">
          {/* El mandante: de quién es este portal */}
          <div>
            <p className="text-lg font-bold text-gray-900">
              Portal de {data.mandante.nombre}
            </p>
            {data.mandante.clienteEmpresa &&
              data.mandante.clienteEmpresa !== data.mandante.nombre && (
                <p className="text-sm text-gray-500">
                  {data.mandante.clienteEmpresa}
                </p>
              )}
          </div>

          {/* Saldo total, si hay deuda */}
          {data.saldoTotal > 0 && (
            <div
              className="rounded-xl p-5"
              style={{
                background: mix(primary, 0.06),
                border: `1px solid ${mix(primary, 0.22)}`,
              }}
            >
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Saldo pendiente total
              </p>
              <p className="text-3xl font-extrabold" style={{ color: primary }}>
                {clp(data.saldoTotal)}
              </p>
            </div>
          )}

          {data.confirmados.length > 0 && (
            <div>
              <Seccion titulo="Tus eventos confirmados" />
              <div className="space-y-3">
                {data.confirmados.map((ev) => cardEvento(ev, true))}
              </div>
            </div>
          )}

          {data.enConversacion.length > 0 && (
            <div>
              <Seccion titulo="Cotizaciones en conversación" />
              <div className="space-y-3">
                {data.enConversacion.map((ev) => cardEvento(ev, false))}
              </div>
              <p className="text-sm text-gray-500 mt-2 flex items-center gap-1.5">
                <MessageCircle size={14} /> ¿Quieres ajustar algo? Responde
                nuestro correo y lo conversamos.
              </p>
            </div>
          )}

          {data.confirmados.length === 0 &&
            data.enConversacion.length === 0 &&
            data.historial.length === 0 && (
              <p className="text-sm text-gray-500">
                Aún no tienes cotizaciones activas con nosotros.
              </p>
            )}

          {data.historial.length > 0 && (
            <div>
              <button
                onClick={() => setVerHistorial((v) => !v)}
                className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1 hover:text-gray-600"
              >
                Historial ({data.historial.length})
                {verHistorial ? (
                  <ChevronUp size={13} />
                ) : (
                  <ChevronDown size={13} />
                )}
              </button>
              {verHistorial && (
                <div className="space-y-3 mt-2">
                  {data.historial.map((ev) => cardEvento(ev, true, true))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 px-6 sm:px-8 py-4 text-xs text-gray-400">
          <b className="text-gray-500">{data.empresa.nombre}</b> · página
          exclusiva de {data.mandante.nombre} · impulsado por Eventia
        </div>
      </div>
    </div>
  );
}
