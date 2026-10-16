import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import AvisoClienteExistente from "../components/clientes/AvisoClienteExistente";
import { toast } from "../components/toast/Toast";
import { useAuth } from "../contexts/AuthContext";
import {
  createClientContact,
  getClientContacts,
} from "../services/clientContacts.service";
import { createClient } from "../services/clients.service";
import { ClientFormData } from "../types/clients.types";
import { humanizeApiError } from "../utils/apiErrors";
import { CoincidenciaCliente, coincidenciasDe } from "../utils/avisoCliente";
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
  /** Si la ventana se cierra, el aviso viejo no vuelve a aparecer. */
  abierto?: boolean;
}

// EL GANCHO DE "CREAR NUEVO CLIENTE" (Felipe, 16-10-2026: "sí, ármalo
// así"). Crea pasando por el portero del motor y, si ya existe un cliente
// parecido, muestra el aviso con las tres salidas: usar este cliente,
// sumar como contacto a este cliente, o es otro cliente, crear igual.
// Una sola copia para Recepción (RequestForm), el cotizador
// (QuotationForm, gigante congelado que no puede engordar) y Clientes.
export function useCrearCliente({ alElegir, alTerminar, abierto }: Opciones) {
  const queryClient = useQueryClient();
  const { company } = useAuth();
  const [coincidencias, setCoincidencias] = useState<
    CoincidenciaCliente[] | null
  >(null);
  const [cargando, setCargando] = useState(false);
  const pendiente = useRef<ClientFormData | null>(null);

  const limpiarAviso = () => {
    setCoincidencias(null);
    pendiente.current = null;
  };
  useEffect(() => {
    if (abierto === false) limpiarAviso();
  }, [abierto]);

  const terminar = () => {
    limpiarAviso();
    alTerminar();
  };

  const crear = async (datos: ClientFormData, confirmado = false) => {
    setCargando(true);
    try {
      const { data: nuevo } = await createClient(datos, confirmado);
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
          (datos.contact_person || "").trim() || datos.name.trim() || null;
        alElegir(nuevo as ClienteElegido, persona, "creado");
      }
      toast.success("Cliente creado.");
      terminar();
    } catch (error) {
      const parecidos = coincidenciasDe(error);
      if (parecidos) {
        pendiente.current = datos;
        setCoincidencias(parecidos);
      } else {
        toast.error(humanizeApiError(error, "No se pudo crear el cliente."));
      }
    } finally {
      setCargando(false);
    }
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
    const datos = pendiente.current;
    if (!datos) return;
    const nombre = (datos.contact_person || "").trim() || datos.name.trim();
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
        email: datos.contact_email || datos.email || null,
        phone: datos.contact_phone || datos.phone || null,
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
      onCrearIgual={() => {
        if (pendiente.current) void crear(pendiente.current, true);
      }}
    />
  ) : null;

  return { crear, cargando, aviso };
}
