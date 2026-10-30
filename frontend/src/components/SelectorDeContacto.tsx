import { useEffect, useState } from "react";
import Modal from "./Modal";
import SelectWithSearch from "./selects/SelectWithSearch";
import { toast } from "./toast/Toast";
import { useAuth } from "../contexts/AuthContext";
import {
  type ClientContact,
  createClientContact,
  getClientContacts,
} from "../services/clientContacts.service";
import { updateQuotation } from "../services/quotations.service";
import {
  emailProblem,
  normalizePhone,
  PHONE_PLACEHOLDER,
  phoneProblem,
} from "../utils/phone";
import { normalizeText } from "../utils/searchMatch";
import { puedeCambiarContacto } from "../utils/puedeCambiarContacto";

const NUEVO = "__nuevo__";

/**
 * EL CONTACTO DE LA COTIZACIÓN COMO LISTA PLEGABLE (Felipe, 29-10-2026:
 * "primero debería ser solamente una lista plegable"; "generalmente se
 * cambian más a nivel de cotizaciones que a nivel de postventa"). Va en la
 * cabecera de la ficha de la cotización y en la de Post-Venta. Se elige y
 * queda guardado: el parche lleva SOLO `contact_name` (nunca la plata), y el
 * motor lo vincula con su persona (`resolveContactId`). Al final de la lista,
 * «+ Nuevo contacto» abre una ventana corta; en Particulares con su persona
 * no aparece (mapa 09, regla 10). Sin permiso, es el nombre a secas.
 *
 * 29-10, segunda vuelta: la caja de formulario "quedó feo" en la cabecera,
 * así que va como texto con una flechita (aspecto "texto"), y antes de
 * guardar pregunta (Felipe: "puedes poner un modal de confirmación").
 */
export default function SelectorDeContacto({
  quotationId,
  clientId,
  clientType,
  estado,
  actual,
  onCambiado,
}: {
  readonly quotationId: string;
  readonly clientId?: string | null;
  readonly clientType?: string | null;
  readonly estado?: string | null;
  readonly actual?: string;
  readonly onCambiado: () => Promise<void> | void;
}) {
  const { company, userRole } = useAuth();
  const puede = !!clientId && puedeCambiarContacto(userRole, estado);
  const [personas, setPersonas] = useState<ClientContact[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [nueva, setNueva] = useState(false);
  const [porConfirmar, setPorConfirmar] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [fono, setFono] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!puede || !clientId) return;
    let vivo = true;
    getClientContacts(clientId).then((lista) => {
      if (vivo) setPersonas(lista);
    });
    return () => {
      vivo = false;
    };
  }, [puede, clientId]);

  if (!puede) return <p>{actual || "—"}</p>;

  const calza = personas.find(
    (p) => normalizeText(p.name) === normalizeText(actual || ""),
  );
  const sePuedeSumar = !(clientType === "Particulares" && personas.length > 0);

  const opciones = [
    ...[...personas]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({
        value: p.name,
        label: p.name,
        hint: p.email || undefined,
        chip: p.email
          ? undefined
          : { texto: "sin correo", clases: "bg-red-50 text-red-600" },
      })),
    ...(sePuedeSumar ? [{ value: NUEVO, label: "+ Nuevo contacto" }] : []),
  ];

  const guardar = async (elegido: string) => {
    if (!elegido || normalizeText(elegido) === normalizeText(actual || ""))
      return;
    setGuardando(true);
    const { error: fallo } = await updateQuotation(
      { contact_name: elegido },
      quotationId,
    );
    setGuardando(false);
    if (fallo) {
      toast.error("No se pudo cambiar el contacto. Intenta de nuevo.");
      return;
    }
    toast.success(`Contacto cambiado a ${elegido}`);
    await onCambiado();
  };

  const cerrarNueva = () => {
    setNueva(false);
    setNombre("");
    setCorreo("");
    setFono("");
    setError(null);
  };

  const agregar = async () => {
    const limpio = nombre.trim();
    if (!limpio || !clientId || !company?.id) return;
    const problema = phoneProblem(fono) || emailProblem(correo);
    if (problema) {
      setError(problema);
      return;
    }
    setGuardando(true);
    const { data, error: fallo } = await createClientContact({
      company_id: company.id,
      client_id: clientId,
      name: limpio,
      email: correo.trim() || null,
      phone: fono.trim() || null,
      is_primary: personas.length === 0,
    });
    setGuardando(false);
    if (fallo || !data) {
      setError(
        "No se pudo agregar la persona. Revisa que no exista ya con ese nombre.",
      );
      return;
    }
    setPersonas((prev) => [...prev, data]);
    cerrarNueva();
    await guardar(data.name);
  };

  return (
    <div>
      <SelectWithSearch
        options={opciones}
        value={calza?.name ?? actual ?? ""}
        onChange={(v) => {
          if (v === NUEVO) setNueva(true);
          else if (normalizeText(v) !== normalizeText(actual || ""))
            setPorConfirmar(v);
        }}
        placeholder="Elegir contacto"
        searchPlaceholder="Buscar persona…"
        noResultsText="No hay personas con ese nombre"
        disabled={guardando}
        tamano="sm"
        sinLimpiar
        mostrarConteo={false}
        aspecto="texto"
      />
      {porConfirmar && (
        <Modal
          titulo="¿Cambiar el contacto?"
          ancho="max-w-sm"
          onCerrar={() => setPorConfirmar(null)}
          pie={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPorConfirmar(null)}
                className="px-3 py-2 text-sm text-gray-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const elegido = porConfirmar;
                  setPorConfirmar(null);
                  void guardar(elegido);
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Sí, cambiar
              </button>
            </div>
          }
        >
          <p className="text-sm text-gray-700">
            El contacto de esta cotización pasa de{" "}
            <strong>{actual || "nadie"}</strong> a{" "}
            <strong>{porConfirmar}</strong>.
          </p>
        </Modal>
      )}
      {nueva && (
        <Modal
          titulo="Nuevo contacto"
          subtitulo="Queda en la ficha del cliente y como contacto de esta cotización"
          ancho="max-w-sm"
          onCerrar={cerrarNueva}
          pie={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cerrarNueva}
                className="px-3 py-2 text-sm text-gray-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void agregar()}
                disabled={guardando || !nombre.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          }
        >
          <div className="space-y-3 text-sm text-gray-800">
            <div>
              <label className="text-xs font-semibold text-gray-600">
                Nombre *
              </label>
              <input
                autoFocus
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Ej: Juanita Pérez"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">
                Correo
              </label>
              <input
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="correo@ejemplo.com"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">
                Teléfono
              </label>
              <input
                value={fono}
                onChange={(e) => setFono(e.target.value)}
                onBlur={() => setFono((f) => normalizePhone(f || ""))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder={PHONE_PLACEHOLDER}
              />
            </div>
            {error && (
              <p className="text-xs font-medium text-red-600">{error}</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
