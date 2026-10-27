import type {
  AdjuntoDeOportunidad,
  GeneracionesDeOportunidad,
  ResultadoDeValidacion,
  ValidacionDeDocumentos,
} from "../../services/oportunidades.service";
import { sePuedeFirmar } from "./oportunidades.utils";

// «TUS DOCUMENTOS» (decisión 79 del doc 17, 26-10). Felipe: "bajo cada
// formulario podría estar como el detalle de qué es lo que falta completar
// ... si es que hubiese algo que revisar". Lo que dijo la IA al llenarlo, lo
// que anotó al firmarlo y lo que encontró la última validación va bajo el
// documento del que habla (por su nombre o por su N°); lo de la validación
// que no es de ningún documento queda con «Validar todo». Una validación
// anterior a la última versión de un documento ya no habla de él: no se
// muestra y se pide validar de nuevo.

export type Requisito = ResultadoDeValidacion["requisitos"][number];

export interface NotaDelDocumento {
  texto: string;
  /** Completar: falta algo. Revisar: está, pero conviene mirarlo. */
  tono: "completar" | "revisar";
}

export type EstadoDelDocumento =
  | "firmado"
  | "por_completar"
  | "por_revisar"
  | "por_firmar"
  | "subido";

export interface DetalleDelDocumento {
  estado: EstadoDelDocumento;
  notas: NotaDelDocumento[];
  /** Por qué lo de antes ya no vale (lo editaste, o cambió después de la
   *  última validación). */
  aviso: string | null;
  /** Lo que se dejó de mostrar porque el documento cambió después: el
   *  editor lo comprueba contra su texto (reglasDeLosAvisos.ts). */
  ocultas: NotaDelDocumento[];
}

/** La última línea de lo que falta en un Word sin firmar. */
export const FALTA_LA_FIRMA = "Falta la firma.";

export interface NotasDeLaPostulacion {
  porDocumento: Map<number, DetalleDelDocumento>;
  /** De la última validación, lo que no es de ningún documento a la vista
   *  (el plazo de ejecución, un certificado de la carpeta...). */
  requisitos: Requisito[];
  otros: string[];
}

/** El N° de un formulario o anexo en un nombre o en una nota: «Formulario
 *  N°5 - Oferta económica» → 5. «Línea N°2» no es un formulario. */
export const numeroDelFormulario = (texto: string): number | null => {
  const m = /\b(?:formularios?|anexos?)\s*(?:n\s*[°º.]?\s*)?(\d{1,2})\b/i.exec(
    texto,
  );
  return m ? Number(m[1]) : null;
};

/** Primero los formularios por su N°; después lo demás, como llegó. */
export const enOrden = (
  documentos: AdjuntoDeOportunidad[],
): AdjuntoDeOportunidad[] =>
  documentos
    .map((a, i) => ({ a, i, n: numeroDelFormulario(a.nombre) ?? 100 }))
    .sort((x, y) => x.n - y.n || x.i - y.i)
    .map((x) => x.a);

/** Cuántos de los que se firman ya están firmados (lo que subiste en PDF no
 *  entra en la cuenta). */
export const cuantosFirmados = (documentos: AdjuntoDeOportunidad[]) => {
  const seFirman = documentos.filter(
    (a) => a.origen === "firmado" || sePuedeFirmar(a),
  );
  return {
    firmados: seFirman.filter((a) => a.origen === "firmado").length,
    total: seFirman.length,
  };
};

// «Firma del representante legal», «Falta firma...», «Falta la firma»: lo
// dice el estado del documento.
const ES_LA_FIRMA = /^(?:faltan?\s+(?:la\s+)?)?firma\b/i;

const momento = (iso: string | null | undefined) =>
  iso ? Date.parse(iso) : NaN;

