import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Landmark, CalendarDays, Users, MessageCircle } from "lucide-react";
import { apiRequest } from "../../services/api";
import { API_ROUTES } from "../../constants/api.routes";

// PORTAL DEL CLIENTE — Fase 2a (30-07-2026). Página PÚBLICA: el
// cliente llega por su enlace secreto (sin clave) y ve su evento, su
// plan de cuotas, el saldo y los datos para transferir, con la marca
// de la empresa. Misma familia visual que los correos.

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
  evento: {
    numero: number;
    tipo?: string | null;
    fecha?: string | null;
    personas?: number | null;
    estado: string;
    cliente: string;
    contacto?: string | null;
  };
  cuotas: {
    numero: number;
    monto: number;
    vence: string | null;
    estado: string;
    abonado: number;
  }[];
  total: number;
  pagado: number;
  saldo: number;
}

const clp = (n: number) => "$" + Number(n || 0).toLocaleString("es-CL");
const fecha = (d?: string | null) => {
  if (!d) return "—";
  try {
    return new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "—";
  }
};

// Mezcla el color primario con blanco (misma técnica de los correos)
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
};

export default function PortalPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiRequest(`${API_ROUTES.PORTAL}/${token}`, "GET")
      .then((d) => setData(d as PortalData))
      .catch(() => setError(true));
  }, [token]);

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
  const pct = data.total
    ? Math.min(100, Math.round((data.pagado / data.total) * 100))
    : 0;

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow overflow-hidden">
        {/* Franja + cabecera blanca (familia de los correos) */}
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

        <div className="px-6 sm:px-8 py-6 space-y-6">
          {/* Evento */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">
              Tu evento
            </p>
            <p className="text-lg font-bold text-gray-900">
              {data.evento.tipo || "Evento"} · N° {data.evento.numero}
            </p>
            <div className="flex flex-wrap gap-4 mt-1 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <CalendarDays size={15} /> {fecha(data.evento.fecha)}
              </span>
              {data.evento.personas ? (
                <span className="flex items-center gap-1">
                  <Users size={15} /> {data.evento.personas} personas
                </span>
              ) : null}
            </div>
          </div>

          {/* Progreso + saldo */}
          <div
            className="rounded-xl p-5"
            style={{
              background: mix(primary, 0.06),
              border: `1px solid ${mix(primary, 0.22)}`,
            }}
          >
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  Saldo pendiente
                </p>
                <p
                  className="text-3xl font-extrabold"
                  style={{ color: primary }}
                >
                  {clp(data.saldo)}
                </p>
              </div>
              <p className="text-sm text-gray-600">
                pagado {clp(data.pagado)} de {clp(data.total)}
              </p>
            </div>
            <div className="w-full bg-white rounded-full h-2.5 mt-3 border border-gray-200">
              <div
                className="h-2.5 rounded-full"
                style={{ width: `${pct}%`, background: primary }}
              />
            </div>
          </div>

          {/* Cuotas */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
              Plan de pagos
            </p>
            <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
              {data.cuotas.map((c) => (
                <div
                  key={c.numero}
                  className="flex items-center justify-between px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-semibold text-gray-800">
                      Cuota {c.numero} · {clp(c.monto)}
                    </p>
                    <p className="text-gray-500">
                      {c.estado === "pagado"
                        ? "Pagada"
                        : `Vence ${fecha(c.vence)}`}
                      {c.abonado > 0 && c.abonado < c.monto
                        ? ` · abonado ${clp(c.abonado)}`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold ${CHIP[c.estado] || CHIP.pendiente}`}
                  >
                    {c.estado}
                  </span>
                </div>
              ))}
              {data.cuotas.length === 0 && (
                <p className="px-4 py-3 text-sm text-gray-500">
                  Sin cuotas registradas todavía.
                </p>
              )}
            </div>
          </div>

          {/* Datos de cobro */}
          {banco && (banco.numero || banco.banco) && (
            <div
              className="rounded-xl p-5 text-sm text-gray-700"
              style={{
                background: mix(primary, 0.04),
                border: `1px dashed ${mix(primary, 0.35)}`,
              }}
            >
              <p
                className="font-bold mb-1 flex items-center gap-1.5"
                style={{ color: primary }}
              >
                <Landmark size={16} /> Datos para transferir
              </p>
              {[banco.titular, banco.rut ? `RUT ${banco.rut}` : ""]
                .filter(Boolean)
                .join(" · ") && (
                <p>
                  {[banco.titular, banco.rut ? `RUT ${banco.rut}` : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              <p>
                {[banco.banco, banco.tipo_cuenta, banco.numero]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {banco.correo_pagos && <p>{banco.correo_pagos}</p>}
              <p className="text-xs text-gray-500 mt-2">
                Después de transferir, envía tu comprobante a{" "}
                {banco.correo_pagos || "tu contacto de la empresa"}.
              </p>
            </div>
          )}

          <p className="flex items-center gap-1.5 text-sm text-gray-500">
            <MessageCircle size={15} /> ¿Dudas con tu plan? Responde cualquiera
            de nuestros correos y lo conversamos.
          </p>
        </div>

        <div className="border-t border-gray-100 px-6 sm:px-8 py-4 text-xs text-gray-400">
          <b className="text-gray-500">{data.empresa.nombre}</b> · página
          exclusiva para {data.evento.cliente} · impulsado por Eventia
        </div>
      </div>
    </div>
  );
}
