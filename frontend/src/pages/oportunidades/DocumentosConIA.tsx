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
  getOferente,
  type Generacion,
  type GeneracionesDeOportunidad,
  type TipoDeGeneracion,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatCurrency } from "../../utils/currencies";
import EstadoDeGeneracion from "./EstadoDeGeneracion";
import {
  caminoDelFormulario,
  faltaEnMiEmpresa,
  marcadoDePartida,
  QUE_LE_PASA,
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
  const [eleccion, setEleccion] = useState<ReadonlyMap<number, boolean>>(
    new Map(),
  );
  const marcado = (a: { id: number; nombre: string }) =>
    eleccion.get(a.id) ?? marcadoDePartida(a.nombre);
  const elegidos = formularios.filter(marcado);
  const [monto, setMonto] = useState<number | undefined>(undefined);
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
        adjuntos: elegidos.map((a) => a.id),
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

  const llenando =
    generaciones?.anexos?.estado === "procesando" || anexos.isPending;
  const escribiendo =
    generaciones?.propuesta?.estado === "procesando" || propuesta.isPending;
  const hayAnalisis = analisis?.estado === "listo";

  const alternar = (a: { id: number; nombre: string }) =>
    setEleccion((antes) => new Map(antes).set(a.id, !marcado(a)));

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
              <p className="text-xs text-gray-500">
                Marca los formularios. Los Word se llenan en el mismo archivo.
                Los PDF (también escaneados, o los que vienen al final de las
                bases) se reescriben en Word con el texto oficial al pie de la
                letra y el logo.
              </p>
              <ul className="space-y-1">
                {formularios.map((a) => {
                  const camino = caminoDelFormulario(a.nombre);
                  return (
                    <li key={a.id}>
                      <label className="flex items-center gap-2 text-sm text-gray-800">
                        <input
                          type="checkbox"
                          checked={marcado(a)}
                          onChange={() => alternar(a)}
                          disabled={llenando}
                        />
                        <span className="truncate" title={a.nombre}>
                          {a.nombre}
                        </span>
                        {camino && (
                          <span className="shrink-0 text-xs text-gray-400">
                            {QUE_LE_PASA[camino]}
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
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
            disabled={llenando || elegidos.length === 0 || Boolean(falta)}
            title={
              falta ??
              (elegidos.length === 0
                ? "Marca al menos un formulario"
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
        </div>

        <div className="rounded-lg border border-gray-200 p-4 space-y-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <FileSignature size={14} /> Propuesta técnica
          </h3>
          <p className="text-sm text-gray-600">
            Un Word nuevo que responde punto por punto a las especificaciones
            técnicas de las bases, con el logo y los datos de «Mi empresa». Sin
            precios. Lo que solo tú sabes queda marcado [COMPLETAR].
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
        </div>
      </div>
    </section>
  );
}
