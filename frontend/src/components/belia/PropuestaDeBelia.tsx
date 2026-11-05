import {
  Check,
  Lightbulb,
  Mail,
  NotebookPen,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { PropuestaEnPantalla } from "./useBelia";

// LA TARJETA DE UNA PROPUESTA (doc 20 §8, fase 2): el antes y el después,
// el total y la diferencia, las cuotas, los avisos en ámbar y «Sí, aplicar»
// en azul. Nada se guarda hasta ese clic, y el motor vuelve a revisar todo
// al aplicar. Las líneas largas (una minuta de dos semanas) van plegadas.

type Props = {
  p: PropuestaEnPantalla;
  /** La persona tiene abierta esta misma cotización: al aplicar, la
   *  página se recarga. */
  esLaAbierta: boolean;
  onAplicar: () => void;
  onDescartar: () => void;
  onDeshacer: () => void;
  alNavegar?: () => void;
};

const LINEAS_A_LA_VISTA = 5;

export default function PropuestaDeBelia({
  p,
  esLaAbierta,
  onAplicar,
  onDescartar,
  onDeshacer,
  alNavegar,
}: Props) {
  const [todas, setTodas] = useState(false);
  const lineas = todas ? p.lineas : p.lineas.slice(0, LINEAS_A_LA_VISTA);
  const ocultas = p.lineas.length - lineas.length;
  const enviando = p.estado === "enviando";
  const esNota = p.tipo === "nota";
  const esNueva = p.tipo === "cotizacion_nueva";
  // «Prepárame el seguimiento» (doc 20 §17): el borrador en el hilo.
  const esSeguimiento = p.tipo === "seguimiento";
  // Lo que aprende de las correcciones (doc 20 §17): anotar una lección y,
  // administración, aprobarla, descartarla u olvidarla.
  const esLeccion = p.tipo === "leccion";
  const esDecision = p.tipo === "leccion_estado";
  const deLeccion = esLeccion || esDecision;
  const Icono = esSeguimiento ? Mail : deLeccion ? Lightbulb : NotebookPen;
  const siDeLaDecision = {
    aprobar: "Sí, aprobar",
    descartar: "Sí, descartar",
    olvidar: "Sí, olvidar",
  }[p.leccion?.decision ?? "aprobar"];

  return (
    <article className="rounded-2xl border border-blue-200 bg-white text-sm shadow-sm">
      <header className="flex items-center gap-2 rounded-t-2xl bg-blue-50 px-3.5 py-2">
        <Icono
          size={15}
          className="shrink-0 text-blue-700"
          aria-hidden="true"
        />
        <p className="min-w-0 flex-1 truncate font-semibold text-slate-800">
          {esNota
            ? "Nota en la bitácora"
            : esLeccion
              ? "Lección para BelIA"
              : esDecision
                ? p.resumen
                : esSeguimiento
                  ? "Seguimiento por correo"
                  : esNueva
                    ? p.nueva?.es === "requerimiento"
                      ? "Requerimiento nuevo"
                      : "Cotización nueva"
                    : "Propuesta"}
          {p.enlace && p.numero != null && (
            <>
              {" · "}
              <Link
                to={p.enlace}
                onClick={alNavegar}
                className="text-blue-600 underline underline-offset-2 hover:text-blue-800"
              >
                N° {p.numero}
              </Link>
            </>
          )}
          {p.cliente ? ` · ${p.cliente}` : ""}
        </p>
      </header>

      <div className="space-y-2.5 px-3.5 py-3">
        {!esNota && !deLeccion && (
          <p className="font-medium text-slate-800">{p.resumen}</p>
        )}

        {deLeccion && p.leccion && (
          <div className="space-y-1">
            <p className="rounded-lg border-l-4 border-amber-300 bg-amber-50 px-3 py-2 text-slate-800">
              {p.leccion.texto}
            </p>
            <p className="text-xs text-slate-500">
              Vale para {p.leccion.para}
              {p.leccion.propuesta_por
                ? ` · la propuso ${p.leccion.propuesta_por}`
                : ""}
            </p>
            {p.leccion.motivo && (
              <p className="text-xs text-slate-500">
                Salió de: {p.leccion.motivo}
              </p>
            )}
          </div>
        )}

        {esNueva && p.nueva && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-lg bg-slate-50 px-2.5 py-2 text-xs">
            <dt className="text-slate-500">Cliente</dt>
            <dd className="text-slate-800">
              {p.nueva.cliente}
              {p.nueva.cliente_nuevo && (
                <span className="ml-1.5 text-emerald-700">cliente nuevo</span>
              )}
            </dd>
            <dt className="text-slate-500">Evento</dt>
            <dd className="text-slate-800">{p.nueva.tipo_de_evento}</dd>
            <dt className="text-slate-500">Fecha</dt>
            <dd className="text-slate-800">{p.nueva.fechas}</dd>
            <dt className="text-slate-500">Personas</dt>
            <dd className="text-slate-800">{p.nueva.personas}</dd>
            {p.nueva.contacto && (
              <>
                <dt className="text-slate-500">Contacto</dt>
                <dd className="text-slate-800">{p.nueva.contacto}</dd>
              </>
            )}
          </dl>
        )}

        {esNota && p.nota && (
          <div className="space-y-1">
            <p className="whitespace-pre-wrap text-slate-800">{p.nota.texto}</p>
            <p className="text-xs text-slate-500">
              Canal: {p.nota.canal}
              {p.nota.proximo_contacto
                ? ` · próximo contacto: ${p.nota.proximo_contacto}`
                : ""}
            </p>
          </div>
        )}

        {lineas.length > 0 && (
          <ul className="space-y-2">
            {lineas.map((l, i) => (
              <li key={i} className="rounded-lg bg-slate-50 px-2.5 py-2">
                <p className="text-xs font-medium text-slate-500">{l.dia}</p>
                <p className="font-medium text-slate-800">
                  {l.que}
                  {l.casilla === "nueva" && (
                    <span className="ml-1.5 text-xs font-normal text-emerald-700">
                      casilla nueva
                    </span>
                  )}
                  {l.casilla === "sale" && (
                    <span className="ml-1.5 text-xs font-normal text-rose-700">
                      sale
                    </span>
                  )}
                </p>
                {l.quita.map((x, k) => (
                  <p key={`q${k}`} className="text-rose-700">
                    − {x}
                  </p>
                ))}
                {l.agrega.map((x, k) => (
                  <p key={`a${k}`} className="text-emerald-700">
                    + {x}
                  </p>
                ))}
                {l.personas && <p className="text-slate-700">{l.personas}</p>}
              </li>
            ))}
          </ul>
        )}
        {ocultas > 0 && (
          <button
            type="button"
            onClick={() => setTodas(true)}
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            Ver los otros {ocultas} cambios
          </button>
        )}

        {p.total && esNueva && (
          <p className="flex items-baseline gap-x-1.5 border-t border-slate-100 pt-2 text-slate-700">
            <span>Total</span>
            <span className="whitespace-nowrap font-semibold text-slate-900">
              {p.total.despues}
            </span>
          </p>
        )}
        {p.total && !esNueva && (
          <p className="flex flex-wrap items-baseline gap-x-1.5 border-t border-slate-100 pt-2 text-slate-700">
            <span>Total</span>
            <span className="whitespace-nowrap">{p.total.antes}</span>
            <span aria-hidden="true">→</span>
            <span className="whitespace-nowrap font-semibold text-slate-900">
              {p.total.despues}
            </span>
            <span className="whitespace-nowrap text-xs text-slate-500">
              ({p.total.diferencia})
            </span>
          </p>
        )}

        {p.cuotas && p.cuotas.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1 font-medium">Cuota</th>
                <th className="py-1 font-medium">Vence</th>
                <th className="py-1 text-right font-medium">Antes</th>
                <th className="py-1 text-right font-medium">Después</th>
              </tr>
            </thead>
            <tbody>
              {p.cuotas.map((c) => (
                <tr key={c.cuota} className="border-t border-slate-100">
                  <td className="py-1">{c.cuota}</td>
                  <td className="whitespace-nowrap py-1">{c.vence ?? "—"}</td>
                  <td className="whitespace-nowrap py-1 text-right">
                    {c.antes}
                  </td>
                  <td
                    className={`whitespace-nowrap py-1 text-right ${c.antes !== c.despues ? "font-semibold text-slate-900" : ""}`}
                  >
                    {c.despues}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(p.cuota_nueva || p.reembolso_nuevo || p.reembolso_compensado) && (
          <div className="space-y-0.5 text-xs text-slate-700">
            {p.cuota_nueva && <p>Nace una cuota nueva de {p.cuota_nueva}.</p>}
            {p.reembolso_nuevo && (
              <p>Queda un reembolso pendiente de {p.reembolso_nuevo}.</p>
            )}
            {p.reembolso_compensado && (
              <p>
                Se compensa un reembolso pendiente de {p.reembolso_compensado}.
              </p>
            )}
          </div>
        )}

        {(p.avisos.length > 0 || (esLaAbierta && p.estado === "pendiente")) && (
          <ul className="space-y-1 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
            {esLaAbierta && p.estado === "pendiente" && (
              <li className="flex gap-1.5">
                <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                Tienes esta cotización abierta: al aplicar, la página se
                recarga. Si tienes cambios sin guardar, guárdalos antes.
              </li>
            )}
            {p.avisos.map((a, i) => (
              <li key={i} className="flex gap-1.5">
                <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                {a}
              </li>
            ))}
          </ul>
        )}

        {p.mensaje && (
          <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
            {p.mensaje}
          </p>
        )}

        {(p.estado === "pendiente" || enviando) && (
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onAplicar}
              disabled={enviando}
              className="min-h-[40px] flex-1 rounded-xl bg-blue-600 px-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {enviando
                ? esSeguimiento
                  ? "Escribiendo el borrador…"
                  : "Aplicando…"
                : esNota || esLeccion
                  ? "Sí, anotar"
                  : esDecision
                    ? siDeLaDecision
                    : esSeguimiento
                      ? "Sí, dejar el borrador"
                      : esNueva
                        ? "Sí, crear"
                        : "Sí, aplicar"}
            </button>
            <button
              type="button"
              onClick={onDescartar}
              disabled={enviando}
              className="min-h-[40px] rounded-xl px-4 font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
            >
              No
            </button>
          </div>
        )}
        {p.estado === "aplicada" && (
          <div className="flex items-center gap-2 pt-1 text-emerald-700">
            <Check size={16} aria-hidden="true" />
            <p className="flex-1 font-medium">
              {esNota || esLeccion
                ? "Anotada"
                : esSeguimiento || esDecision
                  ? "Listo"
                  : esNueva
                    ? "Creada"
                    : "Aplicada"}
              {p.total_final ? ` · total ${p.total_final}` : ""}
            </p>
            {p.se_puede_deshacer && (
              <button
                type="button"
                onClick={onDeshacer}
                className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                <RotateCcw size={13} aria-hidden="true" />
                Deshacer
              </button>
            )}
          </div>
        )}
        {p.estado === "aplicada" && p.aviso && (
          <p className="text-xs text-slate-600" role="status">
            {p.aviso}
          </p>
        )}
        {p.estado === "deshecha" && (
          <p className="pt-1 font-medium text-slate-600">
            Deshecha: la cotización volvió a como estaba
            {p.total_final ? ` (total ${p.total_final})` : ""}.
          </p>
        )}
        {p.estado === "descartada" && (
          <p className="pt-1 text-slate-500">
            No se aplicó.
            {!deLeccion &&
              " Si me cuentas por qué, lo aprendo para la próxima."}
          </p>
        )}

        {!esNota && !deLeccion && p.estado === "pendiente" && (
          <p className="text-xs text-slate-400">
            Queda anotado en la bitácora, a pedido tuyo.
          </p>
        )}
      </div>
    </article>
  );
}
