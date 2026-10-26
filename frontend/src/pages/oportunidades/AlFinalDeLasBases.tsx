import { Square } from "lucide-react";
import type { ResultadoDeBases } from "../../services/oportunidades.service";
import type {
  ArmadoDeLaOferta,
  FilaDeLaOferta,
} from "../../services/postulacion.service";
import { normalizeText } from "../../utils/searchMatch";
import { alertasDelAnalisis } from "./oportunidades.utils";
import Plegable from "./Plegable";
import { pedidoAlProveedor, textoDeLaOferta } from "./relacionDeLasBases";

// LO DE CONSULTA, PLEGADO AL FINAL DE «BASES Y CRITERIOS» (decisión 80 del
// doc 17, 26-10). Felipe: "me gusta que existan estos plegables... creo que
// [lo que se le pide al proveedor y lo que va al catálogo] también deberían
// estar en los plegables de abajo". Primero lo que sale de la oferta armada
// (el pedido al proveedor, lo que hay que agregar al catálogo, lo demás de
// la oferta y los detalles para el comentario interno) y después lo de las
// bases (las fechas y garantías y las otras condiciones). Cada título dice
// cuántos hay; el bloque 3 avisa que están aquí.
//
// Un solo pedido al proveedor (Felipe, 26-10: "todo lo que pusiste en
// catálogo para mí es proveedor... deja uno solo y mete todo ahí"): lo que
// una oferta de antes dejó «Al catálogo» se suma aquí (`pedidoAlProveedor`);
// desde ese día el motor ya lo junta al armar.

export default function AlFinalDeLasBases({
  r,
  oferta,
  cubre,
}: {
  readonly r: ResultadoDeBases;
  /** La oferta de «Armar postulación», si está lista. */
  readonly oferta: ArmadoDeLaOferta | null;
  /** La línea de la oferta que cubre cada exigencia. */
  readonly cubre: Map<string, FilaDeLaOferta>;
}) {
  const subcontratar = pedidoAlProveedor(oferta);
  const detalles = oferta?.detalles ?? [];
  // Lo de la oferta que no cubre ninguna exigencia (sin los formularios,
  // que van en «Lo que tienes que presentar»).
  const usadas = new Set(cubre.values());
  const sinExigencia = (oferta?.matriz ?? []).filter(
    (f) =>
      !usadas.has(f) &&
      !/^(formulario|anexo)\b/.test(normalizeText(f.especificacion)),
  );
  const { condiciones, separadas } = alertasDelAnalisis(r);
  const hayAlgo =
    subcontratar.length +
      sinExigencia.length +
      detalles.length +
      r.fechas.length +
      r.garantias.length +
      condiciones.length >
    0;
  if (!hayAlgo) return null;

  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-3">
      {subcontratar.length > 0 && (
        <Plegable titulo={`Para el proveedor (${subcontratar.length})`}>
          <ul className="text-sm text-gray-800 space-y-0.5">
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
          <p className="text-xs text-gray-500">
            Es un solo pedido al proveedor externo: todo lo que no tienes. Al
            armar la postulación queda también en el comentario interno de la
            cotización.
          </p>
        </Plegable>
      )}
      {sinExigencia.length > 0 && (
        <Plegable
          titulo={`Lo demás de la oferta (${sinExigencia.length}): sin exigencia en la lista`}
        >
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-0.5">
            {sinExigencia.map((f, i) => (
              <li key={`${i}-${f.especificacion}`}>
                {f.especificacion}: {textoDeLaOferta(f.como)}
              </li>
            ))}
          </ul>
        </Plegable>
      )}
      {detalles.length > 0 && (
        <Plegable
          titulo={`Detalles para el comentario interno (${detalles.length})`}
        >
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-0.5">
            {detalles.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Plegable>
      )}
      {(r.fechas.length > 0 || r.garantias.length > 0) && (
        <Plegable titulo="Fechas clave y garantías">
          {r.fechas.length > 0 && (
            <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {r.fechas.map((f, i) => (
                <div key={i} className="p-2 rounded-lg bg-gray-50">
                  <dt className="text-xs text-gray-500">{f.que}</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {f.cuando}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {r.garantias.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-gray-700 space-y-0.5">
              {r.garantias.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          )}
        </Plegable>
      )}
      {condiciones.length > 0 && (
        <Plegable
          titulo={
            separadas
              ? `Otras condiciones (${condiciones.length}): multas, pago, subcontratación…`
              : `Avisos (${condiciones.length}). Vuelve a analizar para separar lo que te deja fuera.`
          }
        >
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-0.5">
            {condiciones.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Plegable>
      )}
    </section>
  );
}
