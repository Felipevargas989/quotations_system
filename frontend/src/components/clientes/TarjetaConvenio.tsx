import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, Handshake, RefreshCw, Send } from "lucide-react";
import Modal from "../Modal";
import FileViewLink from "../FileViewLink";
import SelectWithSearch from "../selects/SelectWithSearch";
import { toast } from "../toast/Toast";
import { useArrastreDeArchivos } from "../../hooks/useArrastreDeArchivos";
import { uploadClientDocument } from "../../services/storage.service";
import {
  enviarConvenio,
  fechaCl,
  generarPdfDelConvenio,
  getConvenio,
  subirConvenioFirmado,
  type EstadoDelConvenio,
} from "../../services/convenios.service";
import { humanizeApiError } from "../../utils/apiErrors";

// LA TARJETA «CONVENIO» DE LA FICHA DEL CLIENTE (doc 24, 19-11-2026).
//
// Felipe: «tengo muchos convenios con clientes dando vuelta». Un chip de UNA
// palabra con el detalle en una línea chica debajo (sus «chips cortos»), y
// los botones según el estado. La plantilla y sus beneficios son de la
// empresa: si la empresa no tiene, la tarjeta no aparece.

export interface ContactoDelCliente {
  id: number;
  name: string;
  email?: string | null;
  is_primary?: boolean;
}

const CHIP = "inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold";

