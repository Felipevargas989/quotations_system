import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import { toast } from "../../components/toast/Toast";
import { useCrearCliente } from "../../hooks/useCrearCliente";
import { clientTypesQueryOptions } from "../../services/clientTypes.service";
import type {
  ClienteParaFacturar,
  Receptor,
} from "../../services/facturas.service";
import { createRazonSocial } from "../../services/razonesSociales.service";
import { humanizeApiError } from "../../utils/apiErrors";
import {
  formatearRut,
  mensajeRut,
  normalizarRut,
  revisarRut,
} from "../../utils/rut";
import Casilla from "../postventa/facturacion/CasillaDeLaFactura";
import CamposDelReceptor from "../postventa/facturacion/CamposDelReceptor";
import { RECEPTOR_VACIO } from "../postventa/facturacion/datosDeLaFactura";

// EL CLIENTE NUEVO DE LA FACTURA (doc 19 §9.22). Felipe, 06-11: *"en
// crear cliente debemos agregar los datos de contacto, tipo de cliente
// para que quede en nuestro módulo de clientes"*. Se guarda en Clientes
// con sus datos de facturación (una razón social) y su contacto, con el
// mismo gancho de Recepción, el cotizador y Clientes: el aviso de «cliente
// parecido» es el mismo en todas partes. Un RUT que ya está en Clientes
// no se crea dos veces: se ofrece usar ese cliente.

const TIPO_POR_DEFECTO = "Empresas";

export default function ClienteNuevoParaFacturar({
  clientes,
  onCancelar,
  onListo,
  onUsar,
}: {
  readonly clientes: ClienteParaFacturar[];
  readonly onCancelar: () => void;
  /** El cliente quedó en Clientes con su razón social: va a la factura. */
  readonly onListo: (clienteId: string, receptor: Receptor) => void;
  /** Ese RUT ya era de un cliente: se usa ese (`cliente|razón`). */
  readonly onUsar: (valor: string) => void;
}) {
  const tipos = useQuery(clientTypesQueryOptions);
  const [receptor, setReceptor] = useState<Receptor>(RECEPTOR_VACIO);
  const [tipo, setTipo] = useState("");
  const [contacto, setContacto] = useState({
    nombre: "",
    correo: "",
    telefono: "",
  });
  const [error, setError] = useState<string | null>(null);
  const nombres = (tipos.data ?? []).map((t) => t.name);
  const tipoElegido =
    tipo ||
    (nombres.includes(TIPO_POR_DEFECTO) ? TIPO_POR_DEFECTO : nombres[0]) ||
    "";

  const rut = normalizarRut(receptor.rut);
  const rutValido = !!receptor.rut && !revisarRut(receptor.rut);
  // El RUT que ya está en Clientes: se usa ese cliente, no se duplica.
  const ya = rutValido
    ? clientes
        .flatMap((c) => c.razones.map((z) => ({ c, z })))
        .find(({ z }) => z.rut === rut)
    : undefined;

  const { enviar, cargando, aviso } = useCrearCliente({
    armar: () => {
      if (!rutValido) {
        setError(mensajeRut(revisarRut(receptor.rut)));
        return null;
      }
      if (!receptor.razon_social.trim()) {
        setError("Falta la razón social.");
        return null;
      }
      if (ya || !tipoElegido) return null;
      setError(null);
      const correo = contacto.correo.trim() || undefined;
      const telefono = contacto.telefono.trim() || undefined;
      return {
        name: receptor.razon_social.trim(),
        client_type: tipoElegido,
        email: correo,
        phone: telefono,
        contact_person: contacto.nombre.trim() || undefined,
        contact_email: correo,
        contact_phone: telefono,
        address:
          [receptor.direccion, receptor.comuna]
            .map((x) => (x ?? "").trim())
            .filter(Boolean)
            .join(", ") || undefined,
      };
    },
    // El aviso de «parecido» mientras se escribe, como en Clientes.
    datos: {
      name: receptor.razon_social,
      email: contacto.correo,
      phone: contacto.telefono,
      contact_email: contacto.correo,
      contact_phone: contacto.telefono,
    },
    // Creado, o uno parecido que ya estaba: la razón social queda en ese
    // cliente y la factura va a él.
    alElegir: (cliente) => {
      const datos = { ...receptor, rut: rut ?? receptor.rut };
      void createRazonSocial(cliente.id, {
        rut: datos.rut,
        razon_social: datos.razon_social.trim(),
        giro: datos.giro || null,
        direccion: datos.direccion || null,
        comuna: datos.comuna || null,
        ciudad: datos.ciudad || null,
        correo_facturacion: datos.correo || null,
      })
        .catch((e: unknown) =>
          // Si no quedó, se guarda al emitir (va con el cliente).
          toast.warn(
            humanizeApiError(
              e,
              "Los datos de facturación se guardan al emitir.",
            ),
          ),
        )
        .finally(() => onListo(cliente.id, datos));
    },
    alTerminar: () => undefined,
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Queda guardado en Clientes, con sus datos de facturación y su contacto.
      </p>
      <p className="text-xs font-semibold text-gray-700">
        Datos de facturación
      </p>
      <CamposDelReceptor
        receptor={receptor}
        onChange={(campo, valor) =>
          setReceptor((r) => ({ ...r, [campo]: valor }))
        }
      />
      {ya && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Ese RUT ya está en Clientes: {ya.z.razon_social} (
          {formatearRut(ya.z.rut)})
          {ya.c.nombre !== ya.z.razon_social ? `, de ${ya.c.nombre}` : ""}.{" "}
          <button
            type="button"
            onClick={() => onUsar(`${ya.c.id}|${ya.z.id}`)}
            className="font-semibold underline"
          >
            Usar ese cliente
          </button>
        </p>
      )}
      <p className="text-xs font-semibold text-gray-700">En Clientes</p>
      <div className="grid gap-2 sm:grid-cols-[14rem_1fr]">
        <div>
          <span className="flex justify-between text-xs text-gray-500">
            Tipo de cliente
          </span>
          <SelectWithSearch
            options={nombres.map((n) => ({ value: n, label: n }))}
            value={tipoElegido}
            onChange={(v) => v && setTipo(v)}
            placeholder="Elegir el tipo"
            sinLimpiar
            mostrarConteo={false}
          />
        </div>
        <Casilla
          etiqueta="Nombre del contacto"
          valor={contacto.nombre}
          placeholder="A quién se le cobra"
          onChange={(v) => setContacto((c) => ({ ...c, nombre: v }))}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Casilla
          etiqueta="Correo del contacto"
          valor={contacto.correo}
          onChange={(v) => setContacto((c) => ({ ...c, correo: v }))}
        />
        <Casilla
          etiqueta="Teléfono del contacto"
          valor={contacto.telefono}
          placeholder="+56 9"
          onChange={(v) => setContacto((c) => ({ ...c, telefono: v }))}
        />
      </div>
      {aviso}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={cargando || !!ya}
          onClick={() => enviar()}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {cargando ? "Guardando…" : "Guardar cliente"}
        </button>
      </div>
    </div>
  );
}
