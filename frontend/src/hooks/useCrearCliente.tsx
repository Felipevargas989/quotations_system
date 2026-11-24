import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import AvisoClienteExistente from "../components/clientes/AvisoClienteExistente";
import { toast } from "../components/toast/Toast";
import { useAuth } from "../contexts/AuthContext";
import {
  createClientContact,
  getClientContacts,
} from "../services/clientContacts.service";
import { createClient, revisarCliente } from "../services/clients.service";
import { ClientFormData } from "../types/clients.types";
import { humanizeApiError } from "../utils/apiErrors";
import {
  CoincidenciaCliente,
  coincidenciasDe,
  datosParaRevisar,
  sinLasDescartadas,
} from "../utils/avisoCliente";
import { normalizeText } from "../utils/searchMatch";

export type OrigenDelCliente = "creado" | "existente" | "contacto";

export interface ClienteElegido {
  id: string;
  name: string;
  client_type?: string | null;
}

interface Opciones {
  /** El cliente que quedó (nuevo o existente) y la persona que va de contacto. */
  alElegir: (
    cliente: ClienteElegido,
    persona: string | null,
    origen: OrigenDelCliente,
  ) => void;
  /** Cerrar y limpiar la ventana: pasa en los tres finales felices. */
  alTerminar: () => void;
  /** El cliente a crear con lo escrito, ya revisado por la pantalla; null
   *  si falta algo (la pantalla marca el error). */
  armar: () => ClientFormData | null;
  /** Lo escrito en la ventana ahora: el aviso sale apenas se termina de
   *  escribir (Felipe, 16-10: "es más rápido"). */
  datos?: Partial<ClientFormData>;
  /** Si la ventana se cierra, el aviso viejo no vuelve a aparecer. */
  abierto?: boolean;
}

// Cuánto se espera después de la última tecla para revisar.
const PAUSA_MS = 700;

