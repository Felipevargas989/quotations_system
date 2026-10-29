import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import type {
  MunicipioDelRadar,
  SenalesDelMunicipio,
} from "../../services/radarMunicipal.service";
import {
  type EjemplosDeSenal,
  millones,
  type Senal,
  SENALES,
  senalesActivas,
  urlMercadoPublico,
  ventanaEnPalabras,
} from "./radarMunicipal.utils";

// TRANSPARENCIA, en el radar municipal (decisión 108, solo en el
// laboratorio). Las señales de riesgo del informe que trajo Felipe,
// calculadas en los últimos 12 meses: cada municipio con cuántas tiene y
// cuáles; al abrirlo, qué vio el radar y sus ejemplos con enlace a Mercado
// Público. El informe insiste: muchas señales juntas importan más que una
// sola, y una persona revisa antes de cualquier denuncia.

const colorDelConteo = (n: number) =>
  n >= 3
    ? "bg-rose-100 text-rose-800"
    : n >= 1
      ? "bg-amber-100 text-amber-800"
      : "bg-gray-100 text-gray-500";

export default function SenalesDelRadar({
  municipios,
  desde,
  hasta,
}: {
  readonly municipios: MunicipioDelRadar[];
  readonly desde: string | null;
  readonly hasta: string | null;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const ordenados = [...municipios].sort(
    (a, b) =>
      (b.senales?.senales ?? 0) - (a.senales?.senales ?? 0) ||
      (b.total ?? 0) - (a.total ?? 0),
  );
  const conSenales = ordenados.filter((m) => (m.senales?.senales ?? 0) > 0);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Una señal no es una acusación: muestra dónde mirar. Antes de cualquier
        denuncia, una persona revisa los documentos. Últimos 12 meses:{" "}
        {ventanaEnPalabras(desde, hasta)}.
      </div>
      <p className="text-sm text-gray-600">
        {conSenales.length} de {municipios.length} municipios tienen al menos
        una de las {SENALES.length} señales.
      </p>
      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {ordenados.map((m) => {
          const activas = senalesActivas(m.senales);
          const n = m.senales?.senales ?? 0;
          const estaAbierto = abierto === m.organismo_codigo;
          return (
            <div key={m.organismo_codigo}>
              <button
                type="button"
                onClick={() =>
                  setAbierto(estaAbierto ? null : m.organismo_codigo)
                }
                aria-expanded={estaAbierto}
                disabled={n === 0}
                className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-gray-50 disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span className="mt-0.5 text-gray-400">
                  {n === 0 ? (
                    <span className="inline-block w-4" />
                  ) : estaAbierto ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-gray-900">
                    {m.comuna ?? m.nombre}
                  </span>
                  {activas.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {activas.map((s) => (
                        <span
                          key={s.clave}
                          className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200"
                        >
                          {s.titulo}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${colorDelConteo(n)}`}
                >
                  {n === 0 ? "Sin señales" : `${n} de ${SENALES.length}`}
                </span>
              </button>
              {estaAbierto && m.senales && (
                <Detalle
                  senales={m.senales}
                  activas={activas}
                  proveedorMayor={m.proveedor_mayor_nombre}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Detalle({
  senales,
  activas,
  proveedorMayor,
}: {
  readonly senales: SenalesDelMunicipio;
  readonly activas: Senal[];
  readonly proveedorMayor: string | null;
}) {
  return (
    <div className="space-y-3 bg-gray-50 px-10 py-3">
      <p className="text-xs text-gray-500">
        En 12 meses compró {millones(senales.gasto_total)} en {senales.ordenes}{" "}
        órdenes de compra.
      </p>
      {activas.map((s) => (
        <div key={s.clave} className="space-y-1">
          <p className="text-sm font-semibold text-gray-900">{s.titulo}</p>
          <p className="text-sm text-gray-700">
            {s.explicar(senales, proveedorMayor)}
          </p>
          <Ejemplos ejemplos={s.ejemplos?.(senales) ?? null} />
          <p className="text-xs text-gray-400">{s.fuente}</p>
        </div>
      ))}
    </div>
  );
}

function Ejemplos({ ejemplos }: { readonly ejemplos: EjemplosDeSenal | null }) {
  if (!ejemplos) return null;
  if (ejemplos.tipo === "licitaciones") {
    return (
      <p className="flex flex-wrap gap-2 text-xs">
        {ejemplos.codigos.map((codigo) => (
          <a
            key={codigo}
            href={urlMercadoPublico(codigo, "licitacion")}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-blue-700 hover:underline"
          >
            {codigo}
            <ExternalLink size={12} />
          </a>
        ))}
      </p>
    );
  }
  return (
    <ul className="space-y-0.5 text-xs text-gray-700">
      {ejemplos.proveedores.map((p) => (
        <li key={`${p.rut}-${p.dia ?? ""}`}>
          {p.proveedor ?? p.rut}: {p.ordenes} órdenes por {millones(p.monto)}
          {p.dia ? `, el ${p.dia.split("-").reverse().join("-")}` : ""}
          {p.utm ? ` (${p.utm} UTM)` : ""}
        </li>
      ))}
    </ul>
  );
}