/** El chip y su línea chica: lo que se repite va siempre en el mismo lugar. */
const chipYDetalle = (
  e: EstadoDelConvenio,
): { chip: string; clases: string; detalle: string; aviso?: string } => {
  const c = e.convenio;
  if (!c) {
    return {
      chip: "Sin convenio",
      clases: "bg-slate-100 text-slate-700",
      detalle: `${e.plantilla?.nombre ?? "Convenio"} · gratis con la firma`,
    };
  }
  if (c.estado === "enviado") {
    return {
      chip: "Enviado",
      clases: "bg-amber-100 text-amber-800",
      detalle: `A ${c.enviado_a_correo ?? "—"} · ${fechaCl(c.enviado_at)}`,
    };
  }
  return {
    chip: "Firmado",
    clases: "bg-emerald-100 text-emerald-800",
    detalle: [
      c.firmante_nombre,
      fechaCl(c.firmado_at),
      c.vence_at ? `vence ${fechaCl(c.vence_at)}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    aviso: c.pdf_pendiente ? "PDF pendiente" : undefined,
  };
};

export default function TarjetaConvenio({
  clientId,
  contactos,
  puedeEditar,
}: {
  readonly clientId: string;
  readonly contactos: ContactoDelCliente[];
  readonly puedeEditar: boolean;
}) {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["convenio", clientId],
    queryFn: () => getConvenio(clientId),
    retry: false,
  });
  const [enviando, setEnviando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [generando, setGenerando] = useState(false);

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["convenio", clientId] });
    qc.invalidateQueries({ queryKey: ["documentosDelCliente", clientId] });
  };

  // Sin plantilla, sin permiso o con error: no hay tarjeta.
  if (isLoading || isError || !data?.ofrece) return null;

  const { chip, clases, detalle, aviso } = chipYDetalle(data);
  const c = data.convenio;

  const generarPdf = async () => {
    setGenerando(true);
    try {
      await generarPdfDelConvenio(clientId);
      toast.success("PDF del convenio generado");
      refrescar();
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo generar el PDF"));
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-3">
      <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
        <Handshake size={18} /> Convenio
      </h2>
      <div>
        <span className={`${CHIP} ${clases}`}>{chip}</span>
        <p className="mt-1 text-xs text-gray-600">
          {detalle.split(" · ").map((parte, i) => (
            <Fragment key={i}>
              {i > 0 && " · "}
              <span className="whitespace-nowrap">{parte}</span>
            </Fragment>
          ))}
          {aviso && (
            <span className="ml-1 whitespace-nowrap font-semibold text-amber-700">
              · {aviso}
            </span>
          )}
        </p>
      </div>

      {!c && data.plantilla && data.plantilla.beneficios.length > 0 && (
        <ul className="space-y-1 text-xs text-gray-700">
          {data.plantilla.beneficios.map((b) => (
            <li key={b.titulo} className="flex gap-1.5">
              <span className="text-emerald-600">●</span>
              <span>
                <strong className="font-semibold">{b.titulo}</strong>
                {b.detalle ? ` · ${b.detalle}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {c?.estado === "firmado" && c.documento && (
          <FileViewLink
            url={c.documento.file_url}
            title={c.documento.file_name}
            boton="Ver convenio"
            claseDelBoton="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
          />
        )}
        {c?.estado === "firmado" && c.pdf_pendiente && puedeEditar && (
          <button
            type="button"
            disabled={generando}
            onClick={generarPdf}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {generando ? "Generando…" : "Generar PDF"}
          </button>
        )}
        {puedeEditar && c?.estado !== "firmado" && (
          <>
            <button
              type="button"
              onClick={() => setEnviando(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              <Send className="w-3.5 h-3.5" />
              {c?.estado === "enviado"
                ? "Reenviar convenio"
                : "Enviar convenio"}
            </button>
            <button
              type="button"
              onClick={() => setSubiendo(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-600 text-emerald-700 hover:bg-emerald-50"
            >
              <FileUp className="w-3.5 h-3.5" />
              Subir firmado
            </button>
          </>
        )}
      </div>

      {enviando && (
        <ModalEnviar
          clientId={clientId}
          contactos={contactos}
          anterior={c?.enviado_a_contact_id ?? null}
          reenvio={c?.estado === "enviado"}
          onCerrar={() => setEnviando(false)}
          onListo={() => {
            setEnviando(false);
            refrescar();
          }}
        />
      )}
      {subiendo && (
        <ModalSubirFirmado
          clientId={clientId}
          onCerrar={() => setSubiendo(false)}
          onListo={() => {
            setSubiendo(false);
            refrescar();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// «Enviar convenio»: a la persona principal, o a otra del cliente.
// ---------------------------------------------------------------------
function ModalEnviar({
  clientId,
  contactos,
  anterior,
  reenvio,
  onCerrar,
  onListo,
}: {
  readonly clientId: string;
  readonly contactos: ContactoDelCliente[];
  readonly anterior: number | null;
  readonly reenvio: boolean;
  readonly onCerrar: () => void;
  readonly onListo: () => void;
}) {
  const inicial =
    contactos.find((k) => k.id === anterior) ??
    contactos.find((k) => k.is_primary) ??
    contactos[0];
  const [elegido, setElegido] = useState<string>(
    inicial ? String(inicial.id) : "",
  );
  const [ocupado, setOcupado] = useState(false);
  const opciones = useMemo(
    () =>
      contactos.map((k) => ({
        value: String(k.id),
        label: k.name,
        hint: k.email || "sin correo",
        chip: k.is_primary
          ? { texto: "principal", clases: "bg-blue-100 text-blue-700" }
          : undefined,
      })),
    [contactos],
  );
  const persona = contactos.find((k) => String(k.id) === elegido);
  const sinCorreo = !!persona && !persona.email;

  const enviar = async () => {
    if (!persona) return;
    setOcupado(true);
    try {
      const r = await enviarConvenio(clientId, persona.id);
      toast.success(`Convenio enviado a ${r.enviado_a}`);
      onListo();
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo enviar el convenio"));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal
      titulo={reenvio ? "Reenviar convenio" : "Enviar convenio"}
      subtitulo="Le llega un correo con el enlace para leerlo y aceptarlo en línea."
      ancho="max-w-md"
      sinTope
      onCerrar={onCerrar}
      pie={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!persona || sinCorreo || ocupado}
            onClick={enviar}
            className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {ocupado ? "Enviando…" : "Enviar"}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <label className="block text-xs text-gray-500">¿A quién?</label>
        <SelectWithSearch
          options={opciones}
          value={elegido}
          onChange={(v) => setElegido(v)}
          placeholder="Elegir persona"
          sinLimpiar
        />
        {persona?.email && (
          <p className="text-sm text-gray-700">
            Se enviará a <strong>{persona.email}</strong>.
          </p>
        )}
        {sinCorreo && (
          <p className="text-sm text-red-600">
            {persona?.name} no tiene correo: agrégalo en Contactos.
          </p>
        )}
        {reenvio && (
          <p className="text-xs text-amber-700">
            El enlace anterior deja de servir.
          </p>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// «Subir firmado»: el convenio firmado en papel.
// ---------------------------------------------------------------------
function ModalSubirFirmado({
  clientId,
  onCerrar,
  onListo,
}: {
  readonly clientId: string;
  readonly onCerrar: () => void;
  readonly onListo: () => void;
}) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [fecha, setFecha] = useState("");
  const [firmante, setFirmante] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const { arrastrando, zona } = useArrastreDeArchivos((archivos) => {
    const pdf = archivos.find((f) => f.type === "application/pdf");
    if (pdf) setArchivo(pdf);
    else toast.warn("El convenio firmado va en PDF");
  });
  // Hoy en Chile (aaaa-mm-dd): la firma no puede ser futura.
  const hoy = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Santiago",
  });

  const guardar = async () => {
    if (!archivo || !fecha) return;
    setOcupado(true);
    try {
      const subida = await uploadClientDocument(archivo, clientId);
      if (!subida.success || !subida.url) {
        throw new Error(subida.error || "No se pudo subir el archivo");
      }
      await subirConvenioFirmado(clientId, {
        file_url: subida.url,
        file_name: archivo.name,
        fecha_firma: fecha,
        firmante: firmante.trim() || undefined,
      });
      toast.success("Convenio firmado guardado");
      onListo();
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo guardar el convenio"));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal
      titulo="Subir convenio firmado"
      subtitulo="Para los que ya se firmaron en papel."
      ancho="max-w-md"
      onCerrar={onCerrar}
      pie={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!archivo || !fecha || ocupado}
            onClick={guardar}
            className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            {ocupado ? "Guardando…" : "Guardar"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <label
          {...zona}
          className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-sm cursor-pointer ${
            arrastrando
              ? "border-emerald-500 bg-emerald-50"
              : "border-gray-300 hover:border-emerald-400"
          }`}
        >
          <FileUp className="w-5 h-5 text-emerald-600" />
          <span className="font-semibold text-gray-700">
            {archivo ? archivo.name : "Elegir o soltar el PDF"}
          </span>
          <span className="text-xs text-gray-500">PDF, hasta 5 MB</span>
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Fecha de la firma</span>
          <input
            type="date"
            value={fecha}
            max={hoy}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">
            Quién firmó por el cliente (opcional)
          </span>
          <input
            type="text"
            value={firmante}
            maxLength={120}
            onChange={(e) => setFirmante(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </label>
      </div>
    </Modal>
  );
}
