import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

// EL CONVENIO DEL CLIENTE Y SUS DOCUMENTOS (doc 24, 19-11-2026).
// Con sesión: la ficha del cliente. Sin sesión: la página pública del
// convenio, con el enlace personal que llega por correo.

export interface Beneficio {
  titulo: string;
  detalle?: string | null;
}

export interface EstadoDelConvenio {
  /** La empresa tiene una plantilla de convenio: si no, no hay tarjeta. */
  ofrece: boolean;
  plantilla: {
    nombre: string;
    titulo: string;
    vigencia_anios: number;
    beneficios: Beneficio[];
  } | null;
  convenio: {
    estado: "enviado" | "firmado";
    origen: "en_linea" | "papel" | null;
    enviado_a_correo: string | null;
    enviado_a_nombre: string | null;
    enviado_a_contact_id: number | null;
    enviado_at: string | null;
    firmado_at: string | null;
    vence_at: string | null;
    firmante_nombre: string | null;
    firmante_cargo: string | null;
    pdf_pendiente: boolean;
    documento: { id: number; file_url: string; file_name: string } | null;
  } | null;
}

export interface DocumentoDelCliente {
  id: number;
  file_name: string;
  file_url: string;
  categoria: "convenio" | "otros";
  subido_por_nombre: string | null;
  uploaded_at: string;
}

const base = (clientId: string) => `/clients/${clientId}`;

export const getConvenio = async (
  clientId: string,
): Promise<EstadoDelConvenio> =>
  (await apiRequest(`${base(clientId)}/convenio`, "GET")) as EstadoDelConvenio;

export const enviarConvenio = async (
  clientId: string,
  contactId: number,
): Promise<{ enviado_a: string }> =>
  (await apiRequest(`${base(clientId)}/convenio/enviar`, "POST", {
    contact_id: contactId,
  })) as { enviado_a: string };

export const subirConvenioFirmado = async (
  clientId: string,
  datos: {
    file_url: string;
    file_name: string;
    fecha_firma: string;
    firmante?: string;
  },
): Promise<void> => {
  await apiRequest(
    `${base(clientId)}/convenio/firmado-en-papel`,
    "POST",
    datos,
  );
};

export const generarPdfDelConvenio = async (clientId: string) => {
  await apiRequest(`${base(clientId)}/convenio/generar-pdf`, "POST");
};

export const getDocumentosDelCliente = async (
  clientId: string,
): Promise<DocumentoDelCliente[]> =>
  ((await apiRequest(`${base(clientId)}/documentos`, "GET")) ||
    []) as DocumentoDelCliente[];

export const agregarDocumentoDelCliente = async (
  clientId: string,
  doc: { file_url: string; file_name: string },
): Promise<void> => {
  await apiRequest(`${base(clientId)}/documentos`, "POST", doc);
};

export const borrarDocumentoDelCliente = async (
  clientId: string,
  id: number,
): Promise<void> => {
  await apiRequest(`${base(clientId)}/documentos/${id}`, "DELETE");
};

// ---- La página pública ----

export type ConvenioPublico =
  | {
      estado: "pendiente";
      empresa: { nombre: string; logo: string | null; color: string };
      titulo: string;
      beneficios: Beneficio[];
      vigencia_anios: number;
      razon_social: string;
      texto: string;
    }
  | {
      estado: "firmado";
      empresa: { nombre: string; logo: string | null; color: string };
      firmado_el: string | null;
    };

export interface FormularioDeConvenio {
  razon_social: string;
  rut_empresa: string;
  representante_nombre: string;
  representante_rut: string;
  representante_cargo: string;
  correo: string;
  domicilio: string;
  comuna: string;
  region: string;
  personeria_documento?: string;
  personeria_fecha?: string;
  personeria_notario?: string;
  acepto: boolean;
}

export const getConvenioPublico = async (
  token: string,
): Promise<ConvenioPublico> =>
  (await apiRequest(
    `${API_ROUTES.CONVENIO_PUBLICO}/${encodeURIComponent(token)}`,
    "GET",
  )) as ConvenioPublico;

export const aceptarConvenio = async (
  token: string,
  datos: FormularioDeConvenio,
): Promise<{ firmado: true; firmado_el: string; vence_el: string }> =>
  (await apiRequest(
    `${API_ROUTES.CONVENIO_PUBLICO}/${encodeURIComponent(token)}/aceptar`,
    "POST",
    datos,
  )) as { firmado: true; firmado_el: string; vence_el: string };

/** «19-11-2026» desde una fecha ISO (o aaaa-mm-dd), en hora de Chile. */
export const fechaCl = (f: string | null | undefined): string => {
  if (!f) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(f)) {
    const [a, m, d] = f.split("-");
    return `${d}-${m}-${a}`;
  }
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(f));
  const de = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${de("day")}-${de("month")}-${de("year")}`;
};
