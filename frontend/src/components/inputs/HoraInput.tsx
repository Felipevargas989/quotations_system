// CAMPO DE HORA — PIEZA DE LA CASA (15-08 · rehecha el 18-08)
//
// Todas las horas del sistema se escriben y se ven con esta pieza.
//
// HISTORIA, para no repetirla:
//  - 15-08: nació envolviendo el <input type="time"> nativo. Ese mismo
//    día se probó un desplegable con las horas en cuartos y quedó PEOR:
//    Felipe lo mandó a devolver ("el campo nativo se teclea más rápido y
//    no obliga a buscar en una lista").
//  - 18-08: el nativo mostraba 12 h con a.m./p.m. según la configuración
//    del Mac —no según la página— y Felipe no podía teclear 14 ni 22
//    ("solo del 01 al 12"). Además guardaba en cada segmento tocado
//    (hora, minuto, a.m./p.m.): tres viajes por una hora, y lento.
//
// AHORA: una caja de texto en 24 h SIEMPRE, en cualquier computador o
// celular. Se teclea rápido —`2200`, `930`, `9`— y guarda UNA vez, al
// salir de la caja o con Enter (como la caja de montos). Algo inválido
// no se guarda: la caja vuelve a la hora anterior. Escape también.
//
// El portero vigila `type="time"` fuera de components/ con techo 0.

import { useEffect, useRef, useState } from "react";

/**
 * Lee lo que la persona tecleó y lo deja en "HH:MM" de 24 h.
 *
 *   "9"     → "09:00"     "22"    → "22:00"
 *   "930"   → "09:30"     "0930"  → "09:30"     "2200" → "22:00"
 *   "22:00" → "22:00"     "9:5"   → "09:05"     "22.30" / "22 30" → "22:30"
 *   ""      → null (sin hora)
 *   "25", "1299", "abc", "12345" → undefined (inválido: no se guarda)
 */
export const normalizarHora = (texto: string): string | null | undefined => {
  const t = texto.trim();
  if (t === "") return null;
  let hh: string;
  let mm: string;
  const conSeparador = /^(\d{1,2})\s*[:.\s]\s*(\d{1,2})$/.exec(t);
  if (conSeparador) {
    [, hh, mm] = conSeparador;
  } else if (/^\d+$/.test(t)) {
    if (t.length <= 2) {
      hh = t;
      mm = "0";
    } else if (t.length === 3) {
      hh = t.slice(0, 1);
      mm = t.slice(1);
    } else if (t.length === 4) {
      hh = t.slice(0, 2);
      mm = t.slice(2);
    } else {
      return undefined;
    }
  } else {
    return undefined;
  }
  const h = Number(hh);
  const m = Number(mm);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return undefined;
  if (h < 0 || h > 23 || m < 0 || m > 59) return undefined;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/** Lo que se muestra: "HH:MM", aunque la base traiga "HH:MM:SS"
 *  (Felipe, 18-08: "déjalo solo hora y min sin segundos"). */
const soloHoraYMinuto = (v: string | null | undefined): string =>
  v ? v.slice(0, 5) : "";

export default function HoraInput({
  value,
  onChange,
  disabled = false,
  compacta = false,
  className = "",
  "aria-label": ariaLabel,
}: {
  /** "HH:MM" o null si no hay hora. */
  readonly value: string | null;
  /** Se llama UNA vez por edición, con la hora ya normalizada. */
  readonly onChange: (valor: string | null) => void;
  readonly disabled?: boolean;
  /** La versión chica, para vivir dentro de una fila. */
  readonly compacta?: boolean;
  readonly className?: string;
  readonly "aria-label"?: string;
}) {
  const [texto, setTexto] = useState(soloHoraYMinuto(value));
  // Si la hora cambia POR FUERA (otra pantalla, el servidor, un
  // rollback), la caja la sigue. Solo cuando cambia: si tras confirmar
  // la caja volviera a la hora vieja hasta que el servidor responda, se
  // vería el parpadeo que esta pieza vino a quitar.
  useEffect(() => {
    setTexto(soloHoraYMinuto(value));
  }, [value]);
  const descartando = useRef(false);

  const confirmar = () => {
    if (descartando.current) {
      // Escape: se sale sin guardar lo escrito.
      descartando.current = false;
      setTexto(soloHoraYMinuto(value));
      return;
    }
    const nueva = normalizarHora(texto);
    if (nueva === undefined) {
      setTexto(soloHoraYMinuto(value)); // inválido: vuelve a la anterior
      return;
    }
    setTexto(nueva ?? "");
    if (nueva !== (value ? soloHoraYMinuto(value) : null)) onChange(nueva);
  };

  const base = compacta
    ? "w-16 border border-gray-200 rounded px-1.5 py-1 text-xs bg-white text-center tabular-nums"
    : "w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white text-center tabular-nums focus:ring-2 focus:ring-blue-500 focus:border-transparent";
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="HH:MM"
      value={texto}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          descartando.current = true;
          e.currentTarget.blur();
        }
      }}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`${base} disabled:bg-gray-100 disabled:text-gray-500 ${className}`}
    />
  );
}

/**
 * Las horas trabajadas entre dos horas, descontando la colación.
 * Si la salida es "antes" que la entrada, se asume que cruza medianoche
 * (entra 22:00, sale 02:00 → 4 horas). Devuelve null si falta un dato.
 */
export const horasTrabajadas = (
  entrada: string | null,
  salida: string | null,
  colacionMinutos: number | null,
): number | null => {
  if (!entrada || !salida) return null;
  const [eh, em] = entrada.split(":").map(Number);
  const [sh, sm] = salida.split(":").map(Number);
  if ([eh, em, sh, sm].some(Number.isNaN)) return null;
  let minutos = sh * 60 + sm - (eh * 60 + em);
  if (minutos < 0) minutos += 24 * 60; // cruza medianoche
  minutos -= colacionMinutos || 0;
  return Math.max(0, minutos) / 60;
};

/** "8 h" · "8,5 h" — con la coma decimal chilena. */
export const formatoHoras = (horas: number | null): string =>
  horas === null
    ? "—"
    : `${horas.toLocaleString("es-CL", { maximumFractionDigits: 1 })} h`;
