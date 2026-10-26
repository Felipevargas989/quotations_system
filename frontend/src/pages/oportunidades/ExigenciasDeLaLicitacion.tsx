import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, Square, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import ConfirmInline from "../../components/ConfirmInline";
import { toast } from "../../components/toast/Toast";
import {
  type MarcaDeExigencia,
  marcarExigencia,
} from "../../services/exigencias.service";
import {
  actualizarOportunidad,
  type FichaDeOportunidad,
} from "../../services/oportunidades.service";
import type {
  ArmadoDeLaOferta,
  FilaDeLaOferta,
} from "../../services/postulacion.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { normalizeText } from "../../utils/searchMatch";
import type { Exigencia } from "./exigencias";
import {
  CLASES_DEL_TONO,
  ESTADOS_DE_EXIGENCIA,
  type EstadoDeExigencia,
  resumenDeLasExigencias,
} from "./relacionDeLasBases";
import TituloDeBloque from "./TituloDeBloque";

// LAS EXIGENCIAS DE LA LICITACIÓN (19-10, migración 152). Felipe: "un
// listado de exigencias... y marcar algunos que sean como lo tengo y otro
// hay que conseguir o revisar... y si marco uno que no puedo, bueno,
// desisto". La IA sugiere (con tu carta, tus instalaciones y tu agenda); tú
// marcas ✓ lo tengo o ✗ no puedo, y queda guardado.
//
// Desde la decisión 80 (26-10) es el bloque 3 de «Bases y criterios», «Lo
// que tienes que ofrecer», y se juntó con «Lo que tienes que conseguir»
// (decisión 39). Cada exigencia tiene UN solo estado (relacionDeLasBases):
// lo que marcaste, si no cómo la ofreciste al armar la postulación, y si no
// la primera lectura de la IA; debajo, cómo la ofreces. Al final, lo que se
// le pide al proveedor, lo que hay que agregar al catálogo y los detalles
// para el comentario interno de la cotización.

const claveDeLaFicha = (id: number) => ["oportunidades", "ficha", id];

/** Lo que dice el «cómo» de la oferta, sin la marca de completar. */
const textoDeLaOferta = (como: string) =>
  /\[COMPLETAR:\s*([^\]]+)\]/i.exec(como)?.[1] ?? como;

