import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSignature, FileText, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { NumberInput } from "../../components/inputs";
import { toast } from "../../components/toast/Toast";
import {
  crearPropuestaTecnica,
  generarAnexos,
  getAdjuntos,
  getAnalisis,
  getCotizacionDeLaPostulacion,
  getOferente,
  type Generacion,
  type GeneracionesDeOportunidad,
  type TipoDeGeneracion,
} from "../../services/oportunidades.service";
import { getOfertaDeLaPostulacion } from "../../services/postulacion.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatCurrency } from "../../utils/currencies";
import { claveDeLaCotizacion } from "./precioDeLaPostulacion";
import EstadoDeGeneracion from "./EstadoDeGeneracion";
import FormulariosDelAnalisis from "./FormulariosDelAnalisis";
import {
  caminoDelFormulario,
  faltaEnMiEmpresa,
  queSeLlena,
  seLlena,
} from "./formulariosDelComprador";
import { desgloseDeOferta } from "./oportunidades.utils";
import { claveDeGeneraciones, useGeneraciones } from "./useGeneraciones";

// CREAR DOCUMENTOS CON IA (doc 17, sprint 3, paso 4; migración 129).
// Felipe, 17-10: "opción de subir, crear documento, adjuntar anexos (que se
// generen con IA y la firma con una foto de la firma)". Lo decidido:
//  1. el Word ORIGINAL del comprador, llenado por la IA; si el formulario
//     viene en PDF, se reescribe en Word igual al original (18-10,
//     formulariosDelComprador.ts);
//  2. la firma en dos tiempos: todo sale SIN firma a «Mi postulación»;
//  3. se parte por la propuesta técnica.
// El monto de la oferta lo pone la empresa (con IVA); sin él, la oferta
// económica queda en blanco: la IA nunca pone un precio.
// Sin casillas desde el 19-10 (Felipe: "el detalle de los documentos a
// generar está bueno... pero que me traiga los PDF y me los marque, creo
// que eso es lo innecesario"): el motor elige solo con lo que encontró el
// análisis; aquí se muestra qué se va a llenar.

