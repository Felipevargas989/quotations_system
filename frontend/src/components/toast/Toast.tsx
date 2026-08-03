import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, X, XCircle } from "lucide-react";

// El TOAST de la casa (Tanda 0 del destierro de avisos grises,
// aprobado por Felipe 31-07 / construido 03-08): la tarjetita que
// reemplaza a los alert() del navegador. Abajo a la derecha, se apila,
// se va sola (los errores duran más) y siempre se puede cerrar.
//
// Uso desde cualquier parte, sin contexto ni cableado:
//   import { toast } from ".../components/toast/Toast";
//   toast.success("Cliente creado");
//   toast.error("No se pudo guardar");
//   toast.warn("Revisa la unidad");
// El <ToastHost /> vive UNA vez en App.tsx.

type Kind = "success" | "error" | "warn";

interface ToastItem {
  id: number;
  kind: Kind;
  text: string;
}

// Almacén mínimo por suscripción (sin dependencias): las pantallas
// disparan, el host escucha.
let items: ToastItem[] = [];
let listeners: ((snapshot: ToastItem[]) => void)[] = [];
let nextId = 1;

const emit = () => listeners.forEach((l) => l([...items]));

const quitar = (id: number) => {
  items = items.filter((t) => t.id !== id);
  emit();
};

// Éxitos: fugaces. Advertencias: un poco más. Errores: duran más y
// suelen cerrarse a mano (nadie debe perderse un error).
const DURACION: Record<Kind, number> = {
  success: 3500,
  warn: 5000,
  error: 7000,
};

const push = (kind: Kind, text: string) => {
  const id = nextId++;
  items = [...items, { id, kind, text }];
  emit();
  setTimeout(() => quitar(id), DURACION[kind]);
};

export const toast = {
  success: (text: string) => push("success", text),
  error: (text: string) => push("error", text),
  warn: (text: string) => push("warn", text),
};

const ESTILO: Record<Kind, { borde: string; icono: JSX.Element }> = {
  success: {
    borde: "border-green-500",
    icono: <CheckCircle2 size={18} className="text-green-500 shrink-0" />,
  },
  error: {
    borde: "border-red-500",
    icono: <XCircle size={18} className="text-red-500 shrink-0" />,
  },
  warn: {
    borde: "border-amber-500",
    icono: <AlertTriangle size={18} className="text-amber-500 shrink-0" />,
  },
};

export function ToastHost() {
  const [list, setList] = useState<ToastItem[]>([]);
  useEffect(() => {
    const listener = (snapshot: ToastItem[]) => setList(snapshot);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  if (list.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 items-end">
      {list.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2.5 bg-white border border-gray-200 border-l-4 ${ESTILO[t.kind].borde} rounded-lg shadow-lg pl-3 pr-2 py-2.5 max-w-sm`}
        >
          {ESTILO[t.kind].icono}
          <p className="text-sm text-gray-800 leading-snug">{t.text}</p>
          <button
            type="button"
            onClick={() => quitar(t.id)}
            className="ml-1 p-1 rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-50 shrink-0"
            aria-label="Cerrar aviso"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
