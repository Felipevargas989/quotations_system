import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ClipboardList, Square } from "lucide-react";
import { useState } from "react";
import { getAnalisis } from "../../services/oportunidades.service";
import {
  type ArmadoDeLaOferta,
  getOfertaDeLaPostulacion,
  type FilaDeLaOferta,
} from "../../services/postulacion.service";
import { normalizeText } from "../../utils/searchMatch";
import { claveDeLaOferta } from "./vueltaDeLaPostulacion";

// LO QUE TIENES QUE CONSEGUIR (19-10; antes «Qué ofreces», decisión 33).
// Felipe: "eso ya está en el análisis anterior... lo que podría estar es un
// mini resumen de qué cosas están comprometidas que no tenemos certeza de
// si las tenemos... tienes que conseguirte esto y esto". Arriba, lo que
// ofreciste y no está en tu catálogo (conseguirlo o subcontratarlo) y lo
// que queda por definir. La oferta punto por punto va plegada: de ella
// salen la cotización, la propuesta técnica y los anexos, y los tres dicen
// lo mismo. Se arma con «Armar postulación»: esto solo la muestra.
//
// Desde el 20-10 (decisión 57), en tres partes: «Subcontratar», un solo
// pedido al proveedor externo con su checklist (Felipe: "siempre va a ser
// un requerimiento al proveedor"); los detalles de lo que ya vende, que van
// al comentario interno de la cotización ("no puedo hacer un producto por
// cada variación del principal"); y lo que de verdad hay que conseguir, que
// casi nunca hay. Una oferta de antes se sigue viendo como antes.

const ORIGEN: Record<
  FilaDeLaOferta["origen"],
  { texto: string; tono: string }
> = {
  catalogo: { texto: "Catálogo", tono: "bg-green-50 text-green-700" },
  subcontratar: {
    texto: "Agregar al catálogo",
    tono: "bg-amber-50 text-amber-800",
  },
  completar: { texto: "Por definir", tono: "bg-gray-100 text-gray-700" },
};

/** Lo que hay que conseguir (lo que falta en el catálogo) y lo que queda
 *  por definir, sin los formularios: esos se completan al hacer los
 *  anexos. */
const loQueHayQueConseguir = (r: ArmadoDeLaOferta) => ({
  conseguir: r.faltan_en_el_catalogo,
  subcontratar: r.subcontratar ?? [],
  detalles: r.detalles ?? [],
  /** Una oferta de antes de la decisión 57 mezclaba todo en «conseguir». */
  deAntes: r.subcontratar === undefined,
  porDefinir: r.matriz
    .filter(
      (f) =>
        f.origen === "completar" &&
        !/^(formulario|anexo)\b/.test(normalizeText(f.especificacion)),
    )
    .map(
      (f) => /\[COMPLETAR:\s*([^\]]+)\]/i.exec(f.como)?.[1] ?? f.especificacion,
    ),
});

export default function OfertaDeLaPostulacion({
  oportunidadId,
}: {
  readonly oportunidadId: number;
}) {
  const [verOferta, setVerOferta] = useState(false);
  const { data: trabajo } = useQuery({
    queryKey: claveDeLaOferta(oportunidadId),
    queryFn: () => getOfertaDeLaPostulacion(oportunidadId),
  });
  const { data: analisis } = useQuery({
    queryKey: ["oportunidades", "analisis", oportunidadId],
    queryFn: () => getAnalisis(oportunidadId),
  });
  const r = trabajo?.estado === "listo" ? trabajo.resultado : null;
  if (!trabajo || !r) return null;
  const { conseguir, subcontratar, detalles, deAntes, porDefinir } =
    loQueHayQueConseguir(r);
  const nada =
    conseguir.length === 0 &&
    subcontratar.length === 0 &&
    detalles.length === 0 &&
    porDefinir.length === 0;
  // El Día del Profesor (19-10): la oferta seguía siendo la de antes de
  // volver a analizar, con el decreto de otra licitación.
  const anteriorAlAnalisis =
    analisis?.estado === "listo" &&
    Date.parse(trabajo.creado_en) < Date.parse(analisis.creado_en);

  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-4">
      <div className="space-y-0.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <ClipboardList size={15} /> Lo que tienes que conseguir
        </h2>
        <p className="text-xs text-gray-500">
          Lo que te comprometes en esta postulación y no está en tu catálogo. Lo
          demás sale de tu catálogo.
        </p>
      </div>

      {anteriorAlAnalisis && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Esta oferta es de antes del último análisis de las bases: vuelve a
          armar la postulación para que salga de las bases nuevas.
        </p>
      )}

      {nada ? (
        <p className="text-sm text-green-800">
          Todo lo que ofreces sale de tu catálogo.
        </p>
      ) : (
        <div className="space-y-3">
          {subcontratar.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-1">
              <p className="text-sm font-semibold text-amber-900">
                Subcontratar: lo que le pides al proveedor (
                {subcontratar.length})
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
                Es un solo pedido al proveedor externo (casi siempre, el
                audiovisual). También queda en el comentario interno de la
                cotización.
              </p>
            </div>
          )}
          {detalles.length > 0 && (
            <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-1">
              <p className="text-sm font-semibold text-gray-800">
                Detalles para el comentario interno ({detalles.length})
              </p>
              <ul className="list-disc pl-5 text-sm text-gray-700 space-y-0.5">
                {detalles.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <p className="text-xs text-gray-500">
                Salen con tus productos de siempre. Quedan en el comentario
                interno de la cotización para el seguimiento.
              </p>
            </div>
          )}
          {conseguir.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-1">
              <p className="text-sm font-semibold text-amber-900">
                {deAntes ? "Conseguir o subcontratar" : "Conseguir"} (
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
                Agrégalo al catálogo con su precio y vuelve a armar la
                postulación: así la cotización cobra lo que de verdad cuesta.
              </p>
            </div>
          )}
          {porDefinir.length > 0 && (
            <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-1">
              <p className="text-sm font-semibold text-gray-800">
                Por definir ({porDefinir.length})
              </p>
              <ul className="list-disc pl-5 text-sm text-gray-700 space-y-0.5">
                {porDefinir.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setVerOferta((v) => !v)}
          aria-expanded={verOferta}
          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
        >
          {verOferta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Ver la oferta punto por punto (de aquí salen la cotización, la
          propuesta y los anexos)
        </button>
        {verOferta && (
          <div className="space-y-3">
            {r.resumen && <p className="text-sm text-gray-800">{r.resumen}</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="py-1.5 pr-3 font-semibold">Lo que piden</th>
                    <th className="py-1.5 pr-3 font-semibold">
                      Lo que ofreces
                    </th>
                    <th className="py-1.5 font-semibold">De dónde</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {r.matriz.map((f, i) => (
                    <tr key={`${i}-${f.especificacion}`} className="align-top">
                      <td className="py-1.5 pr-3 text-gray-700">
                        {f.especificacion}
                        {f.pagina > 0 && (
                          <span className="text-xs text-gray-400">
                            {" "}
                            (pág. {f.pagina})
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-gray-900">{f.como}</td>
                      <td className="py-1.5">
                        <span
                          className={`px-2 py-0.5 text-xs font-semibold rounded whitespace-nowrap ${ORIGEN[f.origen].tono}`}
                        >
                          {ORIGEN[f.origen].texto}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