export default function DocumentosConIA({
  oportunidadId,
}: {
  readonly oportunidadId: number;
}) {
  const qc = useQueryClient();
  const { data: bases = [] } = useQuery({
    queryKey: ["oportunidades", "adjuntos", oportunidadId, "bases"],
    queryFn: () => getAdjuntos(oportunidadId, "bases"),
  });
  const { data: analisis } = useQuery({
    queryKey: ["oportunidades", "analisis", oportunidadId],
    queryFn: () => getAnalisis(oportunidadId),
  });
  const { data: generaciones } = useGeneraciones(oportunidadId);
  // La misma consulta de «Mi empresa»: si falta la razón social o el RUT,
  // se dice antes de apretar (Felipe, 18-10: el botón se veía apagado sin
  // decir por qué).
  const { data: miEmpresa } = useQuery({
    queryKey: ["oportunidades", "oferente"],
    queryFn: getOferente,
  });
  const falta = faltaEnMiEmpresa(miEmpresa?.oferente);

  // Dos caminos (18-10): el Word se llena; el PDF se reescribe en Word.
  const formularios = bases.filter((a) => caminoDelFormulario(a.nombre));
  const hayAnalisis = analisis?.estado === "listo";
  // Lo que encontró el análisis de las bases (18-10): qué formularios hay,
  // en qué archivo y página. Sin definir = sin análisis o uno anterior.
  const delAnalisis = hayAnalisis ? analisis.resultado?.formularios : undefined;
  const seLlenan = formularios.filter((a) => seLlena(a.nombre, delAnalisis));
  // La oferta parte con el total de la cotización de la postulación
  // (decisión 29): lo que se escribe aquí manda.
  const { data: cotizacion } = useQuery({
    queryKey: claveDeLaCotizacion(oportunidadId),
    queryFn: () => getCotizacionDeLaPostulacion(oportunidadId),
  });
  const [escrito, setMonto] = useState<number | undefined>(undefined);
  const monto = escrito ?? cotizacion?.cotizacion?.total;
  const oferta = monto && monto > 0 ? desgloseDeOferta(monto) : null;

  const anotar = (tipo: TipoDeGeneracion, fila: Generacion) =>
    qc.setQueryData<GeneracionesDeOportunidad>(
      claveDeGeneraciones(oportunidadId),
      (antes) => ({
        anexos: antes?.anexos ?? null,
        firma: antes?.firma ?? null,
        propuesta: antes?.propuesta ?? null,
        [tipo]: fila,
      }),
    );

  const anexos = useMutation({
    mutationFn: () =>
      generarAnexos(oportunidadId, {
        ...(oferta ? { monto_total: oferta.total } : {}),
      }),
    onSuccess: (fila) => anotar("anexos", fila),
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudieron generar los anexos.")),
  });

  const propuesta = useMutation({
    mutationFn: () => crearPropuestaTecnica(oportunidadId),
    onSuccess: (fila) => anotar("propuesta", fila),
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo crear la propuesta.")),
  });

  // Si la oferta se volvió a armar después de un documento, ese documento
  // ya no dice lo mismo (decisión 33): hay que volver a generarlo.
  const { data: armada } = useQuery({
    queryKey: ["oportunidades", "oferta", oportunidadId],
    queryFn: () => getOfertaDeLaPostulacion(oportunidadId),
  });
  const cambioLaOferta = (g?: { estado: string; creado_en: string } | null) =>
    Boolean(
      g?.estado === "listo" &&
        armada?.estado === "listo" &&
        g.creado_en < (armada.terminado_en ?? armada.creado_en),
    );
  const desactualizado = (
    <p className="text-xs font-semibold text-amber-700">
      Se hizo antes de la última oferta: vuelve a generarlo para que diga lo
      mismo.
    </p>
  );

  const llenando =
    generaciones?.anexos?.estado === "procesando" || anexos.isPending;
  const escribiendo =
    generaciones?.propuesta?.estado === "procesando" || propuesta.isPending;

  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-4">
      <div className="space-y-0.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Sparkles size={15} /> Crear documentos con IA
        </h2>
        <p className="text-xs text-gray-500">
          La IA llena los anexos del comprador y escribe la propuesta técnica
          con los datos de «Mi empresa». Todo queda <b>sin firma</b> en «Mi
          postulación»: revísalo y recién ahí fírmalo. La IA propone; lo que se
          presenta lo decides tú.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 p-4 space-y-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <FileText size={14} /> Anexos del comprador
          </h3>
          {formularios.length === 0 ? (
            <p className="text-sm text-gray-500">
              Sube a «Bases y anexos» los formularios del comprador, en Word o
              PDF.
            </p>
          ) : (
            <>
              {delAnalisis && delAnalisis.length > 0 && (
                <FormulariosDelAnalisis formularios={delAnalisis} />
              )}
              <p className="text-xs text-gray-500">
                {queSeLlena({
                  hayAnalisis,
                  delAnalisis,
                  seLlenan: seLlenan.length,
                })}
              </p>
            </>
          )}

          <div className="space-y-1">
            <label
              htmlFor="monto-de-la-oferta"
              className="block text-xs font-semibold text-gray-700"
            >
              Monto total de la oferta, con IVA (opcional)
            </label>
            <NumberInput
              id="monto-de-la-oferta"
              value={monto}
              onChange={setMonto}
              min={1}
              currency
              placeholder="Ej: 11.900.000"
              disabled={llenando}
            />
            <p className="text-xs text-gray-500">
              {oferta
                ? `Neto ${formatCurrency(oferta.neto, "CLP")} + IVA ${formatCurrency(oferta.iva, "CLP")}.`
                : "Sin monto, la oferta económica queda en blanco: la IA nunca pone un precio."}
            </p>
          </div>

          {falta && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              {falta}{" "}
              <Link
                to="/oportunidades"
                onClick={() => {
                  try {
                    sessionStorage.setItem(
                      "op.pestana",
                      JSON.stringify({ p: "empresa" }),
                    );
                  } catch {
                    /* sin memoria de pestaña: abre en la bandeja */
                  }
                }}
                className="font-semibold underline"
              >
                Ir a «Mi empresa»
              </Link>
            </p>
          )}
          <button
            type="button"
            onClick={() => anexos.mutate()}
            disabled={llenando || seLlenan.length === 0 || Boolean(falta)}
            title={
              falta ??
              (seLlenan.length === 0
                ? "Todavía no hay formularios para llenar"
                : undefined)
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {llenando ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            {generaciones?.anexos ? "Volver a generar" : "Generar anexos"}
          </button>
          {generaciones?.anexos && (
            <p className="text-xs text-gray-400">
              Cada vez deja una versión nueva en «Mi postulación».
            </p>
          )}
          <EstadoDeGeneracion tipo="anexos" generacion={generaciones?.anexos} />
          {cambioLaOferta(generaciones?.anexos) && desactualizado}
        </div>

        <div className="rounded-lg border border-gray-200 p-4 space-y-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <FileSignature size={14} /> Propuesta técnica
          </h3>
          <p className="text-sm text-gray-600">
            Un Word nuevo que responde punto por punto a las especificaciones
            técnicas de las bases, con el logo y los datos de «Mi empresa». Sin
            precios. Si armaste «La oferta», se escribe desde ella. Lo que solo
            tú sabes queda marcado [COMPLETAR].
          </p>
          <button
            type="button"
            onClick={() => propuesta.mutate()}
            disabled={escribiendo || !hayAnalisis}
            title={!hayAnalisis ? "Primero analiza las bases" : undefined}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {escribiendo ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            {generaciones?.propuesta
              ? "Volver a crear"
              : "Crear propuesta técnica"}
          </button>
          {!hayAnalisis && (
            <p className="text-xs text-gray-500">
              Primero analiza las bases: la propuesta responde a lo que piden.
            </p>
          )}
          <EstadoDeGeneracion
            tipo="propuesta"
            generacion={generaciones?.propuesta}
          />
          {cambioLaOferta(generaciones?.propuesta) && desactualizado}
        </div>
      </div>
    </section>
  );
}