export function notasDeLaPostulacion(
  documentos: AdjuntoDeOportunidad[],
  generaciones: GeneracionesDeOportunidad | null | undefined,
  validacion: ValidacionDeDocumentos | null | undefined,
): NotasDeLaPostulacion {
  const notas = new Map<number, NotaDelDocumento[]>(
    documentos.map((a) => [a.id, []]),
  );
  const anotar = (
    id: number,
    texto: string,
    tono: NotaDelDocumento["tono"],
  ) => {
    const lista = notas.get(id);
    const limpio = texto.trim();
    if (lista && limpio && !lista.some((n) => n.texto === limpio)) {
      lista.push({ texto: limpio, tono });
    }
  };
  const conElNumero = (n: number | null) =>
    n === null
      ? []
      : documentos.filter((a) => numeroDelFormulario(a.nombre) === n);
  const deQuienHabla = (texto: string) => {
    const porNombre = documentos.filter((a) => texto.includes(a.nombre));
    return porNombre.length > 0
      ? porNombre
      : conElNumero(numeroDelFormulario(texto));
  };

  const ocultas = new Map<number, NotaDelDocumento[]>(
    documentos.map((a) => [a.id, []]),
  );
  const ocultar = (
    id: number,
    texto: string,
    tono: NotaDelDocumento["tono"],
  ) => {
    const lista = ocultas.get(id);
    const limpio = texto.trim();
    if (lista && limpio && !lista.some((n) => n.texto === limpio)) {
      lista.push({ texto: limpio, tono });
    }
  };
  const r = validacion?.estado === "listo" ? validacion.resultado : null;
  const validadaEl = momento(validacion?.creado_en);
  const alDia = (a: AdjuntoDeOportunidad) =>
    !(momento(a.editado_en ?? a.creado_en) > validadaEl);

  // 1. Lo que la IA dejó por completar al llenarlo. Si después se editó,
  //    ya no se sabe qué quedó: lo dice la próxima validación (y si ya se
  //    validó después de editar, manda esa validación).
  const editadosConPendientes = new Set<number>();
  for (const g of [generaciones?.anexos, generaciones?.propuesta]) {
    if (g?.estado !== "listo") continue;
    for (const d of g.resultado?.documentos ?? []) {
      const a = documentos.find((x) => x.id === d.adjunto_id);
      if (!a || a.origen === "firmado") continue;
      const pendientes = d.pendientes.filter(
        (p) => !ES_LA_FIRMA.test(p.trim()),
      );
      if (a.editado_en) {
        if (pendientes.length > 0 && !(r && alDia(a))) {
          editadosConPendientes.add(a.id);
          for (const p of pendientes) ocultar(a.id, p, "completar");
        }
        continue;
      }
      for (const p of pendientes) anotar(a.id, p, "completar");
    }
  }

  // 2. Lo que anotó la IA al firmar, si habla de un formulario de esa firma.
  const firma = generaciones?.firma;
  if (firma?.estado === "listo" && firma.resultado) {
    const deEsaFirma = new Set(
      firma.resultado.documentos.map((d) => d.adjunto_id),
    );
    for (const p of firma.resultado.pendientes) {
      for (const a of conElNumero(numeroDelFormulario(p))) {
        if (deEsaFirma.has(a.id)) anotar(a.id, p, "revisar");
      }
    }
  }

  // 3. La última validación: lo que no cumple, bajo el documento del que
  //    habla, si ese documento no cambió después.
  const requisitos: Requisito[] = [];
  const otros: string[] = [];
  const viejas = new Set<number>();
  if (r) {
    for (const q of r.requisitos) {
      if (q.estado === "cumple") continue;
      const porDonde = q.donde ? deQuienHabla(q.donde) : [];
      const de =
        porDonde.length > 0
          ? porDonde
          : conElNumero(numeroDelFormulario(q.que));
      if (de.length === 0) {
        requisitos.push(q);
        continue;
      }
      const tono = q.estado === "revisar" ? "revisar" : "completar";
      for (const a of de) {
        if (alDia(a)) anotar(a.id, q.observacion || q.que, tono);
        else {
          viejas.add(a.id);
          ocultar(a.id, q.observacion || q.que, tono);
        }
      }
    }
    for (const o of r.otros_problemas) {
      const de = deQuienHabla(o);
      if (de.length === 0) {
        otros.push(o);
        continue;
      }
      for (const a of de) {
        if (alDia(a)) anotar(a.id, o, "revisar");
        else {
          viejas.add(a.id);
          ocultar(a.id, o, "revisar");
        }
      }
    }
  }

  const porDocumento = new Map<number, DetalleDelDocumento>();
  for (const a of documentos) {
    const lista = (notas.get(a.id) ?? []).sort(
      (x, y) =>
        (x.tono === "completar" ? 0 : 1) - (y.tono === "completar" ? 0 : 1),
    );
    const estado: EstadoDelDocumento =
      a.origen === "firmado"
        ? "firmado"
        : !sePuedeFirmar(a)
          ? "subido"
          : lista.some((n) => n.tono === "completar")
            ? "por_completar"
            : lista.length > 0
              ? "por_revisar"
              : "por_firmar";
    // Con algo pendiente, la firma va al final de la lista (en «por
    // firmar» ya lo dice su estado).
    if (estado === "por_completar" || estado === "por_revisar") {
      lista.push({ texto: FALTA_LA_FIRMA, tono: "completar" });
    }
    const aviso = viejas.has(a.id)
      ? "Cambió después de la última validación: vuelve a validar."
      : editadosConPendientes.has(a.id) && !(r && alDia(a))
        ? "Lo editaste: valida para ver si quedó completo."
        : null;
    porDocumento.set(a.id, {
      estado,
      notas: lista,
      aviso,
      ocultas: ocultas.get(a.id) ?? [],
    });
  }
  return { porDocumento, requisitos, otros };
}

/** Un documento con algo por hacer, para la lista de «Validar todo». */
export interface PendienteDelDocumento {
  adjunto: AdjuntoDeOportunidad;
  notas: NotaDelDocumento[];
  aviso: string | null;
}

/** «Validar todo» (decisión 84, 26-10). Felipe, con el jugo del N°4 bajo el
 *  formulario: "estas salvedades y todas saquémoslas de acá y coloquémoslas
 *  siempre en el punto 3 de validación... a mí se me pasó completamente".
 *  Lo de cada documento ya no va bajo él en «Tus documentos»: va aquí, en
 *  orden, con la firma que falta aunque no haya nada más que decir. */
export const pendientesPorDocumento = (
  documentos: AdjuntoDeOportunidad[],
  porDocumento: Map<number, DetalleDelDocumento>,
): PendienteDelDocumento[] =>
  enOrden(documentos).flatMap((adjunto) => {
    const detalle = porDocumento.get(adjunto.id);
    if (!detalle) return [];
    const notas: NotaDelDocumento[] =
      detalle.estado === "por_firmar"
        ? [{ texto: FALTA_LA_FIRMA, tono: "completar" }]
        : detalle.notas;
    return notas.length > 0 || detalle.aviso
      ? [{ adjunto, notas, aviso: detalle.aviso }]
      : [];
  });