function Plegado({
  titulo,
  children,
}: {
  readonly titulo: string;
  readonly children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
      >
        {abierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {titulo}
      </button>
      {abierto && children}
    </div>
  );
}

/** Lo que va después de la lista: el pedido al proveedor, lo que falta en
 *  el catálogo, lo de la oferta sin exigencia y los detalles. */
function LoQueSaleDeLaOferta({
  oferta,
  sinExigencia,
}: {
  readonly oferta: ArmadoDeLaOferta;
  readonly sinExigencia: FilaDeLaOferta[];
}) {
  const subcontratar = oferta.subcontratar ?? [];
  const detalles = oferta.detalles ?? [];
  const conseguir = oferta.faltan_en_el_catalogo;
  // Una oferta de antes de la decisión 57 mezclaba todo en «conseguir».
  const deAntes = oferta.subcontratar === undefined;
  return (
    <div className="space-y-3">
      {subcontratar.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-1">
          <p className="text-sm font-semibold text-amber-900">
            Para el proveedor ({subcontratar.length})
          </p>
          <ul className="text-sm text-amber-900 space-y-0.5">
            {subcontratar.map((t) => (
              <li key={t} className="flex items-start gap-1.5">
                <Square
                  size={13}
                  className="mt-1 shrink-0 text-amber-700"
                  aria-hidden="true"
                />
                {t}
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-800">
            Es un solo pedido al proveedor externo. También queda en el
            comentario interno de la cotización.
          </p>
        </div>
      )}
      {conseguir.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-1">
          <p className="text-sm font-semibold text-amber-900">
            {deAntes ? "Conseguir o subcontratar" : "Al catálogo"} (
            {conseguir.length})
          </p>
          <ul className="list-disc pl-5 text-sm text-amber-900 space-y-0.5">
            {conseguir.map((f) => (
              <li key={f.que}>
                {f.que}
                {f.por_que && (
                  <span className="text-amber-700"> · {f.por_que}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-800">
            Agrégalo al catálogo con su precio y vuelve a armar la postulación:
            así la cotización cobra lo que de verdad cuesta.
          </p>
        </div>
      )}
      {sinExigencia.length > 0 && (
        <Plegado
          titulo={`Lo demás de la oferta (${sinExigencia.length}): sin exigencia en la lista`}
        >
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-0.5">
            {sinExigencia.map((f, i) => (
              <li key={`${i}-${f.especificacion}`}>
                {f.especificacion}: {textoDeLaOferta(f.como)}
              </li>
            ))}
          </ul>
        </Plegado>
      )}
      {detalles.length > 0 && (
        <Plegado
          titulo={`Detalles para el comentario interno (${detalles.length})`}
        >
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-0.5">
            {detalles.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Plegado>
      )}
    </div>
  );
}

export default function ExigenciasDeLaLicitacion({
  oportunidadId,
  exigencias,
  estados,
  cubre,
  oferta,
  ofertaVieja,
  marcas,
  postulada,
}: {
  readonly oportunidadId: number;
  readonly exigencias: Exigencia[];
  /** Un estado por exigencia, por su clave. */
  readonly estados: Map<string, EstadoDeExigencia>;
  /** La línea de la oferta que cubre cada exigencia, por su clave. */
  readonly cubre: Map<string, FilaDeLaOferta>;
  /** La oferta de «Armar postulación», si está lista. */
  readonly oferta: ArmadoDeLaOferta | null;
  /** La oferta es de antes del último análisis de las bases. */
  readonly ofertaVieja: boolean;
  readonly marcas: Record<string, MarcaDeExigencia>;
  /** Postulada o ganada: ya no se desiste. */
  readonly postulada: boolean;
}) {
  const qc = useQueryClient();
  const [desistiendo, setDesistiendo] = useState(false);

  const ponerMarcas = (nuevas: Record<string, MarcaDeExigencia>) =>
    qc.setQueryData<FichaDeOportunidad>(claveDeLaFicha(oportunidadId), (f) =>
      f ? { ...f, exigencias_marcadas: nuevas } : f,
    );
  // Las marcas van de a una, en orden (19-10: dos clics seguidos se
  // pisaban), y cada una se pone al tiro sobre lo último que hay en
  // pantalla, no sobre lo que había al pintar.
  const marcar = useMutation({
    mutationKey: ["oportunidades", "exigencias", oportunidadId],
    scope: { id: `exigencias-${oportunidadId}` },
    mutationFn: (m: { clave: string; marca: MarcaDeExigencia | null }) =>
      marcarExigencia(oportunidadId, m.clave, m.marca),
    onMutate: (m) => {
      const ultimas =
        qc.getQueryData<FichaDeOportunidad>(claveDeLaFicha(oportunidadId))
          ?.exigencias_marcadas ?? marcas;
      const nuevas = { ...ultimas };
      if (m.marca) nuevas[m.clave] = m.marca;
      else delete nuevas[m.clave];
      ponerMarcas(nuevas);
    },
    // Lo que guardó el motor, cuando ya no queda otra marca en camino.
    onSuccess: (todas) => {
      if (
        qc.isMutating({
          mutationKey: ["oportunidades", "exigencias", oportunidadId],
        }) <= 1
      ) {
        ponerMarcas(todas);
      }
    },
    onError: (e) => {
      void qc.invalidateQueries({ queryKey: claveDeLaFicha(oportunidadId) });
      toast.error(humanizeApiError(e, "No se pudo guardar la marca."));
    },
  });
  const desistir = useMutation({
    mutationFn: () =>
      actualizarOportunidad(oportunidadId, { estado: "descartada" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: claveDeLaFicha(oportunidadId) });
      toast.success("Desististe de esta licitación: quedó en «Descartadas».");
      setDesistiendo(false);
    },
    onError: (e) => toast.error(humanizeApiError(e, "No se pudo desistir.")),
  });

  if (exigencias.length === 0) return null;
  const noPuedo = exigencias.filter((e) => marcas[e.clave] === "no_puedo");
  const estadoDe = (e: Exigencia) => estados.get(e.clave) ?? "por_revisar";
  // Lo de la oferta que no cubre ninguna exigencia (sin los formularios,
  // que van en «Lo que tienes que presentar»).
  const usadas = new Set(cubre.values());
  const sinExigencia = (oferta?.matriz ?? []).filter(
    (f) =>
      !usadas.has(f) &&
      !/^(formulario|anexo)\b/.test(normalizeText(f.especificacion)),
  );

  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">
          <TituloDeBloque numero={3}>Lo que tienes que ofrecer</TituloDeBloque>
        </h2>
        <p className="text-xs text-gray-500">
          {resumenDeLasExigencias(exigencias.map(estadoDe))}
        </p>
      </div>
      <p className="text-xs text-gray-500">
        Un solo estado por exigencia: manda lo que marcas tú; si no, cómo la
        ofreciste al armar la postulación; si no, lo que leyó la IA con tu
        carta, tus instalaciones y tu agenda.
      </p>
      {ofertaVieja && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          La oferta es de antes del último análisis de las bases: vuelve a armar
          la postulación para que salga de las bases nuevas.
        </p>
      )}

      {noPuedo.length > 0 && (
        <div className="p-3 rounded-lg border border-red-200 bg-red-50 space-y-2">
          <p className="text-sm text-red-800">
            Marcaste que no puedes cumplir:{" "}
            {noPuedo.map((e) => `«${e.que}»`).join(", ")}. Si es obligatoria, lo
            sano es desistir.
          </p>
          {!postulada &&
            (desistiendo ? (
              <ConfirmInline
                question="¿Desistes de esta licitación? Queda en «Descartadas» (se puede recuperar)."
                yesLabel="Sí, desistir"
                onYes={() => desistir.mutate()}
                onNo={() => setDesistiendo(false)}
                busy={desistir.isPending}
              />
            ) : (
              <button
                type="button"
                onClick={() => setDesistiendo(true)}
                className="px-3 py-1.5 text-sm font-semibold text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-100"
              >
                Desistir de esta licitación
              </button>
            ))}
        </div>
      )}

      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
        {exigencias.map((e) => {
          const marca = marcas[e.clave];
          const sello = ESTADOS_DE_EXIGENCIA[estadoDe(e)];
          const fila = cubre.get(e.clave);
          const detalle = fila
            ? `Ofreces: ${textoDeLaOferta(fila.como)}`
            : e.detalle;
          return (
            <li
              key={e.clave}
              className="px-3 py-2 flex flex-wrap items-start gap-3"
            >
              <span
                className={`mt-0.5 w-28 shrink-0 px-1.5 py-0.5 text-center text-[11px] font-semibold rounded ${CLASES_DEL_TONO[sello.tono]}`}
              >
                {sello.texto}
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm text-gray-800">
                  {e.que}
                  {e.pagina ? (
                    <span className="text-xs text-gray-400">
                      {" "}
                      (pág. {e.pagina})
                    </span>
                  ) : null}
                </p>
                {detalle && <p className="text-xs text-gray-500">{detalle}</p>}
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  aria-pressed={marca === "lo_tengo"}
                  onClick={() =>
                    marcar.mutate({
                      clave: e.clave,
                      marca: marca === "lo_tengo" ? null : "lo_tengo",
                    })
                  }
                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg border ${
                    marca === "lo_tengo"
                      ? "bg-green-600 border-green-600 text-white"
                      : "bg-white border-gray-200 text-gray-600 hover:bg-green-50"
                  }`}
                >
                  <Check size={12} /> Lo tengo
                </button>
                <button
                  type="button"
                  aria-pressed={marca === "no_puedo"}
                  onClick={() =>
                    marcar.mutate({
                      clave: e.clave,
                      marca: marca === "no_puedo" ? null : "no_puedo",
                    })
                  }
                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg border ${
                    marca === "no_puedo"
                      ? "bg-red-600 border-red-600 text-white"
                      : "bg-white border-gray-200 text-gray-600 hover:bg-red-50"
                  }`}
                >
                  <X size={12} /> No puedo
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {oferta && (
        <LoQueSaleDeLaOferta oferta={oferta} sinExigencia={sinExigencia} />
      )}
    </section>
  );
}
