import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "../../components/toast/Toast";
import {
  type MarcaDeExigencia,
  marcarExigencia,
} from "../../services/exigencias.service";
import type { FichaDeOportunidad } from "../../services/oportunidades.service";
import type { FilaDeLaOferta } from "../../services/postulacion.service";
import { humanizeApiError } from "../../utils/apiErrors";
import type { Exigencia } from "./exigencias";
import {
  CLASES_DEL_TONO,
  ESTADOS_DE_EXIGENCIA,
  type EstadoDeExigencia,
  resumenDeLasExigencias,
  textoDeLaOferta,
} from "./relacionDeLasBases";
import DesistirDeLaLicitacion from "./DesistirDeLaLicitacion";
import LoTengoONoPuedo from "./LoTengoONoPuedo";
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
// la primera lectura de la IA; debajo, cómo la ofreces. El pedido al
// proveedor (una sola lista: todo lo que no tienes) y los detalles para el
// comentario interno van plegados al final de la pestaña
// (AlFinalDeLasBases); aquí, una línea que dice cuántas cosas pedir.

const claveDeLaFicha = (id: number) => ["oportunidades", "ficha", id];

export default function ExigenciasDeLaLicitacion({
  oportunidadId,
  exigencias,
  estados,
  cubre,
  pedido,
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
  /** Cuántas cosas hay que pedirle al proveedor (plegado al final). */
  readonly pedido: number;
  /** La oferta es de antes del último análisis de las bases. */
  readonly ofertaVieja: boolean;
  readonly marcas: Record<string, MarcaDeExigencia>;
  /** Postulada o ganada: ya no se desiste. */
  readonly postulada: boolean;
}) {
  const qc = useQueryClient();

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

  if (exigencias.length === 0) return null;
  const noPuedo = exigencias.filter((e) => marcas[e.clave] === "no_puedo");
  const estadoDe = (e: Exigencia) => estados.get(e.clave) ?? "por_revisar";
  // Lo que quedó plegado al final de la pestaña: el pedido al proveedor.
  const paraElProveedor = pedido;

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
          {!postulada && (
            <DesistirDeLaLicitacion oportunidadId={oportunidadId} />
          )}
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
              <LoTengoONoPuedo
                marca={marca}
                onMarcar={(nueva) =>
                  marcar.mutate({ clave: e.clave, marca: nueva })
                }
              />
            </li>
          );
        })}
      </ul>

      {paraElProveedor > 0 && (
        <p className="text-xs text-gray-500">
          El pedido al proveedor ({paraElProveedor}) está plegado al final de la
          pestaña.
        </p>
      )}
    </section>
  );
}
