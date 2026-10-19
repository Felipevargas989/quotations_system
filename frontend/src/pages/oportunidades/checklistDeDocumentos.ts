import type { DocumentoPedido } from "../../services/exigencias.service";
import type {
  AdjuntoDeOportunidad,
  DocumentoDeEmpresa,
  ResultadoDeBases,
} from "../../services/oportunidades.service";
import { normalizeText } from "../../utils/searchMatch";

// EL CHECKLIST DE DOCUMENTOS (19-10). Felipe: "un checklist documental para
// saber si tengo toda la documentación... un cruce de documentación que ya
// tengo en el sistema y documentación que debo conseguir". Cada documento
// que piden las bases contra lo que ya está: la carpeta de «Mi empresa»
// (con su vencimiento contra el cierre) y «Mi postulación» (lo que hizo la
// IA, lo firmado y lo subido a mano). Sin IA: sale igual cada vez.

export type EstadoDelDocumento =
  | "firmado"
  | "en_tu_carpeta"
  | "en_tu_postulacion"
  | "hecho"
  | "lo_arma_la_ia"
  | "vencido"
  | "falta"
  /** Un formulario que, según el análisis, no aplica (el de UTP). */
  | "no_aplica";

export interface FilaDelChecklist extends DocumentoPedido {
  estado: EstadoDelDocumento;
  detalle: string | null;
}

const normalizar = (t: string) =>
  normalizeText(t).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

/** Para un análisis de antes (sin checklist) y para lo subido a mano: a
 *  qué parte de la carpeta corresponde, por el nombre. El orden importa:
 *  las declaraciones de los trabajadores nombran el programa. */
const POR_EL_NOMBRE: ReadonlyArray<[string, RegExp]> = [
  ["patente", /patente/],
  ["inicio_actividades", /inicio( de)? actividades|iniciacion de actividades/],
  ["dj_trabajadores", /trabajador/],
  ["programa_integridad", /integridad|probidad/],
  // El F30-1 antes que el F30: «F30-1» también dice «F30». Felipe usa el
  // F30-1 para el de la Inspección del Trabajo de no tener reclamos (19-10).
  [
    "f30_1",
    /\bf ?30 ?1\b|cumplimiento de (las )?obligaciones laborales|reclamos? laborales/,
  ],
  ["f30", /\bf ?30\b|antecedentes laborales|obligaciones laborales/],
  ["f30_1", /inspeccion del trabajo/],
  ["erut", /\be ?rut\b|rut electronico/],
  ["no_quiebra", /quiebra|procedimiento concursal|boletin concursal/],
  [
    "estatutos",
    /estatutos?\b|escritura de constitucion|constitucion de (la )?sociedad/,
  ],
  ["vigencia", /certificado de vigencia|vigencia de la (sociedad|empresa)/],
  ["resolucion_sanitaria", /resolucion(es)? sanitaria|autorizacion sanitaria/],
  ["respaldo_experiencia", /orden(es)? de compra|factura|respaldo/],
];

/** El de UTP solo va si se postula como Unión Temporal de Proveedores
 *  (Felipe, 19-10: "en mi caso no es necesario que lo arme"). */
const ES_DE_UTP = /\butp\b|uniones? temporal(es)? de proveedores/;
const SOLO_SI_UTP = "Solo si postulas como Unión Temporal de Proveedores (UTP)";

/** Estar inscrito y hábil en el Registro de Proveedores (ChileProveedores)
 *  se da por hecho y no va en la lista (Felipe, 19-10: "déjalo como que
 *  siempre estará habilitado... es difícil no tener eso" y "sácalo de los
 *  documentos a entregar, no es necesario"). */
const ES_EL_REGISTRO = /registro (oficial )?de proveedores|chile ?proveedores/;

const carpetaPorElNombre = (nombre: string): string =>
  POR_EL_NOMBRE.find(([, patron]) => patron.test(normalizar(nombre)))?.[0] ??
  "otro";

/** «Formulario Anexo N°1», «Anexo_N1_Identificacion.pdf»: el número. */
const numeroDe = (t: string): string | null =>
  /\b(?:anexo|formulario|formato)\s*(?:n\s*[°º.o]*\s*)?(\d+)/.exec(
    normalizar(t),
  )?.[1] ?? null;