// EL GANCHO DE "CREAR NUEVO CLIENTE" (Felipe, 16-10-2026: "sí, ármalo
// así"). Revisa mientras se escribe si ya existe un cliente parecido y,
// si lo hay, muestra el aviso con las tres salidas: usar este cliente,
// sumar como contacto a este cliente, o es otro cliente, crear igual. Al
// crear, el portero del motor vuelve a revisar (por si el aviso en vivo
// no alcanzó a llegar). Una sola copia para Recepción (RequestForm), el
// cotizador (QuotationForm, gigante congelado que no puede engordar) y
// Clientes.
export function useCrearCliente({
  alElegir,
  alTerminar,
  armar,
  datos,
  abierto,
}: Opciones) {
  const queryClient = useQueryClient();
  const { company } = useAuth();
  const [coincidencias, setCoincidencias] = useState<
    CoincidenciaCliente[] | null
  >(null);
  const [cargando, setCargando] = useState(false);
  // Cada revisión lleva su turno: una respuesta vieja no pisa a una nueva.
  const turno = useRef(0);
  // ¿El aviso que se ve salió mientras se escribía? Ahí «Es otro cliente»
  // NO guarda: solo cierra el aviso y se sigue llenando (Felipe, 24-11-2026,
  // José Araya: "en vez de dejarme continuar cerró con la información que
  // alcancé a colocar"). Si salió al apretar «Crear Cliente», sí crea.
  const [enVivo, setEnVivo] = useState(false);
  // Los clientes que quien escribe ya dijo que no son: no vuelven a avisar
  // mientras la ventana siga abierta.
  const descartadas = useRef<Set<string>>(new Set());

  const limpiarAviso = () => {
    turno.current++;
    descartadas.current = new Set();
    setCoincidencias(null);
  };
  useEffect(() => {
    if (abierto === false) limpiarAviso();
  }, [abierto]);

  // El aviso en vivo: solo con datos completos (un correo con su dominio,
  // un teléfono de 8 dígitos o más, un nombre de 3 letras o más, como CCU).
  // La firma es el texto de lo que se revisa: solo cuando cambia un dato
  // que importa se vuelve a preguntar (no en cada tecla de las notas).
  const conDatos = datos !== undefined;
  const firma = JSON.stringify(datos ? datosParaRevisar(datos) : null);
  useEffect(() => {
    if (abierto === false || !conDatos) return;
    const n = ++turno.current;
    const paraRevisar = JSON.parse(firma) as Record<string, string> | null;
    if (!paraRevisar) {
      setCoincidencias(null);
      return;
    }
    const espera = setTimeout(() => {
      revisarCliente(paraRevisar)
        .then((lista) => {
          if (n !== turno.current) return;
          const nuevas = sinLasDescartadas(lista, descartadas.current);
          setEnVivo(true);
          setCoincidencias(nuevas.length > 0 ? nuevas : null);
        })
        // Es una ayuda, no el candado: si falla, el portero revisa al crear.
        .catch(() => undefined);
    }, PAUSA_MS);
    return () => clearTimeout(espera);
  }, [abierto, conDatos, firma]);

  const terminar = () => {
    limpiarAviso();
    alTerminar();
  };

  const crear = async (cliente: ClientFormData, confirmado: boolean) => {
    setCargando(true);
    try {
      const { data: nuevo } = await createClient(cliente, confirmado);
      if (nuevo) {
        // Entra al caché al instante y se confirma con el servidor.
        queryClient.setQueryData<unknown[]>(["clients"], (prev) => [
          ...(prev ?? []),
          nuevo,
        ]);
        queryClient.invalidateQueries({ queryKey: ["clients"] });
        // La persona principal nace con este nombre (garantía de
        // nacimiento del motor): queda marcada como contacto.
        const persona =
          (cliente.contact_person || "").trim() || cliente.name.trim() || null;
        alElegir(nuevo as ClienteElegido, persona, "creado");
      }
      toast.success("Cliente creado.");
      terminar();
    } catch (error) {
      const parecidos = coincidenciasDe(error);
      if (parecidos) {
        turno.current++;
        // Con «confirmado» el motor solo vuelve a frenar cuando es el mismo
        // cliente (mismo correo y nombre): eso se muestra siempre.
        const nuevas = confirmado
          ? parecidos
          : sinLasDescartadas(parecidos, descartadas.current);
        if (nuevas.length === 0) {
          // Todo lo que encontró el portero ya se descartó en el aviso en
          // vivo: se crea sin volver a preguntar.
          await crear(cliente, true);
          return;
        }
        setEnVivo(false);
        setCoincidencias(nuevas);
      } else {
        toast.error(humanizeApiError(error, "No se pudo crear el cliente."));
      }
    } finally {
      setCargando(false);
    }
  };

  /** El "Crear Cliente" de la ventana. */
  const enviar = (e?: { preventDefault: () => void }) => {
    e?.preventDefault();
    const cliente = armar();
    if (cliente) void crear(cliente, false);
  };

  const usar = (
    c: CoincidenciaCliente,
    persona = c.persona?.nombre ?? null,
  ) => {
    alElegir(
      { id: c.cliente_id, name: c.nombre, client_type: c.tipo },
      persona,
      "existente",
    );
    toast.success(`Usando el cliente «${c.nombre}».`);
    terminar();
  };

  const sumarContacto = async (c: CoincidenciaCliente) => {
    const cliente = armar();
    if (!cliente) return;
    const nombre = (cliente.contact_person || "").trim() || cliente.name.trim();
    setCargando(true);
    try {
      // Si ya es contacto de ese cliente, no se duplica: se usa.
      const yaEsta = (await getClientContacts(c.cliente_id)).find(
        (p) => normalizeText(p.name) === normalizeText(nombre),
      );
      if (yaEsta) {
        usar(c, yaEsta.name);
        return;
      }
      const { error } = await createClientContact({
        company_id: Number(company?.id),
        client_id: c.cliente_id,
        name: nombre,
        email: cliente.contact_email || cliente.email || null,
        phone: cliente.contact_phone || cliente.phone || null,
      });
      if (error) {
        toast.error(humanizeApiError(error, "No se pudo sumar el contacto."));
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      alElegir(
        { id: c.cliente_id, name: c.nombre, client_type: c.tipo },
        nombre,
        "contacto",
      );
      toast.success(`${nombre} quedó como contacto de «${c.nombre}».`);
      terminar();
    } finally {
      setCargando(false);
    }
  };

  const aviso = coincidencias ? (
    <AvisoClienteExistente
      coincidencias={coincidencias}
      ocupado={cargando}
      onUsar={(c) => usar(c)}
      onSumarContacto={(c) => void sumarContacto(c)}
      enVivo={enVivo}
      onCrearIgual={() => {
        if (enVivo) {
          // Solo se despacha el aviso: la ventana sigue abierta y el
          // cliente se crea con «Crear Cliente», con todo lo escrito.
          coincidencias.forEach((c) => descartadas.current.add(c.cliente_id));
          turno.current++;
          setCoincidencias(null);
          return;
        }
        const cliente = armar();
        if (cliente) void crear(cliente, true);
      }}
    />
  ) : null;

  return { enviar, cargando, aviso };
}
