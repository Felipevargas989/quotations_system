import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Save, SmilePlus } from "lucide-react";
import Personaje from "../../components/Personaje";
import { toast } from "../../components/toast/Toast";
import { useAuth } from "../../contexts/AuthContext";
import { CLAVE_APARIENCIAS, useApariencias } from "../../hooks/useApariencias";
import { updateApariencia } from "../../services/users.service";
import { humanizeApiError } from "../../utils/apiErrors";
import {
  COLORES_PERSONALES,
  PERSONAJES,
  colorAutomatico,
  colorValido,
  imagenDePersonaje,
  nombreDeAutor,
} from "../../utils/personajes";

// TU PERSONAJE Y TU COLOR (Felipe, 27-10-2026; migración 167).
//
// Cada uno elige el suyo, y salen en cada nota que escribe en el
// Seguimiento: la letra en su color y el personaje al lado del nombre
// (la opción B). Sin elegir nada, todo se ve como antes. Los personajes
// son los 3D «tipo Netflix» que eligió Felipe; los fondos de colores de
// la galería son solo para elegir, como en Netflix.
const FONDOS_DE_GALERIA = [
  "#CECBF6",
  "#9FE1CB",
  "#F5C4B3",
  "#F4C0D1",
  "#B5D4F4",
  "#C0DD97",
  "#FAC775",
];

export default function TuPersonaje() {
  const { user, userName } = useAuth();
  const { porUsuario } = useApariencias();
  const queryClient = useQueryClient();
  const mia = user ? porUsuario.get(user.id) : undefined;
  const guardadoPersonaje = imagenDePersonaje(mia?.personaje)
    ? (mia?.personaje ?? null)
    : null;
  const guardadoColor = colorValido(mia?.color);

  const [personaje, setPersonaje] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [tocado, setTocado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Parte de lo guardado mientras no se haya tocado nada.
  useEffect(() => {
    if (tocado) return;
    setPersonaje(guardadoPersonaje);
    setColor(guardadoColor);
  }, [guardadoPersonaje, guardadoColor, tocado]);

  const nombre = nombreDeAutor(userName || user?.email);
  const hayCambio =
    tocado && (personaje !== guardadoPersonaje || color !== guardadoColor);

  const elegirPersonaje = (clave: string | null) => {
    setPersonaje(clave);
    setTocado(true);
  };
  const elegirColor = (hex: string | null) => {
    setColor(hex);
    setTocado(true);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      await updateApariencia({ personaje, color });
      await queryClient.invalidateQueries({ queryKey: CLAVE_APARIENCIAS });
      setTocado(false);
      toast.success(
        "Listo: tu personaje y tu color ya salen en el Seguimiento.",
      );
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo guardar tu personaje."));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <SmilePlus className="h-5 w-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            Tu personaje y tu color
          </h2>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          Salen junto a tu nombre en cada nota que escribes en el Seguimiento
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Así se ve tu nota (la opción B). */}
        <div className="flex items-start gap-3 bg-gray-50 rounded-lg p-3">
          <span
            className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-white"
            style={{ backgroundColor: color ?? colorAutomatico(nombre) }}
          >
            {nombre === "—" ? "?" : nombre.charAt(0).toUpperCase()}
          </span>
          <div
            className="flex-1 min-w-0 border border-gray-200 rounded-lg bg-white p-3"
            style={
              color ? { borderLeftColor: color, borderLeftWidth: 3 } : undefined
            }
          >
            <div className="text-xs text-gray-500">
              <Personaje
                clave={personaje}
                tamano={18}
                className="mr-1 -mt-0.5 align-middle"
              />
              <span className="font-semibold text-gray-700">{nombre}</span> ·
              hoy
            </div>
            <p className="text-sm text-gray-800 mt-1">Así se ve tu nota.</p>
          </div>
        </div>

        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">
            Tu personaje
          </div>
          <div className="grid grid-cols-5 sm:grid-cols-7 lg:grid-cols-9 gap-2">
            <button
              type="button"
              onClick={() => elegirPersonaje(null)}
              aria-pressed={personaje === null}
              className={`h-16 rounded-xl border-2 bg-gray-50 text-[11px] leading-tight text-gray-500 transition-colors ${
                personaje === null
                  ? "border-blue-600"
                  : "border-transparent hover:border-gray-300"
              }`}
            >
              Sin personaje
            </button>
            {PERSONAJES.map((p, i) => (
              <button
                key={p.clave}
                type="button"
                onClick={() => elegirPersonaje(p.clave)}
                aria-pressed={personaje === p.clave}
                title={p.nombre}
                className={`h-16 rounded-xl border-2 flex items-center justify-center transition-colors ${
                  personaje === p.clave
                    ? "border-blue-600"
                    : "border-transparent hover:border-gray-300"
                }`}
                style={{
                  backgroundColor:
                    FONDOS_DE_GALERIA[i % FONDOS_DE_GALERIA.length],
                }}
              >
                <Personaje clave={p.clave} tamano={44} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">Tu color</div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => elegirColor(null)}
              aria-pressed={color === null}
              className={`h-8 px-3 rounded-full border-2 text-xs text-gray-600 bg-gray-50 transition-colors ${
                color === null
                  ? "border-blue-600"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              Automático
            </button>
            {COLORES_PERSONALES.map((c) => (
              <button
                key={c.hex}
                type="button"
                onClick={() => elegirColor(c.hex)}
                aria-pressed={color === c.hex}
                aria-label={c.nombre}
                title={c.nombre}
                className={`w-8 h-8 rounded-full border-2 transition-shadow ${
                  color === c.hex
                    ? "border-white ring-2 ring-offset-1 ring-gray-800"
                    : "border-white shadow hover:ring-2 hover:ring-gray-300"
                }`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={!hayCambio || guardando}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
          >
            {guardando ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <Save size={16} />
            )}
            <span>{guardando ? "Guardando..." : "Guardar"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