const GENERICAS = new Set(
  "certificado declaracion declaraciones jurada juradas simple documento vigente copia formulario anexo registro empresa oferente firmado firmada representante legal para emitido ultimos meses dias desde hasta segun bases".split(
    " ",
  ),
);
const palabrasClave = (t: string) =>
  normalizar(t)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 4 && !GENERICAS.has(p));

const ES_DOCUMENTO =
  /\b(formulario|anexo n|certificado|declaracion jurada|declaraciones juradas|copia de|patente|programa de integridad|registro|boleta|garantia|f ?30|estatutos|escritura|inicio de actividades|resolucion sanitaria)/;

const PARTE: Record<string, DocumentoPedido["parte"]> = {
  administrativo: "administrativa",
  tecnico: "tecnica",
  economico: "economica",
};

/** Para un análisis de antes del 19-10: los formularios y los requisitos
 *  que son documentos. Lo de adjudicar y pagar solo sale volviendo a
 *  analizar. */
export function documentosDeUnAnalisisAnterior(
  r: Pick<ResultadoDeBases, "requisitos" | "formularios">,
): DocumentoPedido[] {
  const formularios = (r.formularios ?? []).filter((f) => f.aplica);
  const numeros = new Set(formularios.map((f) => numeroDe(f.nombre)));
  const documentos: DocumentoPedido[] = formularios.map((f) => ({
    nombre: f.nombre,
    parte:
      f.se_entrega_en === "otra"
        ? "otra"
        : (f.se_entrega_en as DocumentoPedido["parte"]),
    cuando: "con_la_oferta",
    obligatorio: true,
    condicion: "",
    carpeta: "formulario",
    pagina: Number(/\d+/.exec(f.paginas ?? "")?.[0] ?? 0),
  }));
  for (const q of r.requisitos) {
    const texto = normalizar(q.que);
    if (!ES_DOCUMENTO.test(texto) || /^todos? (los|las)\b/.test(texto)) {
      continue;
    }
    const numero = numeroDe(q.que);
    const esFormulario = numero !== null && numeros.has(numero);
    if (!esFormulario) {
      documentos.push({
        nombre: q.que,
        parte: PARTE[q.tipo] ?? "otra",
        cuando: "con_la_oferta",
        obligatorio: q.obligatorio,
        condicion: "",
        // Un análisis de antes del 18-10 no trae los formularios: el
        // «Anexo N°1» de los requisitos es uno.
        carpeta:
          numero !== null || /^(formulario|formato)\b/.test(texto)
            ? "formulario"
            : carpetaPorElNombre(q.que),
        pagina: q.pagina,
      });
    }
    // El de experiencia pide además las copias de sus respaldos.
    if (esFormulario && /orden(es)? de compra|factura/.test(texto)) {
      documentos.push({
        nombre: "Copias de las órdenes de compra o facturas de la experiencia",
        parte: PARTE[q.tipo] ?? "tecnica",
        cuando: "con_la_oferta",
        obligatorio: q.obligatorio,
        condicion: "",
        carpeta: "respaldo_experiencia",
        pagina: q.pagina,
      });
    }
  }
  return documentos;
}

const fechaCorta = (iso: string) =>
  iso.slice(0, 10).split("-").reverse().join("-");

const ORDEN_DEL_MOMENTO = { con_la_oferta: 0, al_adjudicar: 1, al_pagar: 2 };
const ORDEN_DE_LA_PARTE = {
  administrativa: 0,
  tecnica: 1,
  economica: 2,
  otra: 3,
};

