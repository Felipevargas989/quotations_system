import { useEffect, useState } from "react";
import { Plus, UserPen } from "lucide-react";
import { toast } from "../../components/toast/Toast";
import { useAuth } from "../../contexts/AuthContext";
import {
  type ClientContact,
  createClientContact,
  getClientContacts,
} from "../../services/clientContacts.service";
import { updateQuotation } from "../../services/quotations.service";
import {
  emailProblem,
  normalizePhone,
  PHONE_PLACEHOLDER,
  phoneProblem,
} from "../../utils/phone";
import { normalizeText } from "../../utils/searchMatch";

/**
 * «CAMBIAR CONTACTO» EN POST-VENTA (Felipe, 29-10-2026: "¿puedo en post venta
 * en alguna parte configurar a quién tengo como contacto de una cotización?").
 * Cambia SOLO el mandante, sin pasar por el cotizador: guardar la cotización
 * entera en una aceptada puede mover el plan de pagos. El parche lleva solo
 * `contact_name`, y el motor lo vincula con su persona (`resolveContactId`).
 * El evento realizado sigue congelado: la pantalla no ofrece el botón y el
 * motor lo rechaza igual (EVENTO_REALIZADO_CONGELADO).
 */
export default function CambiarContacto({
  quotationId,
  clientId,
  actual,
  clientType,
  onCambiado,
}: {
  readonly quotationId: string;
  readonly clientId: string;
  readonly actual?: string;
  readonly clientType?: string;
  readonly onCambiado: () => Promise<void> | void;
}) {
  const { company } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [personas, setPersonas] = useState<ClientContact[] | null>(null);
  const [elegido, setElegido] = useState<string>("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nuevaAbierta, setNuevaAbierta] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoCorreo, setNuevoCorreo] = useState("");
  const [nuevoFono, setNuevoFono] = useState("");

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    getClientContacts(clientId).then((lista) => {
      if (!vivo) return;
      const ordenada = [...lista].sort((a, b) => a.name.localeCompare(b.name));
      setPersonas(ordenada);
      const calza = ordenada.find(
        (p) => normalizeText(p.name) === normalizeText(actual || ""),
      );
      setElegido(calza?.name ?? "");
    });
    return () => {
      vivo = false;
    };
  }, [abierto, clientId, actual]);

  const cerrar = () => {
    setAbierto(false);
    setNuevaAbierta(false);
    setError(null);
  };

  const esElActual = (nombre: string) =>
    normalizeText(nombre) === normalizeText(actual || "");

  const agregarPersona = async () => {
    const nombre = nuevoNombre.trim();
    if (!nombre || !company?.id) return;
    const problema = phoneProblem(nuevoFono) || emailProblem(nuevoCorreo);
    if (problema) {
      setError(problema);
      return;
    }
    setError(null);
    setGuardando(true);
    const { data, error: fallo } = await createClientContact({
      company_id: company.id,
      client_id: clientId,
      name: nombre,
      email: nuevoCorreo.trim() || null,
      phone: nuevoFono.trim() || null,
      is_primary: (personas || []).length === 0,
    });
    setGuardando(false);
    if (fallo || !data) {
      setError(
        "No se pudo agregar la persona. Revisa que no exista ya con ese nombre.",
      );
      return;
    }
    setPersonas((prev) =>
      [...(prev || []), data].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setElegido(data.name);
    setNuevaAbierta(false);
    setNuevoNombre("");
    setNuevoCorreo("");
    setNuevoFono("");
  };

  const guardar = async () => {
    if (!elegido || esElActual(elegido)) {
      cerrar();
      return;
    }
    setGuardando(true);
    setError(null);
    const { error: fallo } = await updateQuotation(
      { contact_name: elegido },
      quotationId,
    );
    setGuardando(false);
    if (fallo) {
      setError("No se pudo cambiar el contacto. Intenta de nuevo.");
      return;
    }
    toast.success(`Contacto cambiado a ${elegido}`);
    cerrar();
    await onCambiado();
  };

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title="Cambiar el contacto de este evento"
        className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-0.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
      >
        <UserPen size={12} className="shrink-0" />
        Cambiar
      </button>
    );
  }

  return (
    <div className="mt-2 w-full max-w-sm rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-800">
      <p className="mb-2 text-xs font-semibold text-gray-500">
        Contacto de este evento
      </p>
      {personas === null ? (
        <p className="text-xs text-gray-500">Cargando personas…</p>
      ) : (
        <div className="space-y-1">
          {personas.length === 0 && (
            <p className="text-xs text-gray-500">
              Este cliente todavía no tiene personas de contacto.
            </p>
          )}
          {personas.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2"
            >
              <input
                type="radio"
                name={`contacto-${quotationId}`}
                checked={elegido === p.name}
                onChange={() => setElegido(p.name)}
              />
              <span>{p.name}</span>
              <span className="text-xs text-gray-400">
                {esElActual(p.name)
                  ? "· actual"
                  : `· ${p.email || "sin correo"}`}
              </span>
            </label>
          ))}
        </div>
      )}

      {nuevaAbierta ? (
        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          <input
            autoFocus
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            placeholder="Nombre *"
          />
          <input
            type="email"
            value={nuevoCorreo}
            onChange={(e) => setNuevoCorreo(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            placeholder="correo@ejemplo.com"
          />
          <input
            value={nuevoFono}
            onChange={(e) => setNuevoFono(e.target.value)}
            onBlur={() => setNuevoFono((f) => normalizePhone(f || ""))}
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            placeholder={PHONE_PLACEHOLDER}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setNuevaAbierta(false)}
              className="px-2 py-1 text-xs text-gray-600"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void agregarPersona()}
              disabled={guardando || !nuevoNombre.trim()}
              className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Agregar persona
            </button>
          </div>
        </div>
      ) : (
        personas !== null &&
        // Particulares = UNA persona (regla de Felipe, 30-07; mapa 09, regla 10).
        !(clientType === "Particulares" && personas.length > 0) && (
          <button
            type="button"
            onClick={() => setNuevaAbierta(true)}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
          >
            <Plus size={12} />
            Nuevo contacto
          </button>
        )
      )}

      {error && (
        <p className="mt-2 text-xs font-medium text-red-600">{error}</p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={guardando || personas === null}
          className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={cerrar}
          className="rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-700"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