export function checklistDeDocumentos(d: {
  r: Pick<ResultadoDeBases, "requisitos" | "formularios" | "documentos">;
  carpeta: DocumentoDeEmpresa[];
  postulacion: AdjuntoDeOportunidad[];
  /** AAAA-MM-DD: el cierre (o hoy), contra el que se vence. */
  corte: string;
}): FilaDelChecklist[] {
  const pedidos = (
    d.r.documentos?.length
      ? d.r.documentos
      : documentosDeUnAnalisisAnterior(d.r)
  ).filter(
    (p) => !ES_EL_REGISTRO.test(normalizar(`${p.nombre} ${p.condicion}`)),
  );
  const masNuevo = <T extends { creado_en: string }>(xs: T[]) =>
    [...xs].sort((a, b) => b.creado_en.localeCompare(a.creado_en))[0];

  const estadoDe = (
    p: DocumentoPedido,
  ): Omit<FilaDelChecklist, keyof DocumentoPedido> => {
    const subidos = d.postulacion.filter((a) => a.origen === "subido");
    const deUtp = ES_DE_UTP.test(normalizar(`${p.nombre} ${p.condicion}`));
    if (p.carpeta === "formulario") {
      const numero = numeroDe(p.nombre);
      const suyos = d.postulacion.filter((a) =>
        numero !== null
          ? numeroDe(a.nombre) === numero
          : palabrasClave(p.nombre).some((c) =>
              normalizar(a.nombre).includes(c),
            ),
      );
      const firmado = suyos.find((a) => a.origen === "firmado");
      if (firmado) return { estado: "firmado", detalle: firmado.nombre };
      const subido = suyos.find((a) => a.origen === "subido");
      if (subido)
        return { estado: "en_tu_postulacion", detalle: subido.nombre };
      const hecho = suyos.find((a) => a.origen === "generado");
      if (hecho)
        return { estado: "hecho", detalle: "Hecho por la IA, falta firmarlo" };
      // Si el análisis dice que ese formulario no aplica, no se arma.
      const delAnalisis = (d.r.formularios ?? []).filter(
        (f) => numero !== null && numeroDe(f.nombre) === numero,
      );
      if (delAnalisis.length > 0 && delAnalisis.every((f) => !f.aplica)) {
        return {
          estado: "no_aplica",
          detalle:
            delAnalisis[0].por_que_no_aplica || (deUtp ? SOLO_SI_UTP : null),
        };
      }
      if (deUtp) return { estado: "no_aplica", detalle: SOLO_SI_UTP };
      return {
        estado: "lo_arma_la_ia",
        detalle: "Lo arma «Armar postulación»",
      };
    }
    // Un documento que el análisis dejó en «otro» se reconoce por su
    // nombre (el certificado de la Inspección del Trabajo, 19-10).
    const tipo =
      p.carpeta === "otro" ? carpetaPorElNombre(p.nombre) : p.carpeta;
    if (tipo === "respaldo_experiencia") {
      const n = d.carpeta.filter(
        (x) => x.tipo === "respaldo_experiencia",
      ).length;
      if (n > 0) {
        return {
          estado: "en_tu_carpeta",
          detalle:
            n === 1
              ? "1 respaldo en tu carpeta"
              : `${n} respaldos en tu carpeta`,
        };
      }
    } else if (tipo !== "otro") {
      const doc = masNuevo(d.carpeta.filter((x) => x.tipo === tipo));
      if (doc) {
        return doc.vence && doc.vence < d.corte
          ? {
              estado: "vencido",
              detalle: `${doc.nombre}: venció el ${fechaCorta(doc.vence)}`,
            }
          : {
              estado: "en_tu_carpeta",
              detalle: doc.vence
                ? `${doc.nombre} · vence el ${fechaCorta(doc.vence)}`
                : doc.nombre,
            };
      }
    }
    // Lo subido a mano a «Mi postulación», reconocido por el nombre.
    const claves = palabrasClave(p.nombre);
    const subido = subidos.find(
      (a) =>
        (tipo !== "otro" && carpetaPorElNombre(a.nombre) === tipo) ||
        claves.some((c) => normalizar(a.nombre).includes(c)),
    );
    if (subido) return { estado: "en_tu_postulacion", detalle: subido.nombre };
    if (deUtp) return { estado: "no_aplica", detalle: SOLO_SI_UTP };
    return { estado: "falta", detalle: null };
  };

  return pedidos
    .map((p) => ({ ...p, ...estadoDe(p) }))
    .sort(
      (a, b) =>
        ORDEN_DEL_MOMENTO[a.cuando] - ORDEN_DEL_MOMENTO[b.cuando] ||
        ORDEN_DE_LA_PARTE[a.parte] - ORDEN_DE_LA_PARTE[b.parte],
    );
}

/** Lo que ya está y lo que falta, para el encabezado. */
export const resumenDelChecklist = (filas: FilaDelChecklist[]) => {
  const conLaOferta = filas.filter(
    (f) => f.cuando === "con_la_oferta" && f.estado !== "no_aplica",
  );
  return {
    listos: conLaOferta.filter((f) =>
      ["firmado", "en_tu_carpeta", "en_tu_postulacion"].includes(f.estado),
    ).length,
    faltan: conLaOferta.filter(
      (f) => f.estado === "falta" || f.estado === "vencido",
    ).length,
    total: conLaOferta.length,
  };
};
